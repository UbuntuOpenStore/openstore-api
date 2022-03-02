import { Schema, model } from 'mongoose';
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

reviewSchema.methods.serialize = function() {
  let comment: null | { body: string, date: number } = null;
  if (this.comment) {
    comment = {
      body: this.comment.body,
      date: this.comment.date.getTime(),
    };
  }

  return {
    author: this.user.name || this.user.username,
    body: this.body,
    version: this.version,
    rating: this.rating,
    date: this.date.getTime(),
    redacted: this.redacted,
    comment,
  };
};

export const Review = model<ReviewDoc, ReviewModel>('Review', reviewSchema);
