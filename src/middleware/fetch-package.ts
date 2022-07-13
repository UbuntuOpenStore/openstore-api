import { Request, Response, NextFunction } from 'express';

import { Package, PackageRequestFilters } from 'db/package';
import { captureException, error, logger } from 'utils';
import { APP_NOT_FOUND } from 'utils/error-messages';

export function fetchPackage(published = false, useQuery = false) {
  return async function(req: Request, res: Response, next: NextFunction) {
    try {
      let filters: PackageRequestFilters = {};
      if (useQuery) {
        filters = Package.parseRequestFilters(req);
        delete filters.published;
      }

      if (published) {
        filters.published = true;
      }

      const pkg = await Package.findOneByFilters(req.params.id, filters);
      if (!pkg) {
        return error(res, APP_NOT_FOUND, 404);
      }

      req.pkg = pkg;
      return next();
    }
    catch (err) {
      logger.error('Error fetching package');
      captureException(err, req.originalUrl);
      return error(res, 'Could not fetch app info at this time');
    }
  };
}

export function fetchPublishedPackage(useQuery = false) {
  return fetchPackage(true, useQuery);
}
