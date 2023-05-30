import { type HydratedDocument, type Model } from 'mongoose';
import { type Ratings } from '../review/constants';

export interface IRatingCount {
  name: Ratings;
  count: number;
  package_id: string;
}

export type HydratedRatingCount = HydratedDocument<IRatingCount>;

export interface RatingCountModel extends Model<IRatingCount> {
  getCountsByIds: (ids: string[]) => Promise<{ [key: string]: HydratedRatingCount[] }>;
}
