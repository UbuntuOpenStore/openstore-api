/* eslint-disable no-restricted-syntax */
import { FilterQuery, Types } from 'mongoose';

import { logger } from 'utils';
import { Review, RATINGS, RATING_MAP, Ratings, IReview } from 'db/review';
import { RatingCount } from 'db/rating_count';
import { Package } from 'db/package';

export async function recalculatePackageRatings(pkgId: Types.ObjectId) {
  let pkg = await Package.findOne({ _id: pkgId }).populate('rating_counts');
  if (!pkg) {
    logger.error('Failed to recalculate ratings: could not find package');
    return null;
  }

  let calculatedRating = 0;
  if (!pkg.rating_counts) {
    pkg.rating_counts = [] as any;
  }

  const reviews = await Review.find({ pkg: pkgId } as FilterQuery<IReview>);

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
