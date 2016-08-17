// EXTERNAL DEPENDENCIES
var request = require('request-promise');
var argv = require('minimist')(process.argv.slice(2));
var Q = require('q');
var lodash = require('lodash');
var path = require('path');

// PRIVATE VARIABLES
var username, password, isInit, isAuthed, cookie;
var protocol, server, port;
var loginResource, maintenanceResource, restBase, installLocation, verbose;

// A function to get the fully qualified url of the structr server
var url = function () {
    return [protocol, server, !isNaN(port) ? ":" + port : ""].join("");
};

// A function to provide consistent request options
var getOptions = function () {
    return {
        json: true,
        headers: {Cookie: cookie},
        resolveWithFullResponse: true
    };
};

// A function to authenticate the user
var authenticate = function (thisStructr) {
    thisStructr.log("Server:", server + ":" + port);
    if (isInit !== true) {
        //even though we could return a rejected promise, it's better to unrecoverably fail here, since it's likely a code problem, and not an functional issue.
        throw new Error("Cannot authenticate if not initialized; please initialize first");
    }

    loginOptions = {
        json: true,
        body: {
            name: username,
            password: password
        },
        resolveWithFullResponse: true
    };

    return request.post(url() + '/' + loginResource, loginOptions)
        .then(function (response) {
            if (!response.headers) {
                var errNoSession = new Error("ERR_SESSION: could not secure a session ticket.", -1);
                throw errNoSession;
            }
            isAuthed = true;
            thisStructr.log("Authentication successful for user:", username);

            //now attach the rest & backup methods
            cookie = response.headers['set-cookie'][0];
            return true;
        })
        .catch(function (err) {
            var errAuthFailed = new Error("ERR_AUTH: Authentication Failed for user: " + username);
            errAuthFailed.statusCode = err.error.code;
            errAuthFailed.causedBy = err.error;
            thisStructr.log("Authentication failed for user:", username);
            return Q.reject(errAuthFailed);
            //process.exit(errAuthFailed);
        });
};

var publishers = {
    "s3": {
        checkFile: function (localfile, s3Params) {
            var that = this;
            //verify a client
            if (!that.s3client) {
                return Q.reject(new Error("No Active S3 Client, make sure to call 'createClient' with your credenatials"));
            }

            return Q.promise(function (resolvePromise, rejectPromise) {
                //here we're just getting the list from the bucket that will be used
                var listParams = {
                    "s3Params": {
                        "Bucket": s3Params.Bucket,
                        //"Prefix": s3Params.Key
                    }
                };
                var searchResult =false
                var bucketList = that.s3client.listObjects(listParams);

                bucketList.on('error', function (err) {
                    rejectPromise(err);
                });
                bucketList.on('data', function (data) {
                    //inspect the result to see if the file we're looking for is present
                    try{
                        if (data && data.Contents[0].Key === s3Params.Key) {
                            searchResult=true;
                        }
                        //structr.log("progress", bucketList.progressAmount, bucketList.progressTotal);
                    }
                    catch(e){
                        rejectPromise(e);
                    }
                });
                bucketList.on('end', function () {
                    //if we got here, we didn't find it.
                    try{

                    resolvePromise(searchResult);
                    }
                    catch(e){
                        debugger;
                    }
                });

            })

        },
        upload: function (localFile, s3Params, force) {
            var that = this;
            //verify a client
            if (!that.s3client) {
                return Q.reject(new Error("No Active S3 Client, make sure to call 'createClient' with your credenatials"));
            }

            if (force === undefined) {
                force = false;
            }

            //1) check the file exists in the s3bucket
            try {
                return that.checkFile(localFile, s3Params)
                    .then(function (fileExistsAlready) {
                        if ((fileExistsAlready && force === true)|| !fileExistsAlready) {
                            return
                        }
                        else {
                            return Q.reject(new Error("The requested for upload already exists an force option not used"));
                        }
                    })
                    .then(function () {
                        var params = {
                            localFile: localFile,
                            s3Params: s3Params
                        };

                        return Q.promise(function (resolvePromise, rejectPromise) {
                            var uploader = that.s3client.uploadFile(params);

                            uploader.on('error', function (err) {
                                rejectPromise(err);
                            });
                            uploader.on('progress', function () {
                                structr.log("progress", uploader.progressMd5Amount,
                                    uploader.progressAmount, uploader.progressTotal);
                            });
                            uploader.on('end', function () {
                                resolvePromise(localFile)
                            });

                        })

                    });
            }
            catch (e) {
                return Q.reject(e);
            }
        },
        createClient: function (accessKey, secretAccessKey) {
            try {
                if (!this.s3) {
                    this.s3 = require('s3');
                }

                if (!this.s3Client) {
                    this.s3client = this.s3.createClient({
                        maxAsyncS3: 20,     // this is the default
                        s3RetryCount: 3,    // this is the default
                        s3RetryDelay: 1000, // this is the default
                        multipartUploadThreshold: 20971520, // this is the default (20 MB)
                        multipartUploadSize: 15728640, // this is the default (15 MB)
                        s3Options: {
                            accessKeyId: accessKey,
                            secretAccessKey: secretAccessKey,
                            // any other options are passed to new AWS.S3()
                            // See: http://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/Config.html#constructor-property
                        }
                    });
                }

                return Q.resolve(this.s3client);
            }
            catch (e) {
                return Q.reject(e);
            }
        }
    }
};

