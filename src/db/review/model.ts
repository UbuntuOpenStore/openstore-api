import { Schema, model, Document } from 'mongoose';
import { RATINGS } from './constants';
import { ReviewDoc, ReviewModel } from './types';

export const reviewSchema = new Schema<ReviewDoc, ReviewModel>({
  pkg: { type: Schema.Types.ObjectId, ref: 'Package' },
  version: String,
  user: { type: Schema.Types.ObjectId, ref: 'User' },
  rating: { type: String, enum: RATINGS },
  body: String,
  date: Date,
  redacted: Boolean,
  comment: { type: Schema.Types.ObjectId, ref: 'Comment' },
});

export default model<ReviewDoc, ReviewModel>('Review', reviewSchema);
