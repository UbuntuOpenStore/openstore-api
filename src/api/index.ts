import passport from 'passport';
import bodyParser from 'body-parser';
import cookieParser from 'cookie-parser';
import methodOverride from 'method-override';
import session from 'cookie-session';
import express, { type Request, type Response, type NextFunction } from 'express';
import cluster from 'cluster';
import * as Sentry from '@sentry/node';

import { logger, config, success, error } from 'utils';
import apps from './apps';
import stats from './stats';
import manage from './manage';
import categories from './categories';
import discover from './discover';
import revisions from './revisions';
import auth from './auth';
import users from './users';
import rss from './rss';
import '../db'; // Make sure the database connection gets setup

export function setup() {
  logger.info(`OpenStore api version ${config.version}`);

  if (config.sentry) {
    Sentry.init({
      release: `openstore-api@${config.version}`,
      dsn: config.sentry,
    });
  }

  const app = express();
  app.disable('x-powered-by');

  app.use((req: Request, res: Response, next: NextFunction) => {
    // Setup cors
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
    next();
  });

  app.use((req: Request, res: Response, next: NextFunction) => {
    if (process.env.NODE_ENV === 'production') {
      // Redirect to the main domain
      const host = config.server.host.replace('https://', '').replace('http://', '');
      if (req.headers.host !== host) {
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

  app.use((req: Request, res: Response, next: NextFunction) => {
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

  app.use('/auth', auth);
  app.use('/api/users', users);
  app.use('/rss', rss);

  app.use('/api/v3/apps', apps);
  app.use('/api/v3/stats', stats);
  app.use('/api/v3/manage', manage);
  app.use('/api/v3/discover', discover);
  app.use('/api/v3/revisions', revisions);
  app.use('/api/v3/categories', categories);

  app.use('/api/v4/apps', apps);
  app.use('/api/v4/discover', discover);
  app.use('/api/v4/revisions', revisions);

  app.use(express.static(config.server.static_root));

  app.get('/api/health', (req: Request, res: Response) => {
    success(res, { id: cluster.worker ? cluster.worker.id : null });
  });

  // TODO move redirects to nginx
  app.get('/telegram', (req: Request, res: Response) => {
    // Short link
    res.redirect(301, config.telegram);
  });

  app.get('/app/openstore.mzanetti', (req: Request, res: Response) => {
    // Redirect old app name
    res.redirect(301, `${config.server.host}/app/openstore.openstore-team`);
  });

  app.get('/manage/create', (req: Request, res: Response) => {
    // Redirect old create page
    res.redirect(301, `${config.server.host}/submit`);
  });

  app.get('/docs', (req: Request, res: Response) => {
    // Redirect docs page to the about page
    // Using a 302 because the docs page may come back in the future
    res.redirect(302, `${config.server.host}/about`);
  });

  app.get('/logged-in', (req: Request, res: Response) => {
    if (req.isAuthenticated()) {
      if (!req.query.apiKey && req.headers['user-agent'] && req.headers['user-agent'].startsWith('OpenStore App')) {
        res.redirect(`/logged-in?apiKey=${req.user!.apikey}`);
        return;
      }

      success(res, { 'logged-in': 'ok' });
      return;
    }

    res.redirect('/login');
  });

  app.use((req: Request, res: Response) => {
    error(res, 'Route not found', 404);
  });

  if (process.env.NODE_ENV !== 'testing' && process.env.NODE_ENV !== 'ci') {
    app.listen(config.server.port, config.server.ip);
    logger.debug(`listening on ${config.server.ip}:${config.server.port}`);
  }

  return app;
}
