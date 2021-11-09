import { Document, Model } from 'mongoose';
import { Ratings } from '../review/constants';

export interface RatingCountSchema {
  name: Ratings,
  count: number,
  package_id: string,
}

export interface RatingCountDoc extends RatingCountSchema, Document { }

export interface RatingCountModel extends Model<RatingCountDoc> { }
