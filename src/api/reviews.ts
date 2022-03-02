/* eslint-disable no-restricted-syntax */
import express, { Request, Response } from 'express';
import { FilterQuery } from 'mongoose';

import 'db/comment/model';
import { error, success, captureException, getDataInt, apiLinks, logger } from 'utils';
import PackageRepo from 'db/package/repo';
import { Review, ReviewDoc, RATINGS, REVIEW_MAX_LEN, RATING_MAP, Ratings } from 'db/review';
import RatingCount from 'db/rating_count/model';
import Package from 'db/package/model';
import { authenticate, anonymousAuthenticate, userRole } from 'middleware';
import {
  APP_NOT_FOUND,
  PARAMETER_MISSING,
  REVIEW_TOO_LONG,
  INVALID_RATING,
  VERSION_NOT_FOUND,
  CANNOT_REVIEW_OWN_APP,
  NO_REVIEW_TO_EDIT,
  REVIEW_REDACTED,
  ALREADY_REVIEWED,
} from './error-messages';

const router = express.Router({ mergeParams: true });

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
  try {
    const pkg = await PackageRepo.findOne(req.params.id);
    if (!pkg) {
      return error(res, APP_NOT_FOUND, 404);
    }

    const skip = getDataInt(req, 'skip');
    let limit = getDataInt(req, 'limit', 10);
    if (limit < 0) {
      limit = 10;
    }
    else if (limit > 100) {
      limit = 100;
    }

    const query: FilterQuery<ReviewDoc> = { pkg: pkg._id, redacted: false };

    // Add given filter criteria
    const from = getDataInt(req, 'from');
    if (from) {
      query.date = { $lt: new Date(from) };
    }

    if ('filter' in req.query && req.query.filter == 'apikey' && req.user) {
      query.user = req.user._id;
    }
    else {
      // Since this is the reviews api, don't return reviews that are only a rating
      query.body = { $ne: '' };
    }

    const reviewsTotalCount = await Review.countDocuments(query);
    const reviews = await Review.find(query, null, { limit, sort: { date: -1 } }).populate('user').populate('comment');
    const { next, previous } = apiLinks(req.originalUrl, reviews.length, limit, skip);

    return success(res, {
      count: reviewsTotalCount,
      next,
      previous,
      reviews: reviews.map((review) => review.serialize()),
    });
  }
  catch (err) {
    logger.error('Error getting reviews');
    captureException(err, req.originalUrl);
    return error(res, 'There was an error getting the review list, please try again later');
  }
}

async function postReview(req: Request, res: Response) {
  try {
    // Check if necessary paramters are given (body can be empty)
    if (!req.body.version || !req.body.rating) {
      return error(res, PARAMETER_MISSING, 400);
    }

    const message = req.body.body ? req.body.body.trim() : '';
    const version = req.body.version;
    const rating = req.body.rating;
    const pkg = await PackageRepo.findOne(req.params.id);

    // Sanity checks
    if (!pkg) {
      return error(res, APP_NOT_FOUND, 404);
    }
    if (req.user!._id == pkg.maintainer) {
      return error(res, CANNOT_REVIEW_OWN_APP, 400);
    }
    if (!pkg.revisions || !pkg.revisions.find((revision) => revision.version == version)) {
      return error(res, VERSION_NOT_FOUND, 404);
    }
    if (message.length > REVIEW_MAX_LEN) {
      return error(res, REVIEW_TOO_LONG, 400);
    }
    if (RATINGS.indexOf(rating) == -1) {
      return error(res, INVALID_RATING, 400);
    }

    let ownReview;
    if (req.method == 'PUT') {
      // If the request method is PUT, the user is editing his existing review
      ownReview = await Review.findOne({ pkg: pkg._id, user: req.user!._id });
      if (!ownReview) {
        return error(res, NO_REVIEW_TO_EDIT, 400);
      }
      if (ownReview.redacted) {
        return error(res, REVIEW_REDACTED, 400);
      }
    }
    else {
      // User is creating a new review
      if (await Review.countDocuments({ user: req.user!._id, pkg: pkg._id }) != 0) {
        return error(res, ALREADY_REVIEWED, 400);
      }
      ownReview = new Review();
      ownReview.pkg = pkg._id;
      ownReview.user = req.user!._id;
      ownReview.redacted = false;
    }

    ownReview.body = message;
    ownReview.rating = rating;
    ownReview.version = version;
    ownReview.date = new Date();
    ownReview = await ownReview.save();

    await recalculateRatings(pkg._id);

    return success(res, { review_id: ownReview._id });
  }
  catch (err) {
    logger.error('Error posting a review');
    captureException(err, req.originalUrl);
    return error(res, 'There was an error posting your review, please try again later');
  }
}

router.get('/', anonymousAuthenticate, getReviews);
router.post('/', authenticate, userRole, postReview);
router.put('/', authenticate, userRole, postReview);

export default router;
