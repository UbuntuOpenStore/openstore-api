import { ReviewDoc } from './types';

function toJson(review: ReviewDoc) {
  // Comment is optional
  let comment: null | { body: string, date: number } = null;
  if (review.comment) {
    comment = {
      body: review.comment.body,
      date: review.comment.date.getTime(),
    };
  }

  return {
    author: review.user.name || review.user.username,
    body: review.body,
    version: review.version,
    rating: review.rating,
    date: review.date.getTime(),
    redacted: review.redacted,
    comment,
  };
}

export function serialize(reviews: ReviewDoc[] | ReviewDoc) {
  if (Array.isArray(reviews)) {
    return reviews.map(toJson);
  }

  return toJson(reviews);
}
