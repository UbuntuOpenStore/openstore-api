const config = require('../utils/config');
const apps = require('./apps');
const manage = require('./manage');
const categories = require('./categories');
const discover = require('./discover');
const updates = require('./updates');
const revisions = require('./revisions');
const auth = require('./auth');
const users = require('./users');
const db = require('../db');
const opengraph = require('../utils/opengraph');
const logger = require('../utils/logger');
const helpers = require('../utils/helpers');

const fs = require('fs');
const express = require('express');
const cluster = require('cluster');

function setup() {
    const app = express();

    //Setup cors
    app.use(function(req, res, next) {
        res.header('Access-Control-Allow-Origin', '*');
        res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
        next();
    });

    app.use(function(req, res, next) {
        // Redirect to the main domain
        let host = config.server.host.replace('https://', '').replace('http://', '');
        let secondary_host = config.server.secondary_host.replace('https://', '').replace('http://', '');

        if (req.headers.host != host && req.headers.host != secondary_host) {
            res.redirect(301, config.server.host + req.originalUrl);
        }
        else {
            next();
        }
    });

    //TOOD see if there is a better way to do this
    manage.setup(app);
    users.setup(app);

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
    app.use('/api/categories', categories);
    app.use('/api/v1/categories', categories);
    app.use('/api/v2/categories', categories);

    app.use(express.static(__dirname + '/../../www'));

    app.get('/api/health', function(req, res) {
        helpers.success(res, {
            id: cluster.worker.id
        });
    });

    app.get('/telegram', function(req, res) {
        res.redirect(301, 'https://telegram.me/joinchat/BMTh8AHtOL2foXLulmqDxw');
    });

    app.get('/app/openstore.mzanetti', function(req, res) {
        res.redirect(301, config.server.host + '/app/openstore.openstore-team')
    });

    app.get('/manage/create', function(req, res) {
        res.redirect(301, config.server.host + '/submit')
    });

    app.get(['/app/:name'], function(req, res) { //For populating opengraph data, etc for bots that don't execute javascript (like twitter cards)
        if (opengraph.match(req)) {
            res.header('Content-Type', 'text/html');
            db.Package.findOne({id: req.params.name}, function(err, pkg) {
                if (err) {
                    res.status(500);
                    res.send();
                }
                else if (!pkg) {
                    res.status(404);
                    res.send();
                }
                else {
                    fs.readFile(config.server.static_root + 'index.html', {encoding: 'utf8'}, function(err, data) {
                        if (err) {
                            res.status(500);
                            res.send();
                        }
                        else {
                            res.status(200);
                            res.send(opengraph.replace(data, {
                                title: pkg.name,
                                url: 'https://open-store.io/app/' + pkg.id,
                                image: pkg.icon,
                                description: pkg.tagline ? pkg.tagline : '',
                            }));
                        }
                    });
                }
            });
        }
        else {
            res.sendFile('index.html', {root: config.server.static_root});
        }
    });

    app.all(['/', '/docs', '/submit', '/apps', '/manage', '/users', '/manage/:name', '/login', '/stats'], function(req, res) { //For html5mode on frontend
        res.sendFile('index.html', {root: config.server.static_root});
    });

    app.listen(config.server.port, config.server.ip);
    logger.debug('listening on ' + config.server.ip + ':' + config.server.port);

    return app;
}

module.exports.setup = setup;
