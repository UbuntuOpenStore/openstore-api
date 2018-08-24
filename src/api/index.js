const passport = require('passport');
const bodyParser = require('body-parser');
const cookieParser = require('cookie-parser');
const methodOverride = require('method-override');
const session = require('cookie-session');
const express = require('express');
const cluster = require('cluster');
const path = require('path');

const config = require('../utils/config');
const apps = require('./apps');
const manage = require('./manage');
const categories = require('./categories');
const discover = require('./discover');
const updates = require('./updates');
const revisions = require('./revisions');
const auth = require('./auth');
const users = require('./users');
const rss = require('./rss');
const Package = require('../db').Package;
const opengraph = require('../utils/opengraph');
const logger = require('../utils/logger');
const helpers = require('../utils/helpers');
const fs = require('../utils/asyncFs');

const APP_NOT_FOUND = 'App not found';

function setup() {
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
            let host = config.server.host.replace('https://', '').replace('http://', '');
            // TODO make the old open.uappexplorer.com a redirect rather than just accepting it
            let secondaryHost = config.server.secondary_host.replace('https://', '').replace('http://', '');

            if (req.headers.host != host && req.headers.host != secondaryHost) {
                console.log('redirect');
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
        req.apiVersion = 1;
        if (req.originalUrl.startsWith('/api/v2')) {
            req.apiVersion = 2;
        }
        else if (req.originalUrl.startsWith('/api/v3')) {
            req.apiVersion = 3;
        }

        next();
    });

    app.use(cookieParser());
    app.use(bodyParser.urlencoded({extended: false}));
    app.use(bodyParser.json());
    app.use(methodOverride());
    app.use(session({
        secret: config.server.session_secret,
        name: 'opensession',
        maxAge: 604800000, // 7 days in miliseconds
    }));
    app.use(passport.initialize());
    app.use(passport.session());

    // TODO depricate pre-v1 and v1 and v2
    app.use('/api/apps/discover', discover);
    app.use('/api/v1/apps/discover', discover);
    app.use('/api/v1/apps/updates', updates);
    app.use('/api/v2/apps/updates', updates);
    app.use('/api/v1/apps/revision', revisions);
    app.use('/api/v2/apps/revision', revisions);
    app.use('/api/v1/manage/apps', manage);
    app.use('/api/v2/manage/apps', manage);
    app.use('/api/apps', apps.main);
    app.use('/api/v1/apps', apps.main);
    app.use('/api/v2/apps', apps.main);
    app.use('/api/download', apps.download);
    app.use('/api/icon', apps.icon);
    app.use('/api/screenshot', apps.screenshot);
    app.use('/api/categories', categories);
    app.use('/api/v1/categories', categories);
    app.use('/api/v2/categories', categories);

    app.use('/auth', auth);
    app.use('/api/users', users);
    app.use('/rss', rss);

    app.use('/api/v3/apps', apps.main);
    app.use('/api/v3/stats', apps.stats);
    app.use('/api/v3/manage', manage);
    app.use('/api/v3/discover', discover);
    app.use('/api/v3/revisions', revisions);
    app.use('/api/v3/categories', categories);

    app.use(express.static(config.server.static_root));

    app.get('/api/health', (req, res) => {
        helpers.success(res, {id: cluster.worker.id});
    });

    app.get('/telegram', (req, res) => {
        // Short link
        res.redirect(301, 'https://t.me/joinchat/BrbmOVDzIzySSUxa7Ktmiw');
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

    app.get('/app/:name', async (req, res) => {
        /*
        For populating opengraph data, etc for bots that don't
        execute javascript (like twitter cards)
        */

        if (opengraph.match(req)) {
            try {
                let pkg = await Package.findOne({id: req.params.name}).exec();

                if (!pkg) {
                    throw APP_NOT_FOUND;
                }

                let data = await fs.readFileAsync(path.join(config.server.static_root, 'index.html'), {encoding: 'utf8'});

                res.header('Content-Type', 'text/html');
                res.status(200);
                res.send(opengraph.replace(data, {
                    title: pkg.name,
                    url: `${config.server.host}/app/${pkg.id}`,
                    image: pkg.icon,
                    description: pkg.tagline ? pkg.tagline : '',
                }));
            }
            catch (err) {
                if (err == APP_NOT_FOUND) {
                    res.status(404);
                    res.send();
                }
                else {
                    res.status(500);
                    res.send();
                }
            }
        }
        else {
            res.sendFile('index.html', {root: config.server.static_root});
        }
    });

    app.all([
        '/',
        '/submit',
        '/apps',
        '/users',
        '/manage',
        '/manage/:name',
        '/manage/:name/revision',
        '/login',
        '/stats',
        '/about',
        '/feeds',
    ], (req, res) => {
        // For html5mode on frontend
        res.sendFile('index.html', {root: config.server.static_root});
    });

    app.listen(config.server.port, config.server.ip);
    logger.debug(`listening on ${config.server.ip}:${config.server.port}`);

    return app;
}

module.exports.setup = setup;
