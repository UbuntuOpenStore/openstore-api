const RATINGS = require('../../api/reviews').ratings;
const mongoose = require('mongoose');

const ratingCountSchema = mongoose.Schema({
    name: {type: String, enum: RATINGS},
    count: Number
});

const RatingCount = mongoose.model('RatingCount', ratingCountSchema);

module.exports = RatingCount;
