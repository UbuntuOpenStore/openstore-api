const config = require('../utils/config');
const apps = require('./apps');
const manage = require('./manage');
const categories = require('./categories');
const discover = require('./discover');
const updates = require('./updates');
const revisions = require('./revisions');
const auth = require('./auth');
const users = require('./users');
const Package = require('../db').Package;
const opengraph = require('../utils/opengraph');
const logger = require('../utils/logger');
const helpers = require('../utils/helpers');
const fs = require('../utils/asyncFs');

const express = require('express');
const cluster = require('cluster');
const path = require('path');

const APP_NOT_FOUND = 'App not found';

function setup() {
    const app = express();

    app.use((req, res, next) => {
        // Setup cors
        res.header('Access-Control-Allow-Origin', '*');
        res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
        next();
    });

    app.use((req, res, next) => {
        // Redirect to the main domain
        let host = config.server.host.replace('https://', '').replace('http://', '');
        // TODO make the old open.uappexplorer.com a redirect rather than just accepting it
        let secondaryHost = config.server.secondary_host.replace('https://', '').replace('http://', '');

        if (req.headers.host != host && req.headers.host != secondaryHost) {
            res.redirect(301, config.server.host + req.originalUrl);
        }
        else {
            next();
        }
    });

    // TODO see if there is a better way to do this
    manage.setup(app);

    // TODO depricate pre-v1 and v1
    // TODO clean up endpoints in the next version
    app.use('/api/apps/discover', discover);
    app.use('/api/v1/apps/discover', discover);
    app.use('/api/v1/apps/updates', updates);
    app.use('/api/v2/apps/updates', updates);
    app.use('/api/v1/apps/revision', revisions);
    app.use('/api/v2/apps/revision', revisions);
    app.use('/api/apps', apps.main);
    app.use('/api/v1/apps', apps.main);
    app.use('/api/v2/apps', apps.main);
    app.use('/api/download', apps.download);
    app.use('/api/icon', apps.icon);
    app.use('/api/screenshot', apps.screenshot);
    app.use('/auth', auth);
    app.use('/api/users', users);
    app.use('/api/categories', categories);
    app.use('/api/v1/categories', categories);
    app.use('/api/v2/categories', categories);

    app.use(express.static(path.join(__dirname, '../../www')));

    app.get('/api/health', (req, res) => {
        helpers.success(res, {id: cluster.worker.id});
    });

    app.get('/telegram', (req, res) => {
        // Short link
        res.redirect(301, 'https://telegram.me/joinchat/BMTh8AHtOL2foXLulmqDxw');
    });

    app.get('/app/openstore.mzanetti', (req, res) => {
        // Redirect old app name
        res.redirect(301, `${config.server.host}/app/openstore.openstore-team`);
    });

    app.get('/manage/create', (req, res) => {
        // Redirect old create page
        res.redirect(301, `${config.server.host}/submit`);
    });

    app.get('/app/:name', async (req, res) => {
        /*
        For populating opengraph data, etc for bots that don't
        execute javascript (like twitter cards)
        */

        if (opengraph.match(req)) {
            try {
                let pkg = await Package.findOne({id: req.params.name});

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

    app.all(['/', '/docs', '/submit', '/apps', '/manage', '/users', '/manage/:name', '/login', '/stats'], (req, res) => {
        // For html5mode on frontend
        res.sendFile('index.html', {root: config.server.static_root});
    });

    app.listen(config.server.port, config.server.ip);
    logger.debug(`listening on ${config.server.ip}:${config.server.port}`);

    return app;
}

module.exports.setup = setup;
