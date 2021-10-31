const path = require('path');
const mime = require('mime');
const express = require('express');

const reviews = require('./reviews');
const Package = require('../db/package/model');
const PackageRepo = require('../db/package/repo');
const PackageSearch = require('../db/package/search');
const { serialize } = require('../db/package/serializer');
const RatingCountRepo = require('../db/rating_count/repo');
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
  const filters = PackageRepo.parseRequestFilters(req);
  let count = 0;
  let pkgs = [];

  try {
    if (filters.search && filters.search.indexOf('author:') !== 0) {
      const results = await PackageSearch.search(filters, filters.sort, filters.skip, filters.limit);
      pkgs = results.hits.hits.map((hit) => hit._source);
      count = results.hits.total;

      const ids = pkgs.map((pkg) => pkg.id);
      if (req.query.full) {
        pkgs = await PackageRepo.find({ ids });

        // Maintain ordering from the elastic search results
        pkgs.sort((a, b) => ids.indexOf(a.id) - ids.indexOf(b.id));
      }
      else {
        // Get the ratings
        const ratingCounts = await RatingCountRepo.findByIds(ids);

        pkgs = pkgs.map((pkg) => {
          return {
            ...pkg,
            rating_counts: ratingCounts[pkg.id] || [],
          };
        });
      }
    }
    else {
      filters.published = true;
      pkgs = await PackageRepo.find(filters, filters.sort, filters.limit, filters.skip);
      count = await PackageRepo.count(filters);
    }

    const formatted = serialize(pkgs, !req.query.full, req.query.architecture, req.apiVersion);
    const { next, previous } = apiLinks(req.originalUrl, formatted.length, req.query.limit, req.query.skip);
    return helpers.success(res, { count, next, previous, packages: formatted });
  }
  catch (err) {
    logger.error('Error fetching packages');
    helpers.captureException(err, req.originalUrl);
    return helpers.error(res, 'Could not fetch app list at this time');
  }
}

router.get('/', apps);
router.post('/', apps);

statsRouter.get('/', async(req, res) => helpers.success(res, await PackageRepo.stats()));

router.get('/:id', async(req, res) => {
  try {
    req.query.published = true;
    const pkg = await PackageRepo.findOne(req.params.id, req.query);

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

async function download(req, res) {
  try {
    const pkg = await PackageRepo.findOne(req.params.id, { published: true });
    if (!pkg) {
      return helpers.error(res, APP_NOT_FOUND, 404);
    }

    const channel = req.params.channel ? req.params.channel.toLowerCase() : Package.DEFAULT_CHANNEL;
    if (!Package.CHANNELS.includes(channel)) {
      return helpers.error(res, INVALID_CHANNEL, 400);
    }

    const arch = req.params.arch ? req.params.arch.toLowerCase() : Package.ARMHF;
    if (!Package.ARCHITECTURES.includes(arch)) {
      return helpers.error(res, INVALID_ARCH, 400);
    }

    const version = req.params.version && req.params.version != 'latest' ? req.params.version : null;
    const { revisionData, revisionIndex } = pkg.getLatestRevision(channel, arch, true, null, version);

    if (!revisionData || !revisionData.download_url) {
      return helpers.error(res, DOWNLOAD_NOT_FOUND_FOR_CHANNEL, 404);
    }

    const stat = await fs.statAsync(revisionData.download_url);
    res.setHeader('Content-Length', stat.size);
    res.setHeader('Content-type', mime.getType(revisionData.download_url));
    res.setHeader('Content-Disposition', `attachment; filename=${pkg.id}_${revisionData.version}_${arch}.click`);

    fs.createReadStream(revisionData.download_url).pipe(res);

    return await PackageRepo.incrementDownload(pkg._id, revisionIndex);
  }
  catch (err) {
    logger.error('Error downloading package');
    helpers.captureException(err, req.originalUrl);
    return helpers.error(res, 'Could not download package at this time');
  }
}

router.get('/:id/download/:channel/:arch', download);
router.get('/:id/download/:channel/:arch/:version', download);

router.use('/:id/reviews', reviews.main);

// TODO allow nginx to serve these directly
async function icon(req, res) {
  const id = req.params.id.replace('.png', '').replace('.svg', '').replace('.jpg', '').replace('.jpeg', '');

  try {
    // Not filtering out unpublished packages here so we can show the icon when managing apps
    const pkg = await PackageRepo.findOne(id);
    if (!pkg || !pkg.icon) {
      throw APP_NOT_FOUND;
    }

    const stat = await fs.statAsync(pkg.icon);
    res.setHeader('Content-Length', stat.size);
    res.setHeader('Content-type', mime.getType(pkg.icon));
    res.setHeader('Cache-Control', 'public, max-age=2592000'); // 30 days

    fs.createReadStream(pkg.icon).pipe(res);
  }
  catch (err) {
    res.status(404);
    fs.createReadStream(path.join(__dirname, '../404.png')).pipe(res);
  }
}

router.get('/:id/icon/:version', icon);

// TODO allow nginx to serve these directly
function screenshot(req, res) {
  const filename = `${config.image_dir}/${req.params.name}`;
  if (fs.existsSync(filename)) {
    res.setHeader('Content-type', mime.getType(filename));
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
