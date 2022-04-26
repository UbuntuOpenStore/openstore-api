import mime from 'mime';
import express, { Request, Response } from 'express';

import fsPromise from 'fs/promises';
import fs from 'fs';
import { Architecture, Channel, DEFAULT_CHANNEL, PackageDoc } from 'db/package/types';
import { Package } from 'db/package';
import PackageSearch from 'db/package/search';
import { RatingCount } from 'db/rating_count';
import { success, error, getData, apiLinks, asyncErrorWrapper } from 'utils';
import { fetchPublishedPackage } from 'middleware';
import reviews from './reviews';
import { DOWNLOAD_NOT_FOUND_FOR_CHANNEL, INVALID_CHANNEL, INVALID_ARCH } from '../utils/error-messages';

const router = express.Router();

async function apps(req: Request, res: Response) {
  const filters = Package.parseRequestFilters(req);
  let count = 0;
  let pkgs: PackageDoc[] = [];

  if (filters.search && filters.search.indexOf('author:') !== 0) {
    // TODO move this into a service method

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

router.get('/', asyncErrorWrapper(apps, 'Could not fetch app list at this time'));
router.post('/', asyncErrorWrapper(apps, 'Could not fetch app list at this time'));

router.get('/:id', fetchPublishedPackage(true), async(req: Request, res: Response) => {
  const arch = getData(req, 'architecture', Architecture.ARMHF);
  return success(res, req.pkg.serialize(arch, req.apiVersion));
});

async function download(req: Request, res: Response) {
  const channel = req.params.channel ? req.params.channel.toLowerCase() as Channel : DEFAULT_CHANNEL;
  if (!Object.values(Channel).includes(channel)) {
    return error(res, INVALID_CHANNEL, 400);
  }

  const arch = req.params.arch ? req.params.arch.toLowerCase() as Architecture : Architecture.ARMHF;
  if (!Object.values(Architecture).includes(arch)) {
    return error(res, INVALID_ARCH, 400);
  }

  const version = req.params.version && req.params.version != 'latest' ? req.params.version : undefined;
  const { revisionData, revisionIndex } = req.pkg.getLatestRevision(channel, arch, true, undefined, version);

  if (!revisionData || !revisionData.download_url) {
    return error(res, DOWNLOAD_NOT_FOUND_FOR_CHANNEL, 404);
  }

  const stat = await fsPromise.stat(revisionData.download_url);
  res.setHeader('Content-Length', stat.size);
  res.setHeader('Content-type', mime.getType(revisionData.download_url) ?? '');
  res.setHeader('Content-Disposition', `attachment; filename=${req.pkg.id}_${revisionData.version}_${arch}.click`);

  // TODO let nginx handle this, making this just a 302
  fs.createReadStream(revisionData.download_url).pipe(res);

  return Package.incrementDownload(req.pkg._id, revisionIndex);
}

router.get('/:id/download/:channel/:arch', fetchPublishedPackage(), asyncErrorWrapper(download, 'Could not download package at this time'));
router.get(
  '/:id/download/:channel/:arch/:version',
  fetchPublishedPackage(),
  asyncErrorWrapper(download, 'Could not download package at this time'),
);

router.use('/:id/reviews', reviews);

export default router;
