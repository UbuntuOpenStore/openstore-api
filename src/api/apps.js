const path = require('path');
const mime = require('mime');
const express = require('express');

const Package = require('../db/package/model');
const PackageRepo = require('../db/package/repo');
const PackageSearch = require('../db/package/search');
const config = require('../utils/config');
const packages = require('../utils/packages');
const logger = require('../utils/logger');
const helpers = require('../utils/helpers');
const fs = require('../utils/asyncFs');

// TODO properly namespace these so we only need one router
const router = express.Router();
const screenshotRouter = express.Router();
const statsRouter = express.Router();

const APP_NOT_FOUND = 'App not found';
const DOWNLOAD_NOT_FOUND_FOR_CHANNEL = 'Download not available for this channel';

async function apps(req, res) {
    let filters = packages.parseFiltersFromRequest(req);
    let count = 0;
    let pkgs = [];

    try {
        if (filters.search && filters.search.indexOf('author:') !== 0) {
            let results = await PackageSearch.search(filters, filters.sort, filters.skip, filters.limit);
            /* eslint-disable no-underscore-dangle */
            pkgs = results.hits.hits.map((hit) => hit._source),
            count = results.hits.total;
        }
        else {
            filters.published = true;
            pkgs = await PackageRepo.find(filters, filters.sort, filters.limit, filters.skip);
            count = await PackageRepo.count(filters);
        }

        let formatted = [];
        pkgs.forEach((pkg) => {
            if (req.apiVersion == 3) {
                formatted.push(packages.toSlimJson(pkg, req));
            }
            else {
                formatted.push(packages.toJson(pkg, req));
            }
        });

        if (req.apiVersion == 1) {
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
    }
    catch (err) {
        logger.error('Error fetching packages:', err);
        console.error(err);
        helpers.error(res, 'Could not fetch app list at this time');
    }
}

router.get('/', apps);
router.post('/', apps);

function stats(req, res) {
    Promise.all([
        Package.aggregate([
            {
                $match: {published: true},
            }, {
                $group: {
                    _id: '$category',
                    count: {$sum: 1},
                },
            }, {
                $sort: {_id: 1},
            },
        ]),
        Package.aggregate([
            {
                $match: {published: true},
            }, {
                $group: {
                    _id: '$types',
                    count: {$sum: 1},
                },
            }, {
                $sort: {_id: 1},
            },
        ]),
    ]).then(([categories, types]) => {
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
}

router.get('/stats', stats); // TODO depricate
statsRouter.get('/', stats);

router.get('/:id', (req, res) => {
    let query = {
        published: true,
        id: req.params.id,
    };

    if (req.query.frameworks) {
        let frameworks = req.query.frameworks.split(',');
        query.framework = {
            $in: frameworks,
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

    Package.findOne(query).then((pkg) => {
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

async function download(req, res) {
    try {
        let pkg = await Package.findOne({id: req.params.id, published: true}).exec();
        if (!pkg) {
            return helpers.error(res, APP_NOT_FOUND, 404);
        }

        let channel = req.params.channel ? req.params.channel : Package.VIVID;
        channel = channel.toLowerCase();
        let revision = (channel == Package.XENIAL) ? pkg.xenial_revision : pkg.vivid_revision;

        let downloadUrl = '';
        let revisionData = null;
        let revisionIndex = 0;
        pkg.revisions.forEach((data, idx) => {
            if (data.revision == revision && data.channel == channel) {
                revisionIndex = idx;
                revisionData = data;
            }
        });

        if (revisionData) {
            // TODO check if more url encoding is needed
            downloadUrl = revisionData.download_url.replace(/,/g, '%2C');
        }
        else {
            return helpers.error(res, DOWNLOAD_NOT_FOUND_FOR_CHANNEL, 404);
        }

        let ext = path.extname(downloadUrl);
        let filename = `${config.data_dir}/${pkg.id}-${channel}-${revisionData.version}${ext}`;
        if (!fs.existsSync(filename)) {
            filename = await helpers.download(downloadUrl, filename);
        }

        let inc = {};
        inc[`revisions.${revisionIndex}.downloads`] = 1;

        await Package.update({_id: pkg._id}, {$inc: inc});

        let stat = await fs.statAsync(filename);
        res.setHeader('Content-Length', stat.size);
        res.setHeader('Content-Type', mime.lookup(filename));
        res.setHeader('Content-Disposition', `attachment; filename=${pkg.id}_${revisionData.version}_${pkg.architecture}.click`);
        return fs.createReadStream(filename).pipe(res);
    }
    catch (err) {
        logger.error('Error downloading package:', err);
        return helpers.error(res, 'Could not download package at this time');
    }
}

router.get('/:id/download/:channel', download);

async function icon(req, res) {
    let id = req.params.id.replace('.png', '').replace('.svg', '').replace('.jpg', '').replace('.jpeg', '');

    try {
        let pkg = await Package.findOne({id: id});
        if (!pkg || !pkg.icon) {
            throw APP_NOT_FOUND;
        }

        let ext = path.extname(pkg.icon);
        let filename = `${config.data_dir}/${pkg.version}-${pkg.id}${ext}`;
        if (!fs.existsSync(filename)) {
            filename = await helpers.download(pkg.icon, filename);
        }

        let stat = await fs.statAsync(filename);
        res.setHeader('Content-Length', stat.size);
        res.setHeader('Content-type', mime.lookup(filename));
        res.setHeader('Cache-Control', 'public, max-age=2592000'); // 30 days
        fs.createReadStream(filename).pipe(res);
    }
    catch (e) {
        res.status(404);
        fs.createReadStream(path.join(__dirname, '../404.png')).pipe(res);
    }
}

router.get('/:id/icon/:version', icon);

function screenshot(req, res) {
    let filename = `${config.image_dir}/${req.params.name}`;
    if (fs.existsSync(filename)) {
        res.setHeader('Content-type', mime.lookup(filename));
        res.setHeader('Cache-Control', 'public, max-age=2592000'); // 30 days
        fs.createReadStream(filename).pipe(res);
    }
    else {
        res.status(404);
        fs.createReadStream(path.join(__dirname, '../404.png')).pipe(res);
    }
}

// TODO depricate & update existing urls
// TODO make urls be generated based on file name
screenshotRouter.get('/:name', screenshot);
router.get('/:id/screenshot/:name', screenshot);

exports.main = router;
exports.screenshot = screenshotRouter;
exports.stats = statsRouter;
