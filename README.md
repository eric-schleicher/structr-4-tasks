# structr-4-tasks  
--
A library that provides simplified access to a Structr's REST interfaces.  It also can help streamline some of your maintenance tasks by enabling simple backup publishing to a remote location (currenty only implemented with [AWS S3](https:aws.amazon.com/s3).  Hopefully you find this library useful for standalone operations as well as for use in conjunction with other libraries (like [Gulp](http://gulpjs.com/))

### Getting Started
From the commandline, with node & npm already installed:
`npm install structr-4-tasks`

### Usage Examples 
   
```javascript
//a variable to hold the structr utility object
var structr;

//simultaneously require and initialize the connection
require('structr-4-tasks').init("notyourusername", "notyourpassword") //<-- by default presumes your running from localhost
   .then(function(newStructrObject){
      structr = newStructrObject;
   })
   .then(yourStuff) //<--the entry point into your work that ensures that a valid connection will be available
   .catch(function(e){
      //Oops!  you ended up here if connection failed or you have an untrapped error in yourStuff();
      JSON.stringify(e, null, '\t')
      
      //some automation/scheduling systems like a proper error to correctly understand that this process failed.
      process.exit(-1);
   });

var yourStuff = function(){
   //lets get to work
   //requests the json-schema definition of an entity in your structr
   structr.rest.getSchema("MyEntity", "default").then(function(response){
      //if you specify an optional logger (like with gulp-utils), it is available throught the structr.log member;
      //this is handy if you're using the library with gulp and would like get the pretty logging      
      structr.log(response.result.result_count) 
      })  
};
```

#### Dependencies
structr-4-tasks uses the following NPM packages internally

`argv` 
`lodash`
`minimist`
`q`
`request`
`request-promise`
`s3`
`simple-publishers`
### Interfaces

`.init(username, password, logger, options)`
the logger input

#### `structr-4-tasks.rest`
`.get(entity, view, urlOptions)`
  simple get function, optionally allow you specify additional argument

`.getById(entity, view, urlOptions)`
  simple get function, optionally allow you specify additional argument

`.post(entity, data)`
post data to the 

`.putById(entity, id, data)`
note: not yet implemented `//todo`

`.delete` 
performs a delete post against a single ID.  will not allow you to delete all nodes at onces 

`.getSchema(entity, optionalView)`
get entity metadata from the system for a specific entity/view

##### Backup `structr-4-tasks.backup[...]`
`.run(fileName, publishOptions)`

 Example publish options
 
```javascript
  var publishOptions = {
      "method": "s3",
      "destination": {
          Bucket: "mybucketname/folder1",
          //Key: filename.split(path.sep).pop()
          // other options supported by putObject, except Body and ContentLength.
          // See: http://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/S3.html#putObject-property
      },
      "forceOverwrite":true,  //<--overwrite the file if it already exists in the target
      "bucketSubfolder": "thatServer",
      // Your AWS access token(s)
      "credentials": {
          accessKey: "NOTYOURACCESSKEY",
          secretAccessKey: "NOTYOURSECRETACCESSKEY"
      },
      "cleanUpOnSuccess":true  //<--delete the backup after it's been successfully uploaded
  };
```

##### Initialization (`struct.init`)
By omitting an options object, you are implicitly accepting the following defaults;
```javacscript
var defaultOptions = {
    protocol : ['http://', 'https://'].indexOf(argv['protocol']) > -1 ? argv['protocol'] : "http://",
    server : argv['server'] || "127.0.0.1",
    port : argv['port'] || undefined,
    loginResource : "structr/rest/login",
    maintenanceResource : "structr/rest/maintenance/sync",
    restBase : "structr/rest",
    installLocation : argv['structr-install'] || '/usr/lib/structr-ui',
    verbose: false,
    logger: console
};
```
This means that you can provide command line options to overrise the following properties 
 - protocol
 - server
 - port
 - installLocation *typically `/usr/lib/structr-ui` on most linux systems*

Optionally you can set the logger to be your preferred logging function. if you don't provide a value, the default console logger will be used.   this is helpful if you are using another library which uses a specialised logging function, as is commonly done when using Gulp.

You can provide a reference to any the top level object, in so much as it has a `log()` function.  For example if used in a regular node context, if you omit the logger argument, providing `console` or `console.log` (either will work).
the following are functionally equivalent

  alternatively, if you're using **structr-4-tasks** with a library like 'gulp-utils' you can provide your utils reference example
``` javascript
var structr = require('structr-4-tasks')
structr.init("myusername", "mypassword", console)

//Or all at once
var structr = require('structr-4-tasks').init("myusername", "mypassword", console)

//if you're using gulp-util
var gulp = require('gulp');
var gulpUtils = require('gulp-util');
var structr = require('structr-4-tasks').init("myusername", "mypassword", gulpUtils)

``` 
### Initialization


#### Credentials Best practice
**Don't:** put your username and password in your project
**Do:**  Use environment variables in your code to handle the username and password so that you don't have credentials in your code.
example:
```javascript
// For example use the process.env object to retrieve value that's you've previously Exported
var structr = require('structr-4-tasks').init(process.env.username process.env.password)
```

#### To Do:
- [ ] change delete to be deleteById
- [ ] ensure all rest method require valida authenticated connection with a common function
- [ ] Add usage example of how to publish to s3
- [ ] Add Publish option example
 