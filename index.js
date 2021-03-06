'use strict';

var jade = require('jade'),
    BB = require('bluebird'),
    fs = BB.promisifyAll(require('fs')),
    path = require('path'),
    rimraf = BB.promisify(require('rimraf')),
    mkdirp = BB.promisify(require('mkdirp')),
    clearStartupCache = BB.resolve(),
    cacheDir,
    clearOnStart,
    verbose,
    express,
    app,
    viewEngine,
    dev;

module.exports = {
    clearCache  : clearCache,
    configure   : configure
};

// Send in an options object to get a customized middleware function for inclusion in your express ap
function configure(options) {

    cacheDir        = options.cacheDir;                 // path to the cache dir - can be cleared with clearCache and / or on start
    clearOnStart    = false !== options.clearOnStart;   // whether to clear entire cache on start
    verbose         = !! options.verbose;               // truthy value give some console logs
    express         = options.express;
    app             = options.app;
    viewEngine      = options.hasOwnProperty('viewEngine') ? options.viewEngine : 'jade';       // currently jade and ejs supported
    dev             = !! options.dev;

    verbose && console.log('adding static cache at:', cacheDir);
    app.use(express.static(cacheDir));

    if (clearOnStart) {
        clearStartupCache = clearStartupCache
            .then(function() {
                return rimraf(cacheDir);
            })
            .then(function() {
                verbose && console.log('cache cleared after startup');
            });
    }

    return createMiddleware(cacheDir, verbose, viewEngine);
}

function clearCache() {
    verbose && console.log('clearing static cache');
    return rimraf(cacheDir);
}

function createMiddleware(cacheDir, verbose, viewEngine) {
    return function (req, res, next) {

        clearStartupCache
            .then(function() {
                res.cache = createCache(req, res, cacheDir, verbose, viewEngine);
                res.clearCache = clearCache;
                next();
            })
            .catch(function(error) {
                console.log('error clearing cache on startup:', error);
                console.log(new Error().stack);
            });
    };
}

function createCache(req, res, cacheDir, verbose, viewEngine) {
    return function(filePath, data) {        
        console.log(viewEngine);

        if(viewEngine === "ejs") {
            require("ejs").renderFile(filePath, data, function(err, result) {                
                if (!err) {
                    var templatedString = result;                
                    var cachePath           = path.join(cacheDir, req.originalUrl);
                    var cacheFile           = path.join(cachePath, 'index.html');

                    verbose && console.log('cache path', cachePath, 'cache file', cacheFile);

                    if (!dev) {
                        BB
                            .try(function() {
                                return mkdirp(cachePath);
                            })
                            .then(function() {
                                return fs.writeFileAsync(cacheFile, templatedString);
                            })
                            .catch(function(error) {
                                console.log('express static cache error:', error);
                                console.log(new Error().stack);
                            });
                    }

                    res.send(templatedString);           
        
                } else {
                    console.log(err.toString());
                    res.send("EJS compile error: ", err);
                }

            });            

        } else {

            var templateFunction    = jade.compileFile(filePath),
                templatedString     = templateFunction(data),
                cachePath           = path.join(cacheDir, req.originalUrl),
                cacheFile           = path.join(cachePath, 'index.html');

            verbose && console.log('cache path', cachePath, 'cache file', cacheFile);

            if (!dev) {
                BB
                    .try(function() {
                        return mkdirp(cachePath);
                    })
                    .then(function() {
                        return fs.writeFileAsync(cacheFile, templatedString);
                    })
                    .catch(function(error) {
                        console.log('express static cache error:', error);
                        console.log(new Error().stack);
                    });
            }

            res.send(templatedString);
        }
    };
}