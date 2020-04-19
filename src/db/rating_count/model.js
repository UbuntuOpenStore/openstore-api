const mongoose = require('mongoose');
const { RATINGS } = require('../review/constants');

const ratingCountSchema = mongoose.Schema({
  name: { type: String, enum: RATINGS },
  count: Number,
});

const RatingCount = mongoose.model('RatingCount', ratingCountSchema);

module.exports = RatingCount;
