import mime from 'mime';
import express, { type Request, type Response } from 'express';

import fsPromise from 'fs/promises';
import fs from 'fs';
import { Architecture, Channel, DEFAULT_CHANNEL, type HydratedPackage } from 'db/package/types';
import { Package } from 'db/package';
import { success, getData, apiLinks, asyncErrorWrapper, getDataBoolean, getDataArray } from 'utils';
import { fetchPublishedPackage } from 'middleware';
import { NotFoundError, UserError } from 'exceptions';
import reviews from './reviews';
import { DOWNLOAD_NOT_FOUND_FOR_CHANNEL, INVALID_CHANNEL, INVALID_ARCH } from '../utils/error-messages';

const router = express.Router();

/**
 * Fetch a list of apps based on the given filters. If the `full` parameter is passed
 * then the full serialized object will be returned, otherwise the 'slim' version will be used.
 */
async function apps(req: Request, res: Response) {
  const filters = Package.parseRequestFilters(req);
  let count = 0;
  let pkgs: HydratedPackage[] = [];

  // Send search queries to elastic search
  // TODO move author searches to a different request parameter
  if (filters.search && !filters.search.startsWith('author:') && !filters.search.startsWith('publisher:')) {
    const results = await Package.searchByFilters(filters, getDataBoolean(req, 'full', false));
    pkgs = results.pkgs;
    count = results.count;
  }
  else {
    const publishedFilters = { ...filters, published: true };
    pkgs = await Package.findByFilters(publishedFilters, publishedFilters.sort, publishedFilters.limit, publishedFilters.skip);
    count = await Package.countByFilters(publishedFilters);
  }

  const arch = getData(req, 'architecture', Architecture.ARMHF) as Architecture;
  const channel = getData(req, 'channel', DEFAULT_CHANNEL) as Channel;
  const frameworks = getDataArray(req, 'frameworks', []);
  const formatted = pkgs.map((pkg) => {
    if (req.query.full) {
      return pkg.serialize(arch, channel, frameworks, req.apiVersion);
    }

    return pkg.serializeSlim();
  });

  const { next, previous } = apiLinks(req.originalUrl, formatted.length, filters.limit, filters.skip);
  success(res, { count, next, previous, packages: formatted });
}

// Available also as a POST to avoid issues with the GET request params being to large
router.get('/', asyncErrorWrapper(apps, 'Could not fetch app list at this time'));
router.post('/', asyncErrorWrapper(apps, 'Could not fetch app list at this time'));

/**
 * Get one app and return a serialized version.
 */
router.get('/:id', fetchPublishedPackage(true), async (req: Request, res: Response) => {
  const arch = getData(req, 'architecture', Architecture.ARMHF) as Architecture;
  const channel = getData(req, 'channel', DEFAULT_CHANNEL) as Channel;
  const frameworks = getDataArray(req, 'frameworks', []);
  success(res, req.pkg.serialize(arch, channel, frameworks, req.apiVersion));
});

/**
 * Gets the download for a given package for the given channel and architecture.
 */
async function download(req: Request, res: Response) {
  const channel = req.params.channel ? req.params.channel.toLowerCase() as Channel : DEFAULT_CHANNEL;
  if (!Object.values(Channel).includes(channel)) {
    throw new UserError(INVALID_CHANNEL);
  }

  const arch = req.params.arch ? req.params.arch.toLowerCase() as Architecture : Architecture.ARMHF;
  if (!Object.values(Architecture).includes(arch)) {
    throw new UserError(INVALID_ARCH);
  }

  const version = req.params.version && req.params.version !== 'latest' ? req.params.version : undefined;
  const { revisionData, revisionIndex } = req.pkg.getLatestRevision(channel, arch, true, undefined, version);

  if (!revisionData || !revisionData.download_url) {
    throw new NotFoundError(DOWNLOAD_NOT_FOUND_FOR_CHANNEL);
  }

  const stat = await fsPromise.stat(revisionData.download_url);
  res.setHeader('Content-Length', stat.size);
  res.setHeader('Content-type', mime.getType(revisionData.download_url) ?? '');
  res.setHeader('Content-Disposition', `attachment; filename=${req.pkg.id as string}_${revisionData.version}_${arch}.click`);

  // TODO let nginx handle this, making this just a 302
  fs.createReadStream(revisionData.download_url).pipe(res);

  await Package.incrementDownload(req.pkg._id, revisionIndex);
}

// The route gets the latest version
router.get('/:id/download/:channel/:arch', fetchPublishedPackage(), asyncErrorWrapper(download, 'Could not download package at this time'));
// This route is for getting historical versions
router.get(
  '/:id/download/:channel/:arch/:version',
  fetchPublishedPackage(),
  asyncErrorWrapper(download, 'Could not download package at this time'),
);

router.use('/:id/reviews', reviews);

export default router;
