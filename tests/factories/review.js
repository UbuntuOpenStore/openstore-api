const { factory } = require('factory-girl');

const Review = require('../../src/db/review/model');
const { RATINGS } = require('../../src/db/review/constants');

factory.define('review', Review, {
  rating: factory.oneOf(RATINGS),
  body: factory.sequence('Review.body', (n) => `review ${n}`),
  date: new Date(),
  redacted: false,
});
