import { Document, FilterQuery, Model, Types } from 'mongoose';
import { Request } from 'express';

import { PackageSchema, PackageDoc } from '../package/types';
import { CommentSchema } from '../comment/types';
import { UserSchema, UserDoc } from '../user/types';
import { Ratings } from './constants';

export interface ReviewSchema {
  pkg: PackageSchema;
  version: string;
  user: UserSchema;
  rating: Ratings;
  body?: string;
  date: Date,
  redacted: boolean,
  comment: CommentSchema;
}

export interface ReviewDoc extends ReviewSchema, Document {
  serialize(): ReviewSchema;
}

export type ReviewRequestFilters = {
  limit: number;
  skip: number;
  from?: number;
  pkg: any; // The mongoose _id is an any type
  user?: any;
}

// Copy of the type returned by mongoose queries
export type ReviewQueryReturn = Document<any, any, ReviewDoc> & ReviewDoc & {
  _id: Types.ObjectId;
};

export interface ReviewModel extends Model<ReviewDoc> {
  createOrUpdateExisting(
    pkg: PackageDoc,
    user: UserDoc,
    version: string,
    rating: Ratings,
    body?: string,
  ): Promise<ReviewDoc & { _id: any }>;
  parseRequestFilters(req: Request): ReviewRequestFilters;
  parseFilters(filters: ReviewRequestFilters): FilterQuery<ReviewDoc>;
  countByFilters(filters: ReviewRequestFilters): Promise<number>;
  findByFilters(
    filters: ReviewRequestFilters,
    limit?: number,
    skip?: number,
  ): Promise<ReviewQueryReturn[]>;
}
