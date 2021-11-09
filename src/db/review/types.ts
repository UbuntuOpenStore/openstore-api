import { Document, Model } from 'mongoose';
import { PackageSchema } from '../package/types';
import { CommentSchema } from '../comment/types';
import { UserSchema } from '../user/types';
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

export interface ReviewDoc extends ReviewSchema, Document { }

export interface ReviewModel extends Model<ReviewDoc> { }
