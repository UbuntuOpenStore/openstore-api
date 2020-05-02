const passport = require('passport');
const bodyParser = require('body-parser');
const cookieParser = require('cookie-parser');
const methodOverride = require('method-override');
const session = require('cookie-session');
const express = require('express');
const cluster = require('cluster');
const Sentry = require('@sentry/node');

const config = require('../utils/config');
const apps = require('./apps');
const manage = require('./manage');
const categories = require('./categories');
const discover = require('./discover');
const revisions = require('./revisions');
const auth = require('./auth');
const users = require('./users');
const rss = require('./rss');
const logger = require('../utils/logger');
const helpers = require('../utils/helpers');
const { opengraph } = require('../utils/middleware');
require('../db'); // Make sure the database connection gets setup

function setup() {
  logger.info(`OpenStore api version ${config.version}`);

  if (config.sentry) {
    Sentry.init({
      release: `openstore-api@${config.version}`,
      dsn: config.sentry,
    });
  }

  const app = express();
  app.disable('x-powered-by');

  app.use((req, res, next) => {
    // Setup cors
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
    next();
  });

  app.use((req, res, next) => {
    if (process.env.NODE_ENV == 'production') {
      // Redirect to the main domain
      const host = config.server.host.replace('https://', '').replace('http://', '');
      if (req.headers.host != host) {
        res.redirect(301, config.server.host + req.originalUrl);
      }
      else {
        next();
      }
    }
    else {
      next();
    }
  });

  app.use((req, res, next) => {
    req.apiVersion = 2;
    if (req.originalUrl.startsWith('/api/v3')) {
      req.apiVersion = 3;
    }
    else if (req.originalUrl.startsWith('/api/v4')) {
      req.apiVersion = 4;
    }

    next();
  });

  app.use(cookieParser());
  app.use(bodyParser.urlencoded({ extended: false }));
  app.use(bodyParser.json());
  app.use(methodOverride());
  app.use(session({
    secret: config.server.session_secret,
    name: 'opensession',
    maxAge: 604800000, // 7 days in miliseconds
  }));
  app.use(passport.initialize());
  app.use(passport.session());
  app.use(Sentry.Handlers.errorHandler());

  // TODO remove this
  app.use('/api/screenshot', apps.screenshot);

  app.use('/auth', auth);
  app.use('/api/users', users);
  app.use('/rss', rss);

  app.use('/api/v3/apps', apps.main);
  app.use('/api/v3/stats', apps.stats);
  app.use('/api/v3/manage', manage);
  app.use('/api/v3/discover', discover);
  app.use('/api/v3/revisions', revisions);
  app.use('/api/v3/categories', categories);

  app.use('/api/v4/apps', apps.main);
  app.use('/api/v4/discover', discover);
  app.use('/api/v4/revisions', revisions);

  app.use(express.static(config.server.static_root));

  app.get('/api/health', (req, res) => {
    helpers.success(res, { id: cluster.worker.id });
  });

  app.get('/telegram', (req, res) => {
    // Short link
    res.redirect(301, config.telegram);
  });

  app.get('/app/openstore.mzanetti', (req, res) => {
    // Redirect old app name
    res.redirect(301, `${config.server.host}/app/openstore.openstore-team`);
  });

  app.get('/manage/create', (req, res) => {
    // Redirect old create page
    res.redirect(301, `${config.server.host}/submit`);
  });

  app.get('/docs', (req, res) => {
    // Redirect docs page to the about page
    // Using a 302 because the docs page may come back in the future
    res.redirect(302, `${config.server.host}/about`);
  });

  app.get('/logged-in', (req, res) => {
    if (req.isAuthenticated()) {
      return res.status(200);
    }

    return res.redirect('/login');
  });

  app.all([
    '/',
    '/submit',
    '/apps',
    '/app/:name',
    '/users',
    '/manage',
    '/manage/:name',
    '/manage/:name/revision',
    '/login',
    '/stats',
    '/about',
    '/feeds',
    '/badge',
  ], opengraph, (req, res) => {
    // For html5mode on frontend
    res.sendFile('index.html', { root: config.server.static_root });
  });

  app.server = app.listen(config.server.port, config.server.ip);
  logger.debug(`listening on ${config.server.ip}:${config.server.port}`);

  return app;
}

module.exports.setup = setup;
