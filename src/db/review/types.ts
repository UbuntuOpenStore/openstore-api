import { type FilterQuery, type HydratedDocument, type Model, type Types } from 'mongoose';
import { type Request } from 'express';

import { type HydratedUser } from 'db/user';
import { type HydratedPackage } from '../package/types';
import { type Ratings } from './constants';

export interface IReview {
  pkg: Types.ObjectId;
  version: string;
  user: Types.ObjectId;
  rating: Ratings;
  body?: string;
  date: Date;
  redacted: boolean;
  comment: Types.ObjectId;
}

export type SerializedReview = {
  author: string;
  body?: string;
  version: string;
  rating: Ratings;
  date: number;
  redacted: boolean;
  comment: {
    body: string;
    date: number;
  } | null;
};

export interface IReviewMethods {
  serialize: () => SerializedReview;
}

export type ReviewRequestFilters = {
  limit: number;
  skip: number;
  from?: number;
  pkg: any; // The mongoose _id is an any type
  user?: any;
};

export type HydratedReview = HydratedDocument<IReview, IReviewMethods>;

export interface ReviewModel extends Model<IReview, unknown, IReviewMethods> {
  createOrUpdateExisting: (
    pkg: HydratedPackage,
    user: HydratedUser,
    version: string,
    rating: Ratings,
    body?: string,
  ) => Promise<HydratedReview>;
  parseRequestFilters: (req: Request) => ReviewRequestFilters;
  parseFilters: (filters: ReviewRequestFilters) => FilterQuery<IReview>;
  countByFilters: (filters: ReviewRequestFilters) => Promise<number>;
  findByFilters: (
    filters: ReviewRequestFilters,
    limit?: number,
    skip?: number,
  ) => Promise<HydratedReview[]>;
}
