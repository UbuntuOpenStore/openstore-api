const mongoose = require('mongoose');
const { RATINGS } = require('../review/constants');

const ratingCountSchema = mongoose.Schema({
  name: { type: String, enum: RATINGS },
  count: Number,
  package_id: String,
});

const RatingCount = mongoose.model('RatingCount', ratingCountSchema);

module.exports = RatingCount;
