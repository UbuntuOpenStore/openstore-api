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
const apiLinks = require('../utils/apiLinks');
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

        let {next, previous} = apiLinks(req.originalUrl, formatted.length, req.query.limit, req.query.skip);
        return helpers.success(res, {count, next, previous, packages: formatted});
    }
    catch (err) {
        logger.error('Error fetching packages:', err);
        console.error(err);
        return helpers.error(res, 'Could not fetch app list at this time');
    }
}

router.get('/', apps);
router.post('/', apps);

statsRouter.get('/', async (req, res) => {
    return helpers.success(res, await PackageRepo.stats());
});

router.get('/:id', async (req, res) => {
    try {
        let pkg = await PackageRepo.findOne(req.params.id, req.query);

        if (pkg) {
            helpers.success(res, packages.toJson(pkg, req));
        }
        else {
            helpers.error(res, APP_NOT_FOUND, 404);
        }
    }
    catch (err) {
        logger.error('Error fetching packages:', err);
        return helpers.error(res, 'Could not fetch app list at this time');
    }
});

router.get('/:id/download/:channel', async (req, res) => {
    try {
        let pkg = await PackageRepo.findOne(req.params.id, {});
        if (!pkg) {
            return helpers.error(res, APP_NOT_FOUND, 404);
        }

        let channel = req.params.channel ? req.params.channel.toLowerCase() : Package.XENIAL;
        let {revisionData, revisionIndex} = pkg.getLatestRevision(channel);

        let downloadUrl = '';
        if (revisionData) {
            // encode url for b2
            downloadUrl = revisionData.download_url.replace(/,/g, '%2C');
        }
        else {
            return helpers.error(res, DOWNLOAD_NOT_FOUND_FOR_CHANNEL, 404);
        }

        let ext = path.extname(downloadUrl);
        let filename = `${config.data_dir}/${pkg.id}-${channel}-${revisionData.version}${ext}`;
        let headers = {'Content-Disposition': `attachment; filename=${pkg.id}_${revisionData.version}_${pkg.architecture}.click`};
        await helpers.checkDownload(downloadUrl, filename, headers, res);
        await PackageRepo.incrementDownload(pkg._id, revisionIndex);
    }
    catch (err) {
        logger.error('Error downloading package:', err);
        console.error(err);
        return helpers.error(res, 'Could not download package at this time');
    }
});

async function icon(req, res) {
    let id = req.params.id.replace('.png', '').replace('.svg', '').replace('.jpg', '').replace('.jpeg', '');

    try {
        let pkg = await PackageRepo.findOne(req.params.id, {});
        if (!pkg || !pkg.icon) {
            throw APP_NOT_FOUND;
        }

        let ext = path.extname(pkg.icon);
        let filename = `${config.data_dir}/${pkg.version}-${pkg.id}${ext}`;
        let headers = {'Cache-Control': 'public, max-age=2592000'}; // 30 days
        await helpers.checkDownload(pkg.icon, filename, headers, res);
    }
    catch (err) {
        res.status(404);
        fs.createReadStream(path.join(__dirname, '../404.png')).pipe(res);
    }
}

router.get('/:id/icon/:version', icon);

function screenshot(req, res) {
    // TODO push these to b2 and use checkDownload()

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
