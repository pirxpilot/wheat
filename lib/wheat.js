/*
Copyright (c) 2010 Tim Caswell <tim@creationix.com>

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
*/


require('proto');
var Url = require('url'),
    Git = require('git-fs'),
    Renderers = require('./wheat/renderers');

var routes = [];
var redirs = [];

function addRoute(regex, renderer) {
  routes.push({regex: regex, renderer: renderer});
}

function addRedir(regex, location) {
  redirs.push({regex: regex, location: location});
}
function handleRoute(req, res, next, renderer, match) {
  function callback(err, data) {
    if (err) {
      return err.errno === process.ENOENT
        ? next()
        : next(err);
    }
    res.writeHead(200, data.headers);
    res.end(data.buffer);
  }
  var options = {
    mobile: 'mobile' === req.monomi.browserType
  }
  renderer.apply(null, match.concat([options, callback]));
}

function handleRedir(req, res, pattern, param) {
  var location = pattern.replace('{}', param);
  res.writeHead(301, { 'Location': location });
  res.end();
}

module.exports = function setup(repo) {

  // Initialize the Git Filesystem
  Git(repo || process.cwd());
  // Blogger compatible routes
  addRedir(/^\/[0-9]{4}\/[0-9]{2}\/([a-z0-9_-]+)\.html$/, '/{}');
  addRedir(/^\/search\/label\/([\%\.a-z0-9_-]+)$/,  '/category/{}');
  addRedir(/^\/p\/([\%\.a-z0-9_-]+)\.html$/,  '/page/{}');
  addRedir(/^\/feeds\/posts\/default$/, '/feed.xml');
  // Set up our routes
  addRoute(/^\/()$/, Renderers.index);
  addRoute(/^\/()feed.xml$/, Renderers.feed);
  addRoute(/^\/()sitemap.xml$/, Renderers.sitemap);
  addRoute(/^\/([a-f0-9]{40})\/([a-z0-9_-]+)$/, Renderers.article);
  addRoute(/^\/([a-f0-9]{40})\/(.+\.dot)$/, Renderers.dotFile);
  addRoute(/^\/([a-f0-9]{40})\/(.+\.[a-z]{2,4})$/, Renderers.staticFile);
  addRoute(/^\/()([a-z0-9_-]+)$/, Renderers.article);
  addRoute(/^\/()(.+\.dot)$/, Renderers.dotFile);
  addRoute(/^\/()(.+\.[a-z]{2,4})$/, Renderers.staticFile);
  addRoute(/^\/()category\/([\%\.a-z0-9_-]+)$/,  Renderers.categoryIndex);
  addRoute(/^\/()page\/([\%\.a-z0-9_-]+)$/,  Renderers.page);


  return function handle(req, res, next) {
    var url = Url.parse(req.url);
    for (var i = 0; i < redirs.length; i++) {
      var redir = redirs[i];
      var match = url.pathname.match(redir.regex);
      var url;
      if (match) {
        handleRedir(req, res, redir.location, match[1]);
        return;
      }
    };
    for (var i = 0, l = routes.length; i < l; i++) {
      var route = routes[i];
      var match = url.pathname.match(route.regex);
      if (match) {
        match = Array.prototype.slice.call(match, 1);
        if (match[0] === '') {
          // Resolve head to a sha if unspecified
          Git.getHead(function (err, sha) {
            if (err) { throw err; }
            match[0] = sha;
            handleRoute(req, res, next, route.renderer, match);
          });
        } else {
          handleRoute(req, res, next, route.renderer, match);
        }
        return;
      }
    }
    next();
  }
};
