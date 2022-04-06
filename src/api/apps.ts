import mime from 'mime';
import express, { Request, Response } from 'express';

import fsPromise from 'fs/promises';
import fs from 'fs';
import { Architecture, Channel, DEFAULT_CHANNEL, PackageDoc } from 'db/package/types';
import { Package } from 'db/package';
import PackageSearch from 'db/package/search';
import { RatingCount } from 'db/rating_count';
import { success, error, captureException, getData, apiLinks, logger } from 'utils';
import reviews from './reviews';
import { APP_NOT_FOUND, DOWNLOAD_NOT_FOUND_FOR_CHANNEL, INVALID_CHANNEL, INVALID_ARCH } from './error-messages';

// TODO properly namespace these so we only need one router
const router = express.Router();
const screenshotRouter = express.Router();
const statsRouter = express.Router();

async function apps(req: Request, res: Response) {
  const filters = Package.parseRequestFilters(req);
  let count = 0;
  let pkgs: PackageDoc[] = [];

  try {
    if (filters.search && filters.search.indexOf('author:') !== 0) {
      const results = await PackageSearch.search(filters, filters.sort, filters.skip, filters.limit);
      const hits = results.hits.hits.map((hit: any) => hit._source);
      count = results.hits.total;

      const ids = hits.map((pkg: any) => pkg.id);
      if (req.query.full) {
        pkgs = await Package.findByFilters({ ids });

        // Maintain ordering from the elastic search results
        pkgs.sort((a, b) => ids.indexOf(a.id) - ids.indexOf(b.id));
      }
      else {
        // Get the ratings
        const ratingCounts = await RatingCount.getCountsByIds(ids);

        pkgs = hits.map((pkg: any) => {
          return new Package({
            ...pkg,
            rating_counts: ratingCounts[pkg.id] || [],
          });
        });
      }
    }
    else {
      const publishedFilters = { ...filters, published: true };
      pkgs = await Package.findByFilters(publishedFilters, publishedFilters.sort, publishedFilters.limit, publishedFilters.skip);
      count = await Package.countByFilters(publishedFilters);
    }

    const arch = getData(req, 'architecture', Architecture.ARMHF);
    const formatted = pkgs.map((pkg) => {
      if (req.query.full) {
        return pkg.serialize(arch, req.apiVersion);
      }

      return pkg.serializeSlim();
    });

    const { next, previous } = apiLinks(req.originalUrl, Array.isArray(formatted) ? formatted.length : 0, filters.limit, filters.skip);
    return success(res, { count, next, previous, packages: formatted });
  }
  catch (err) {
    logger.error('Error fetching packages');
    captureException(err, req.originalUrl);
    return error(res, 'Could not fetch app list at this time');
  }
}

router.get('/', apps);
router.post('/', apps);

statsRouter.get('/', async(req: Request, res: Response) => success(res, await Package.stats()));

router.get('/:id', async(req: Request, res: Response) => {
  try {
    req.query.published = 'true';
    const pkg = await Package.findOneByFilters(req.params.id, req.query);

    if (pkg) {
      const arch = getData(req, 'architecture', Architecture.ARMHF);
      return success(res, pkg.serialize(arch, req.apiVersion));
    }

    return error(res, APP_NOT_FOUND, 404);
  }
  catch (err) {
    logger.error('Error fetching packages');
    captureException(err, req.originalUrl);
    return error(res, 'Could not fetch app list at this time');
  }
});

async function download(req: Request, res: Response) {
  try {
    const pkg = await Package.findOneByFilters(req.params.id, { published: true });
    if (!pkg) {
      return error(res, APP_NOT_FOUND, 404);
    }

    const channel = req.params.channel ? req.params.channel.toLowerCase() as Channel : DEFAULT_CHANNEL;
    if (!Object.values(Channel).includes(channel)) {
      return error(res, INVALID_CHANNEL, 400);
    }

    const arch = req.params.arch ? req.params.arch.toLowerCase() as Architecture : Architecture.ARMHF;
    if (!Object.values(Architecture).includes(arch)) {
      return error(res, INVALID_ARCH, 400);
    }

    const version = req.params.version && req.params.version != 'latest' ? req.params.version : undefined;
    const { revisionData, revisionIndex } = pkg.getLatestRevision(channel, arch, true, undefined, version);

    if (!revisionData || !revisionData.download_url) {
      return error(res, DOWNLOAD_NOT_FOUND_FOR_CHANNEL, 404);
    }

    const stat = await fsPromise.stat(revisionData.download_url);
    res.setHeader('Content-Length', stat.size);
    res.setHeader('Content-type', mime.getType(revisionData.download_url) ?? '');
    res.setHeader('Content-Disposition', `attachment; filename=${pkg.id}_${revisionData.version}_${arch}.click`);

    fs.createReadStream(revisionData.download_url).pipe(res);

    return await Package.incrementDownload(pkg._id, revisionIndex);
  }
  catch (err) {
    logger.error('Error downloading package');
    captureException(err, req.originalUrl);
    return error(res, 'Could not download package at this time');
  }
}

router.get('/:id/download/:channel/:arch', download);
router.get('/:id/download/:channel/:arch/:version', download);

router.use('/:id/reviews', reviews);

// can be removed in next api version
router.get('/:id/icon/:version', (req: Request, res: Response) => {
  const id = req.params.id.replace('.png', '').replace('.svg', '').replace('.jpg', '').replace('.jpeg', '');

  res.redirect(301, `/icons/${id}/${id}-${req.params.version || '0.0.0'}`);
});

// can be removed in next api version
function getScreenshot(req: Request, res: Response) {
  res.redirect(301, `/screenshots/${req.params.name}`);
}

screenshotRouter.get('/:name', getScreenshot);
router.get('/:id/screenshot/:name', getScreenshot);

export const main = router;
export const screenshot = screenshotRouter;
export const stats = statsRouter;
