function toJson(review) {
  // Comment is optional
  let comment = null;
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

function serialize(reviews) {
  if (Array.isArray(reviews)) {
    return reviews.map(toJson);
  }

  return toJson(reviews);
}

exports.serialize = serialize;
