// Generated on 2013-10-16 using generator-webapp 0.4.3
'use strict';

// # Globbing
// for performance reasons we're only matching one level down:
// 'test/spec/{,*/}*.js'
// use this if you want to recursively match all subfolders:
// 'test/spec/**/*.js'

module.exports = function (grunt) {
    // show elapsed time at the end
    require('time-grunt')(grunt);
    // load all grunt tasks
    require('load-grunt-tasks')(grunt);

    grunt.initConfig({
        watch: {
            livereload: {
                options: {
                    livereload: '<%= connect.options.livereload %>'
                },
                files: [
                    '*.js',
                    'test/*',
                ]
            }
        },
        connect: {
            options: {
                port: 9000,
                livereload: 35729,
                // change this to '0.0.0.0' to access the server from outside
                hostname: 'localhost'
            },
            livereload: {
                options: {
                    open: true,
                    base: [
                        "."
                    ]
                }
            },
            test: {
                options: {
                    base: [
                        "."
                    ]
                }
            },
            dist: {
                options: {
                    open: true,
                    base: [
                        "."
                    ]
                }
            }
        },
        
        concurrent: {
            server: [
                // 'compass',
                // 'copy:styles'
            ],
            test: [
                // 'copy:styles'
            ],
            dist: [
                // 'compass',
                // 'copy:styles',
                // 'imagemin',
                // 'svgmin',
                // 'htmlmin'
            ]
        },
    });

    grunt.registerTask('server', [
            'connect:livereload',
            'watch'
        ]
    )
};
