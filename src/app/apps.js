'use strict';

const db = require('../db');
const Elasticsearch = require('../db/elasticsearch');
const config = require('../utils/config');
const packages = require('../utils/packages');
const logger = require('../utils/logger');
const helpers = require('../utils/helpers');

const passport = require('passport');
const multer  = require('multer');
const cluster = require('cluster');
const fs = require('fs');
const bluebird = require('bluebird');
const path = require('path');
const mime = require('mime');

bluebird.promisifyAll(fs);

function setup(app) {
    app.get('/api/health', function(req, res) {
        helpers.success(res, {
            id: cluster.worker.id
        });
    });

    function apps(req, res) {
        let useElasticsearch = true;
        if (
            req.originalUrl == '/repo/repolist.json' ||
            req.originalUrl.substring(0, 12) == '/api/v1/apps' ||
            req.originalUrl.substring(0, 9) == '/api/apps'
        ) {
            useElasticsearch = false;
        }

        let filters = packages.parseFiltersFromRequest(req);
        let promise = null;
        if (useElasticsearch && filters.search && filters.search.indexOf('author:') !== 0) {
            let query = {
                and: [], //No defaut published=true filter, only published apps are in elasticsearch
            };

            if (filters.types.length > 0) {
                query.and.push({
                    in: {
                        types: filters.types
                    }
                });
            }

            if (filters.ids.length > 0) {
                query.and.push({
                    in: {
                        id: filters.ids
                    }
                });
            }

            if (filters.frameworks.length > 0) {
                query.and.push({
                    in: {
                        framework: filters.frameworks
                    }
                });
            }

            if (filters.architectures.length > 0) {
                query.and.push({
                    in: {
                        architectures: filters.architectures
                    }
                });
            }

            if (filters.category) {
                query.and.push({
                    term: {
                        category: filters.category.replace(/&/g, '_').replace(/ /g, '_').toLowerCase()
                    }
                });
            }

            if (filters.author) {
                query.and.push({
                    term: {
                        author: filters.author
                    }
                });
            }

            if (filters.nsfw) {
                if (Array.isArray(filters.nsfw)) {
                    //TODO This looks a big weird because the filters.nsfw == [null, false], clean it up
                    query.and.push({
                        term: {
                            nsfw: false
                        }
                    });
                }
                else {
                    query.and.push({
                        term: {
                            nsfw: filters.nsfw
                        }
                    });
                }
            }

            let sort = '';
            let direction = 'asc';
            if (filters.sort && filters.sort != 'relevance') {
                if (filters.sort.charAt(0) == '-') {
                    direction = 'desc';
                    sort = filters.sort.substring(1);
                }
                else {
                    sort = filters.sort;
                }
            }

            let es = new Elasticsearch();
            promise = es.search(
                filters.search,
                {field: sort, direction: direction},
                query,
                filters.skip,
                filters.limit
            ).then((results) => {
                //Format the results to be more like the mongo results
                return [
                    results.hits.hits.map((hit) => {
                        return hit._source;
                    }),
                    results.hits.total,
                ]
            });
        }
        else {
            let defaultQuery = {
                published: true,
            };

            promise = db.queryPackages(filters, defaultQuery);
        }

        promise.then((results) => {
            let pkgs = results[0];
            let count = results[1];

            let formatted = [];
            pkgs.forEach(function(pkg) {
                formatted.push(packages.toJson(pkg, req));
            });

            if (req.originalUrl == '/repo/repolist.json') {
                res.send({
                    success: true,
                    message: null,
                    packages: formatted,
                });
            }
            else if (req.originalUrl.substring(0, 9) == '/api/apps') {
                helpers.success(res, formatted);
            }
            else {
                let links = helpers.nextPreviousLinks(req, formatted.length);

                helpers.success(res, {
                    count: count,
                    packages: formatted,
                    next: links.next,
                    previous: links.previous,
                });
            }
        }).catch((err) => {
            logger.error('Error fetching packages:', err);
            helpers.error(res, 'Could not fetch app list at this time');
        });;
    }

    app.get(['/api/apps', '/repo/repolist.json', '/api/v1/apps', '/api/v2/apps'], apps);
    app.post(['/api/v2/apps'], apps);

    app.get('/api/v2/apps/stats', function(req, res) {
        Promise.all([
            db.Package.aggregate([
                {
                    $match: {published: true},
                }, {
                    $group: {
                        _id: '$category',
                        count: {$sum: 1},
                    },
                }, {
                    $sort: {'_id': 1},
                }
            ]),
            db.Package.aggregate([
                {
                    $match: {published: true},
                }, {
                    $group: {
                        _id: '$types',
                        count: {$sum: 1},
                    },
                }, {
                    $sort: {'_id': 1},
                }
            ])
        ]).then((results) => {
            let categories = results[0];
            let types = results[1];

            let categoryMap = {};
            categories.forEach((category) => {
                categoryMap[category._id] = category.count;
            });

            let typeMap = {};
            types.forEach((type) => {
                type._id.forEach((t) => {
                    if (typeMap[t]) {
                        typeMap[t] += type.count;
                    }
                    else {
                        typeMap[t] = type.count;
                    }
                });
            });

            helpers.success(res, {
                categories: categoryMap,
                types: typeMap,
            });
        });
    });

    app.get(['/api/apps/:id', '/api/v1/apps/:id', '/api/v2/apps/:id'], function(req, res) {
        let query = {
            published: true,
            id: req.params.id,
        };

        if (req.query.frameworks) {
            let frameworks = req.query.frameworks.split(',');
            query.framework = {
                $in: frameworks
            };
        }

        if (req.query.architecture) {
            let architectures = [req.query.architecture];
            if (req.query.architecture != 'all') {
                architectures.push('all');
            }

            query.$or = [
                {architecture: {$in: architectures}},
                {architectures: {$in: architectures}},
            ];
        }

        db.Package.findOne(query).then((pkg) => {
            if (!pkg) {
                throw APP_NOT_FOUND;
            }

            helpers.success(res, packages.toJson(pkg, req));
        }).catch((err) => {
            if (err == APP_NOT_FOUND) {
                helpers.error(res, err, 404);
            }
            else {
                logger.error('Error fetching packages:', err);
                helpers.error(res, 'Could not fetch app list at this time');
            }
        });
    });

    app.get('/api/download/:id/:click', function(req, res) {
        db.Package.findOne({id: req.params.id, published: true}).exec(function(err, pkg) {
            if (err) {
                helpers.error(res, err);
            }
            else if (!pkg) {
                helpers.error(res, 'Package not found', 404);
            }
            else {
                var version = 'v' + pkg.version.replace(/\./g, '__');
                var index = 0;
                pkg.revisions.forEach((revision, idx) => {
                    if (pkg.revision == revision.revision) {
                        index = idx;
                    }
                });

                var inc = {};
                inc['revisions.' + index + '.downloads'] = 1;

                db.Package.update({_id: pkg._id}, {$inc: inc}, function(err) {
                    if (err) {
                        logger.error(err);
                    }
                    else {
                        // TODO check if more url encoding is needed
                        res.redirect(302, pkg.package.replace(/,/g, '%2C'));
                    }
                });
            }
        });
    });

    app.get(['/api/icon/:version/:id', '/api/icon/:id'], function(req, res) {
        let id = req.params.id.replace('.png', '').replace('.svg', '').replace('.jpg', '').replace('.jpeg', '');

        db.Package.findOne({id: id}).then((pkg) => {
            if (!pkg || !pkg.icon) {
                throw '404';
            }

            let ext = path.extname(pkg.icon);
            let filename = `${config.data_dir}/${pkg.version}-${pkg.id}${ext}`;
            if (fs.existsSync(filename)) {
                return filename;
            }
            else {
                return helpers.download(pkg.icon, filename);
            }
        }).then((filename) => {
            res.setHeader('Content-type', mime.lookup(filename));
            res.setHeader('Cache-Control', 'public, max-age=2592000'); //30 days
            fs.createReadStream(filename).pipe(res);
        }).catch((err) => {
            res.status(404);
            fs.createReadStream(path.join(__dirname, '../404.png')).pipe(res);
        });
    });

    app.get('/api/screenshot/:name', function(req, res) {
        let filename = `${config.image_dir}/${req.params.name}`;
        if (fs.existsSync(filename)) {
            res.setHeader('Content-type', mime.lookup(filename));
            res.setHeader('Cache-Control', 'public, max-age=2592000'); //30 days
            fs.createReadStream(filename).pipe(res);
        }
        else {
            res.status(404);
            fs.createReadStream(path.join(__dirname, '../404.png')).pipe(res);
        }
    });
}

exports.setup = setup;
