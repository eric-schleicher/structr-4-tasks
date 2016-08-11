# structr-4-tasks
A library that provides REST access to a Structr instance  in a format useful for standalone operations as well as for use in conjunction with other libraries (like [Gulp](http://gulpjs.com/))

### Use 
```javascript
var structr = require('structr-4-tasks');
//return the base object, which is not initialized

// Initializing (and authenticating the library)
// structr.init(username, password [, logger])
structr.init("myusername", mypassword);

```


Optionally you can set the logger to be your preferred logging function. if you don't provide a value, the default console logger will be used.   this is helpful if you are using another library which uses a specialised logging function, as is commonly done when using Gulp.

You can provide a reference to any the top level object, in so much as it has a `log()` function.  For example if used in a regular node context, if you omit the logger argument, providing `console` or `console.log` (either will work).
the following are functionally equivalent
```javascript

```
  alternatively, if you're using **structr-4-tasks** with a library like 'gulp-utils' you can provide your utils reference
example
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

**Note:**

the REST function in the library are not attached to the structr.rest until the library has successfully authenticated.  this forces failure on premature RESTful calls to structr. 


#### Known issues:
- [ ] `structr.rest.put` is not yet implemented 