import { Schema, model } from 'mongoose';
import { RATINGS } from '../review/constants';
import { type HydratedRatingCount, type IRatingCount, type RatingCountModel } from './types';

const ratingCountSchema = new Schema<IRatingCount, RatingCountModel>({
  name: { type: String, enum: RATINGS },
  count: Number,
  package_id: String,
});

ratingCountSchema.statics.getCountsByIds = async function (ids: string[]) {
  const query = { package_id: { $in: ids } };

  const ratingCounts = await this.find(query).exec();

  return ratingCounts.reduce((accumulation: { [key: string]: HydratedRatingCount[] }, ratingCount: HydratedRatingCount) => {
    const value = accumulation[ratingCount.package_id] ? [...accumulation[ratingCount.package_id], ratingCount] : [ratingCount];

    return {
      ...accumulation,
      [ratingCount.package_id]: value,
    };
  }, {});
};

export const RatingCount = model<IRatingCount, RatingCountModel>('RatingCount', ratingCountSchema);
