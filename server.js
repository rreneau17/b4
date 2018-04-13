/***
 * Excerpted from "Node.js 8 the Right Way",
 * published by The Pragmatic Bookshelf.
 * Copyrights apply to this code. It may not be used to create training material,
 * courses, books, articles, and the like. Contact us if you are in doubt.
 * We make no guarantees that this code is fit for any purpose.
 * Visit http://www.pragmaticprogrammer.com/titles/jwnode2 for more book information.
***/
'use strict';
const pkg = require('./package.json');
const {URL} = require('url');
const path = require('path');
const fs = require('fs');
const https = require('https');

// nconf configuration.
const nconf = require('nconf');
nconf
  .argv()
  .env('__')
  .defaults({'NODE_ENV': 'development'});

const NODE_ENV = nconf.get('NODE_ENV');
const isDev = NODE_ENV === 'development';
nconf
  .defaults({'conf': path.join(__dirname, `${NODE_ENV}.config.json`)})
  .file(nconf.get('conf'));

const serviceUrl = new URL(nconf.get('serviceUrl'));
const servicePort =
    serviceUrl.port || (serviceUrl.protocol === 'https:' ? 443 : 80);

// setup to enable https
var certOptions = {
  key: fs.readFileSync(path.resolve('../cert/server.key')),
  cert: fs.readFileSync(path.resolve('../cert/server.crt'))
}

// Express and middleware.
const express = require('express');
const morgan = require('morgan');

const app = express();
//Setup Express sessions.
const expressSession = require('express-session');
if (isDev) {
  // Use FileStore in development mode.
  const FileStore = require('session-file-store')
  (expressSession);
  app.use(expressSession({
    resave: false,
    saveUninitialized: true,
    secret: 'unguessable',
    store: new FileStore(),
  }));
} else {
  // Use RedisStore in production mode.
}

// Passport Authentication
const passport = require('passport');
passport.serializeUser((profile, done) => done(null, {
  id: profile.id,
  provider: profile.provider,
}));

passport.deserializeUser((user, done) => done(null, user));
app.use(passport.initialize());
app.use(passport.session());

const FacebookStrategy = require('passport-facebook').Strategy;
passport.use(new FacebookStrategy({
  clientID: nconf.get('auth:facebook:appID'),
  clientSecret: nconf.get('auth:facebook:appSecret'),
  callbackURL: new URL('/auth/facebook/callback', serviceUrl).href,
  }, (accessToken, refreshToken, profile, done) => done(null, profile)));

app.get('/auth/facebook', passport.authenticate('facebook'));
app.get('/auth/facebook/callback', passport.authenticate('facebook', {
  successRedirect: '/',
  failureRedirect: '/',
}));

app.use(morgan('dev'));

app.get('/api/version', (req, res) => res.status(200).json(pkg.version));

// Serve webpack assets.
if (isDev) {
  const webpack = require('webpack');
  const webpackMiddleware = require('webpack-dev-middleware');
  const webpackConfig = require('./webpack.config.js');
  app.use(webpackMiddleware(webpack(webpackConfig), {
    publicPath: '/',
    stats: {colors: true},
  }));
} else {
  app.use(express.static('dist'));
}

app.get('/api/session', (req, res) => {
  const session = {auth: req.isAuthenticated()};
  res.status(200).json(session);
});

app.get('/auth/signout', (req, res) => {
  req.logout();
  res.redirect('/');
});

app.use('/api', require('./lib/bundle.js')(nconf.get('es')));

const server = https.createServer(certOptions, app).listen(servicePort, () => console.log('Ready.'));
