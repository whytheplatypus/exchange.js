
var gulp = require('gulp');
var uglify = require('gulp-uglify');
var clean = require('gulp-clean');
var jshint = require('gulp-jshint');
var lrserver = require('tiny-lr');
var livereload = require('gulp-livereload');
var concat = require('gulp-concat');
var jsdoc = require("gulp-jsdoc");
var connect = require('connect');

// Edit this values to best suit your app
var WEB_PORT = 9000;
var APP_DIR = __dirname;

// jshint files
gulp.task('jshint', function() {
    gulp.src(['exchange.js', 'exchange_manager.js'])
        .pipe(jshint())
        .pipe(jshint.reporter());
});



var lrs = lrserver();

// start livereload server
gulp.task('lr-server', function() {
    lrs.listen(35729, function(err) {
        if (err) return console.log(err);
    });
});

// start local http server for development
gulp.task('http-server', function() {
    connect()
    .use(require('connect-livereload')())
    .use(connect.directory(APP_DIR))
    .use(connect.static(APP_DIR))
    
    .listen(WEB_PORT);

    console.log('Server listening on http://localhost:' + WEB_PORT);
});

gulp.task('docs', function(){
  gulp.src(['exchange.js', 'exchange_manager.js'])
  .pipe(jsdoc('./docs'))
});

// start local http server with watch and livereload set up
gulp.task('server', function() {
    gulp.run('lr-server');

    var watchFiles = ['test/*.html', 'test/*.js', 'demo/*.html', 'demo/*.js', '*.js'];
    gulp.watch(watchFiles, function(e) {
        console.log('Files changed. Reloading...');
        gulp.src(watchFiles)
        .pipe(livereload(lrs));
    });

    gulp.run('http-server');
});

gulp.task('build', function() {
  gulp.src('dist')
        .pipe(clean());
  gulp.src(['exchange.js', 'exchange_manager.js', 'md5.js'])
    .pipe(uglify())
    .pipe(concat("exchange.min.js"))
    .pipe(gulp.dest('dist'));
});

gulp.task('default', function() {
  gulp.run('server');
});
