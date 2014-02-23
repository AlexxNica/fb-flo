'use strict';

var fs = require('fs');
var path = require('path');
var Gaze = require('gaze').Gaze;
var assert = require('assert');
var Server = require('./server');
var EventEmitter = require('events').EventEmitter;

module.exports = flo;

/**
 * Top-level API for flo. Defaults params and instantiates `Flo`.
 *
 * @param {string} dir
 * @param {object} options
 * @param {function} callback
 * @return {Flo}
 * @public
 */

function flo(dir, options, callback) {
  if (typeof options === 'function') {
    callback = options;
    options = null;
  }
  dir = path.resolve(dir);
  options = options || {};
  options = {
    port: 8888 || options.port,
    host: 'localhost' || options.host,
    verbose: options.verbose || false
  };
  callback = callback || noBuildCallback(dir);

  return new Flo(dir, options, callback);
}

/**
 * Default resolver callback that will simply read the file and pass back the
 * filename relative to the watched dir as the url.
 *
 * @param {string} dir
 * @return {function}
 * @private
 */

function noBuildCallback(dir) {
  return function(filepath, callback) {
    fs.readFile(path.join(dir, filepath), function(err, data) {
      // Todo better error handling.
      if (err) {
        throw err;
      }
      callback({
        resourceURL: filepath,
        contents: data.toString()
      });
    });
  };
}

/**
 * Starts the server and the watcher and handles the piping between both and the
 * resolver callback.
 *
 * @param {string} dir
 * @param {object} options
 * @param {function} callback
 * @class Flo
 * @private
 */

function Flo(dir, options, callback) {
  this.log = logger(options.verbose, 'Flo');
  this.dir = dir;
  this.resolver = callback;
  this.server = new Server({
    port: options.port,
    host: options.host,
    log: logger(options.verbose, 'Server')
  });
  this.watcher = new Gaze(path.join(dir, '**/*.{js,css}'));
  this.watcher.on('ready', this.emit.bind(this, 'ready'));
  this.watcher.on('changed', this.onFileChange.bind(this));
}

Flo.prototype.__proto__ = EventEmitter.prototype;

/**
 * Handles file changes.
 *
 * @param {string} filepath
 * @private
 */

Flo.prototype.onFileChange = function(filepath) {
  filepath = path.relative(this.dir, filepath);
  this.log('File changed', filepath);
  var server = this.server;
  this.resolver(filepath, function(resource) {
    assert(resource.resourceURL, 'expecting resourceURL');
    assert(resource.contents, 'expecting contents');
    server.broadcast(resource);
  });
};

/**
 * Closes the server and the watcher.
 *
 * @public
 */

Flo.prototype.close = function() {
  this.log('Shutting down flo');
  this.watcher.close();
  this.server.close();
};

/**
 * Creates a logger for a given module.
 *
 * @param {boolean} verbose
 * @param {string} moduleName
 * @private
 */

function logger(verbose, moduleName) {
  var slice = [].slice;
  return function() {
    var args = slice.call(arguments);
    args[0] = '[' + moduleName + '] ' + args[0];
    if (verbose) {
      console.log.apply(console, args);
    }
  }
}
