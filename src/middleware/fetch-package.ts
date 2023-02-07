import { Request, Response, NextFunction } from 'express';

import { Package, PackageRequestFilters } from 'db/package';
import { asyncErrorWrapper } from 'utils';
import { APP_NOT_FOUND } from 'utils/error-messages';
import { pick } from 'lodash';
import { NotFoundError } from 'exceptions';

export function fetchPackage(published = false, useQuery = false) {
  return asyncErrorWrapper(async(req: Request, res: Response, next: NextFunction) => {
    let filters: PackageRequestFilters = {};
    if (useQuery) {
      filters = pick(
        Package.parseRequestFilters(req),
        'frameworks',
        'architectures',
        'channel',
      );
    }

    if (published) {
      filters.published = true;
    }

    const pkg = await Package.findOneByFilters(req.params.id, filters);
    if (!pkg) {
      throw new NotFoundError(APP_NOT_FOUND);
    }

    req.pkg = pkg;
    return next();
  }, 'Could not fetch app info at this time');
}

export function fetchPublishedPackage(useQuery = false) {
  return fetchPackage(true, useQuery);
}
