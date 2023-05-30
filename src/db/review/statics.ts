/* eslint-disable no-param-reassign */

import { type FilterQuery, type Schema } from 'mongoose';
import { type Request } from 'express';

import { UserError } from 'exceptions';
import { REVIEW_REDACTED } from 'utils/error-messages';
import { getDataInt } from 'utils';
import { type HydratedUser } from 'db/user';
import { type HydratedPackage } from 'db/package';
import { type HydratedReview, type IReview, type IReviewMethods, type ReviewModel, type ReviewRequestFilters } from './types';
import { type Ratings } from './constants';

export function setupStatics(reviewSchema: Schema<IReview, ReviewModel, IReviewMethods>) {
  reviewSchema.statics.createOrUpdateExisting = async function (
    pkg: HydratedPackage,
    user: HydratedUser,
    version: string,
    rating: Ratings,
    body?: string,
  ): Promise<HydratedReview> {
    let ownReview = await this.findOne({ pkg: pkg._id, user: user._id });
    if (!ownReview) {
      ownReview = new this();
      ownReview.pkg = pkg._id;
      ownReview.user = user._id;
      ownReview.redacted = false;
    }

    if (ownReview.redacted) {
      throw new UserError(REVIEW_REDACTED);
    }

    ownReview.body = body;
    ownReview.rating = rating;
    ownReview.version = version;
    ownReview.date = new Date();
    ownReview = await ownReview.save();

    return ownReview;
  };

  reviewSchema.statics.parseRequestFilters = function (req: Request): ReviewRequestFilters {
    let limit = getDataInt(req, 'limit', 10);
    if (limit < 0) {
      limit = 10;
    }
    else if (limit > 100) {
      limit = 100;
    }

    const user = ('filter' in req.query && req.query.filter === 'apikey' && req.user) ? req.user._id : undefined;
    return {
      limit,
      skip: getDataInt(req, 'skip', 0),
      from: getDataInt(req, 'from'),
      pkg: req.pkg._id,
      user,
    };
  };

  reviewSchema.statics.parseFilters = function ({ pkg, user, from }: ReviewRequestFilters): FilterQuery<IReview> {
    const query: FilterQuery<IReview> = { pkg, redacted: false };

    if (from) {
      query.date = { $lt: new Date(from) };
    }

    if (user) {
      query.user = user;
    }
    else {
      // Since this is for the reviews api, don't return reviews that are only a rating
      query.body = { $ne: '' };
    }

    return query;
  };

  reviewSchema.statics.countByFilters = async function (filters: ReviewRequestFilters): Promise<number> {
    const query = this.parseFilters(filters);

    const result = await this.countDocuments(query);
    return result;
  };

  reviewSchema.statics.findByFilters = async function (
    filters: ReviewRequestFilters,
    limit?: number,
    skip?: number,
  ): Promise<HydratedReview[]> {
    const query = this.parseFilters(filters);

    const findQuery = this.find(query)
      .populate('user')
      .populate('comment')
      .sort({ date: -1 });

    if (limit) {
      void findQuery.limit(limit);
    }

    if (skip) {
      void findQuery.skip(skip);
    }

    const results = await findQuery.exec();
    return results;
  };
}
