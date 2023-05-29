/* eslint-disable no-restricted-syntax */
import express, { Request, Response } from 'express';

import 'db/comment';
import { error, success, apiLinks, asyncErrorWrapper } from 'utils';
import { Review, RATINGS, REVIEW_MAX_LEN } from 'db/review';
import { authenticate, anonymousAuthenticate, userRole, fetchPublishedPackage } from 'middleware';
import { recalculatePackageRatings } from 'db/rating_count/utils';
import {
  PARAMETER_MISSING,
  REVIEW_TOO_LONG,
  INVALID_RATING,
  VERSION_NOT_FOUND,
  CANNOT_REVIEW_OWN_APP,
} from '../utils/error-messages';

const router = express.Router({ mergeParams: true });

/**
 * Get a list of reviews for a given app.
 */
async function getReviews(req: Request, res: Response) {
  const filters = Review.parseRequestFilters(req);
  const reviewsTotalCount = await Review.countByFilters(filters);
  const reviews = await Review.findByFilters(filters, filters.limit, filters.skip);
  const { next, previous } = apiLinks(req.originalUrl, reviews.length, filters.limit, filters.skip);

  return success(res, {
    count: reviewsTotalCount,
    next,
    previous,
    reviews: reviews.map((review) => review.serialize()),
  });
}

router.get(
  '/',
  anonymousAuthenticate,
  fetchPublishedPackage(),
  asyncErrorWrapper(getReviews, 'There was an error getting the review list, please try again later'),
);

/**
 * Update or create a review
 */
async function upsertReview(req: Request, res: Response) {
  if (!req.body.version || !req.body.rating) {
    return error(res, PARAMETER_MISSING, 400);
  }

  const body = req.body.body ? req.body.body.trim() : '';
  const version = req.body.version;
  const rating = req.body.rating;

  // Users cannot upload a review for their own app
  if (req.user!._id.toString() == req.pkg.maintainer) {
    return error(res, CANNOT_REVIEW_OWN_APP, 400);
  }
  if (!req.pkg.revisions || !req.pkg.revisions.find((revision) => revision.version == version)) {
    return error(res, VERSION_NOT_FOUND, 404);
  }
  if (body.length > REVIEW_MAX_LEN) {
    return error(res, REVIEW_TOO_LONG, 400);
  }
  if (RATINGS.indexOf(rating) == -1) {
    return error(res, INVALID_RATING, 400);
  }

  const review = await Review.createOrUpdateExisting(req.pkg, req.user!, version, rating, body);
  await recalculatePackageRatings(req.pkg._id);

  return success(res, { review_id: review._id });
}

router.post(
  '/',
  authenticate,
  userRole,
  fetchPublishedPackage(),
  asyncErrorWrapper(upsertReview, 'There was an error posting your review, please try again later'),
);
router.put(
  '/',
  authenticate,
  userRole,
  fetchPublishedPackage(),
  asyncErrorWrapper(upsertReview, 'There was an error posting your review, please try again later'),
);

export default router;
