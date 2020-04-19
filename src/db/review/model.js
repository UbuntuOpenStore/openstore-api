const mongoose = require('mongoose');
const { RATINGS } = require('./constants');


const reviewSchema = mongoose.Schema({
    pkg: {type: mongoose.Schema.Types.ObjectId, ref: 'Package'},
    version: String,
    user: {type: mongoose.Schema.Types.ObjectId, ref: 'User'},
    rating: {type: String, enum: RATINGS},
    body: String,
    date: Date,
    redacted: Boolean,
    comment: {type: mongoose.Schema.Types.ObjectId, ref: 'Comment'},
});

const Review = mongoose.model('Review', reviewSchema);

module.exports = Review;