// The purpose of this library
var structr = {
    rest: {
        get: function (entity, view, urlOptions) {
            var urlBits = [url(), restBase, entity];
            if (view) urlBits.push(view);
            if (urlOptions) urlBits.push(urlOptions);
            return request.get(urlBits.join("/"), getOptions());
        },
        post: function (entity, data) {
            var urlBits = [url(), restBase, entity];
            var postOptions = getOptions();
            postOptions.body = data;
            return request.post(urlBits.join('/'), postOptions);
        },
        delete: function (entity, id) {
            var deletableEntities = ['RenderingChildRegion', 'RenderingParentRegion', 'Variable', 'ProductConfiguration', "ConfigurationGroup", "Visualization"];
            if (deletableEntities.indexOf(entity) < 0) { //<-- this entity type doesn't exist.
                return Q.reject(new Error("Delete operations on this entity type are not allowed..."));
            }
            else {
                try {
                    if (id && /[0-9a-fA-F]{32}/.test(id) && process.env.allowdeletes === "yes") {
                        //we'll allow the delete
                        var urlBits = [url(), restBase, id];  //<-- this differs in that the only the ID is used and lowers the probability that a whole class of entities are deleted by accident
                        return Q(request.delete(urlBits.join("/"), getOptions()));
                    }
                    else {
                        return Q.reject(new Error("Will not delete, as either a valid ID is missing or environment delete confirmation (environment variable) is not present"));
                    }
                }
                catch (e) {
                    debugger;
                    return Q.reject(e);
                }

            }
        },
        put: function (entity, id) {
            throw new Error("this function not yet implemented...")
        },
        getSchema: function (entity, optionalView) {
            var urlBits = [url(), restBase, '_schema'];
            if (entity) {
                urlBits.push(entity);
                if (optionalView) urlBits.push(optionalView);
            }
            return request.get(urlBits.join("/"), getOptions());
        }
    },
    backup: {
        run: function (filename, pubOptions, toPath) {
            if (!isAuthed) {
                return Q.reject(new Error("Structr must be authorized to make a backup"))
            }
            //verify a filename has been presented
            if (!filename) {
                return Q.reject(new Error("You cannot run backup without both "))
            }

            //package the filename
            var backupBody = {
                mode: "export",
                file: filename
            };

            try {
                return structr.rest.post(maintenanceResource, backupBody)
                    .then(function (result) {
                        //move if necessary
                        if (toPath) {
                            return structr.backup.move(filename, toPath);
                        }
                        else {
                            return Q.resolve(filename);
                        }
                    })
                    .then(function () {
                        //publish if necessary
                        if (pubOptions) {
                            return structr.backup.publish(filename, pubOptions);
                        }
                        else {
                            return Q.resolve(filename)
                        }
                    })
                    .catch(function (e) {
                        return Q.reject(e)
                    });
            }
            catch (e) {
                return Q.reject(e);
            }

        },
        move: function (filename, toLocation) {
            if (server === '127.0.0.1' || server === "localhost") {
                return Q.promise(function (promiseResolve, promiseReject) {
                    util.move(
                        //from
                        [installLocation, filename].join(path.sep),
                        //to
                        [toLocation, filename].join(path.sep),
                        function (err, data) {
                            if (err) {
                                promiseReject(err);
                            }
                            else {
                                util.echo("Backup file moved to: " + [location, filename].join(path.sep));
                                promiseResolve([location, filename].join(path.sep));  //<-- we're returning the final destination of the file that got moved
                            }
                        });
                });
            }
            else {
                util.echo("Script running against remote host; not moving file.  The file was left in the structr-ui folder on the host");
                promiseResolve([structr.installLocation, filename].join(path.sep));  //<-- we're returning the final destination of the file that got moved
            }

        },
        publish: function (filename, publishOptions) {
            try {

                if (server === '127.0.0.1' || server === "localhost") {
                    publishOptions.destination.Key = filename;
                    thisPublisher = publishers[publishOptions.method];

                    return thisPublisher.createClient(publishOptions.credentials.accessKey, publishOptions.credentials.secretAccessKey)
                        .then(function (result) {
                            return thisPublisher.upload([installLocation, filename].join(path.sep), publishOptions.destination, publishOptions.forceOverwrite);
                        })
                        .catch(function (e) {
                            return Q.reject(e);
                        });


                }
                else {
                    return Q.reject(new Error("publish option specified, however cannot publish from remote location"));
                }
            }
            catch (e) {
                return Q.reject(e);
            }
        }
    },
    init: function (u, p, logger, options) {
        //if by chance we're already initialized and authenticated, don't try again.
        if (isInit && isAuthed) {
            return Q.resolve(this);
        }

        var thisStructr = this;

        //setup the logger
        if (logger && (typeof logger.log === 'function')) {
            thisStructr.log = logger.log;
        } else if (typeof logger === 'function') {
            //in case the logger was passed directly in
            thisStructr.log = logger;
        }
        else {
            //default to use the standard logger
            thisStructr.log = console.log;
        }

        var defaultOptions = {
            protocol: ['http://', 'https://'].indexOf(argv['protocol']) > -1 ? argv['protocol'] : "http://",
            server: argv['server'] || "127.0.0.1",
            port: argv['port'] || undefined,
            loginResource: "structr/rest/login",
            maintenanceResource: "maintenance/sync",
            defaultBackupLocation: "backups",
            restBase: "structr/rest",
            installLocation: '/usr/lib/structr-ui',
            verbose: false,
            logger: console
        };

        if (options) {
            lodash.defaultsDeep(options, defaultOptions)
        }
        else {
            options = defaultOptions;
        }

        username = u;
        password = p;
        // Take the properties from the defaulted options object
        protocol = options.protocol;
        server = options.server;
        port = options.port;
        loginResource = options.loginResource;
        maintenanceResource = options.maintenanceResource;
        restBase = options.restBase;
        installLocation = options.installLocation;

        if (options.logger && typeof options.logger === 'function') {
            this.logger = logger;
        }
        verbose = options.verbose;

        //set the inital state of the object
        isInit = true;
        return authenticate(thisStructr)
            .then(function () {
                return thisStructr;
            })
            .catch(function (e) {
                return Q.reject(e);
            })
    },
    installLocation:function(){
        return installLocation;
    }
};

module.exports = structr;