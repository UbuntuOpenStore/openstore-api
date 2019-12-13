const path = require('path');
const mime = require('mime');
const express = require('express');

const Package = require('../db/package/model');
const PackageRepo = require('../db/package/repo');
const PackageSearch = require('../db/package/search');
const {serialize} = require('../db/package/serializer');
const config = require('../utils/config');
const logger = require('../utils/logger');
const helpers = require('../utils/helpers');
const apiLinks = require('../utils/api-links');
const fs = require('../utils/async-fs');

// TODO properly namespace these so we only need one router
const router = express.Router();
const screenshotRouter = express.Router();
const statsRouter = express.Router();

const APP_NOT_FOUND = 'App not found';
const DOWNLOAD_NOT_FOUND_FOR_CHANNEL = 'Download not available for this channel';
const INVALID_CHANNEL = 'The provided channel is not valid';
const INVALID_ARCH = 'The provided architecture is not valid';

async function apps(req, res) {
    let filters = PackageRepo.parseRequestFilters(req);
    let count = 0;
    let pkgs = [];

    try {
        if (filters.search && filters.search.indexOf('author:') !== 0) {
            let results = await PackageSearch.search(filters, filters.sort, filters.skip, filters.limit);
            /* eslint-disable no-underscore-dangle */
            pkgs = results.hits.hits.map((hit) => hit._source);
            count = results.hits.total;
        }
        else {
            filters.published = true;
            pkgs = await PackageRepo.find(filters, filters.sort, filters.limit, filters.skip);
            count = await PackageRepo.count(filters);
        }

        let formatted = serialize(pkgs, true, req.query.architecture, req.apiVersion);
        let {next, previous} = apiLinks(req.originalUrl, formatted.length, req.query.limit, req.query.skip);
        return helpers.success(res, {count, next, previous, packages: formatted});
    }
    catch (err) {
        logger.error('Error fetching packages');
        helpers.captureException(err, req.originalUrl);
        return helpers.error(res, 'Could not fetch app list at this time');
    }
}

router.get('/', apps);
router.post('/', apps);

statsRouter.get('/', async (req, res) => helpers.success(res, await PackageRepo.stats()));

router.get('/:id', async (req, res) => {
    try {
        req.query.published = true;
        let pkg = await PackageRepo.findOne(req.params.id, req.query);

        if (pkg) {
            return helpers.success(res, serialize(pkg, false, req.query.architecture, req.apiVersion));
        }

        return helpers.error(res, APP_NOT_FOUND, 404);
    }
    catch (err) {
        logger.error('Error fetching packages');
        helpers.captureException(err, req.originalUrl);
        return helpers.error(res, 'Could not fetch app list at this time');
    }
});

router.get('/:id/download/:channel/:arch', async (req, res) => {
    try {
        let pkg = await PackageRepo.findOne(req.params.id, { published: true });
        if (!pkg) {
            return helpers.error(res, APP_NOT_FOUND, 404);
        }

        let channel = req.params.channel ? req.params.channel.toLowerCase() : Package.XENIAL;
        if (!Package.CHANNELS.includes(channel)) {
            return helpers.error(res, INVALID_CHANNEL);
        }

        let arch = req.params.arch ? req.params.arch.toLowerCase() : Package.ARMHF;
        if (!Package.ARCHITECTURES.includes(arch)) {
            return helpers.error(res, INVALID_ARCH);
        }

        let { revisionData, revisionIndex } = pkg.getLatestRevision(channel, arch);

        let downloadUrl = '';
        if (revisionData) {
            // encode url for b2
            downloadUrl = revisionData.download_url.replace(/,/g, '%2C');
        }
        else {
            return helpers.error(res, DOWNLOAD_NOT_FOUND_FOR_CHANNEL, 404);
        }

        let ext = path.extname(downloadUrl);
        let filename = `${config.data_dir}/${pkg.id}-${channel}-${arch}-${revisionData.version}${ext}`;
        let headers = { 'Content-Disposition': `attachment; filename=${pkg.id}_${revisionData.version}_${arch}.click` };
        await helpers.checkDownload(downloadUrl, filename, headers, res);
        return await PackageRepo.incrementDownload(pkg._id, revisionIndex);
    }
    catch (err) {
        logger.error('Error downloading package');
        helpers.captureException(err, req.originalUrl);
        return helpers.error(res, 'Could not download package at this time');
    }
});

async function icon(req, res) {
    let id = req.params.id.replace('.png', '').replace('.svg', '').replace('.jpg', '').replace('.jpeg', '');

    try {
        // Not filtering out unpublished packages here so we can show the icon when managing apps
        let pkg = await PackageRepo.findOne(id);
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
