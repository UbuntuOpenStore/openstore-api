import { Schema, Document, model } from 'mongoose';
import { RATINGS } from '../review/constants';
import { RatingCountDoc, RatingCountModel } from './types';

const ratingCountSchema = new Schema<RatingCountDoc, RatingCountModel>({
  name: { type: String, enum: RATINGS },
  count: Number,
  package_id: String,
});

export default model<RatingCountDoc, RatingCountModel>('RatingCount', ratingCountSchema);
