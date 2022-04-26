/* eslint-disable no-restricted-syntax */
import express, { Request, Response } from 'express';
import { FilterQuery } from 'mongoose';

import 'db/comment';
import { error, success, getDataInt, apiLinks, logger, asyncErrorWrapper } from 'utils';
import { Review, ReviewDoc, RATINGS, REVIEW_MAX_LEN, RATING_MAP, Ratings } from 'db/review';
import { RatingCount } from 'db/rating_count';
import { Package } from 'db/package';
import { authenticate, anonymousAuthenticate, userRole, fetchPublishedPackage } from 'middleware';
import {
  PARAMETER_MISSING,
  REVIEW_TOO_LONG,
  INVALID_RATING,
  VERSION_NOT_FOUND,
  CANNOT_REVIEW_OWN_APP,
} from '../utils/error-messages';

const router = express.Router({ mergeParams: true });

// TODO move to a Package method
export async function recalculateRatings(pkgId: string) {
  let pkg = await Package.findOne({ _id: pkgId }).populate('rating_counts');
  if (!pkg) {
    logger.error('Failed to recalculate ratings: could not find package');
    return null;
  }

  let calculatedRating = 0;
  if (!pkg.rating_counts) {
    pkg.rating_counts = [];
  }

  const reviews = await Review.find({ pkg: pkgId } as FilterQuery<ReviewDoc>);

  for (const ratingName of RATINGS) {
    let count = 0;
    for (const rev of reviews) {
      if (rev.rating == ratingName) count++;
    }

    calculatedRating += RATING_MAP[ratingName as keyof typeof RATING_MAP] * count;

    let updatedCount = false;
    for (const ratingCount of pkg.rating_counts) {
      if (ratingCount.name == ratingName) {
        ratingCount.count = count;
        ratingCount.package_id = pkg.id;

        /* eslint-disable-next-line no-await-in-loop */
        await ratingCount.save();
        updatedCount = true;

        break;
      }
    }

    if (!updatedCount) {
      const ratingCount = new RatingCount();
      ratingCount.name = ratingName as Ratings;
      ratingCount.count = count;
      ratingCount.package_id = pkg.id;

      /* eslint-disable-next-line no-await-in-loop */
      await ratingCount.save();

      pkg.rating_counts.push(ratingCount._id);
    }
  }

  // TODO only save the rating_counts & calculated_rating
  pkg.calculated_rating = calculatedRating;
  pkg = await pkg.save();
  return pkg;
}

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

async function postReview(req: Request, res: Response) {
  if (!req.body.version || !req.body.rating) {
    return error(res, PARAMETER_MISSING, 400);
  }

  const body = req.body.body ? req.body.body.trim() : '';
  const version = req.body.version;
  const rating = req.body.rating;

  // Sanity checks
  if (req.user!._id == req.pkg.maintainer) {
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
  await recalculateRatings(req.pkg._id);

  return success(res, { review_id: review._id });
}

router.get(
  '/',
  anonymousAuthenticate,
  fetchPublishedPackage(),
  asyncErrorWrapper(getReviews, 'There was an error getting the review list, please try again later'),
);
router.post(
  '/',
  authenticate,
  userRole,
  fetchPublishedPackage(),
  asyncErrorWrapper(postReview, 'There was an error posting your review, please try again later'),
);
router.put(
  '/',
  authenticate,
  userRole,
  fetchPublishedPackage(),
  asyncErrorWrapper(postReview, 'There was an error posting your review, please try again later'),
);

export default router;
