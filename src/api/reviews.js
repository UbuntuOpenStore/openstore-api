const express = require('express');
const helpers = require('../utils/helpers');
const logger = require('../utils/logger');
const PackageRepo = require('../db/package/repo');
const Review = require('../db/review/model');
const Comment = require('../db/comment/model');
const RatingCount = require('../db/rating_count/model');
const Package = require('../db/package/model');
const {authenticate, userRole} = require('../utils/middleware');
const {serialize} = require('../db/review/serializer');

const REVIEW_MAX_LEN = 512;
const RATINGS = ["THUMBS_UP", "THUMBS_DOWN", "HAPPY", "NEUTRAL", "BUGGY"];

const APP_NOT_FOUND = 'App not found';
const PARAMETER_MISSING = 'Missing parameters for this endpoint';
const REVIEW_TOO_LONG = 'The review is too long';
const INVALID_RATING = 'Invalid rating'
const VERSION_NOT_FOUND = 'Specified version is unknown'
const CANNOT_REVIEW_OWN_APP = 'Reviewing your own app is not allowed'
const NO_REVIEW_TO_EDIT = 'You have no review to edit'
const REVIEW_REDACTED = 'Redacted review cannot be edited'
const ALREADY_REVIEWED = 'This app was already reviewed by you'


const router = express.Router({mergeParams: true});

router.get('/', get_reviews, authenticate, userRole, get_own_review);
router.post('/', authenticate, userRole, post_review);
router.put('/', authenticate, userRole, post_review);

/*
 * This function handles getting a (public) list of reviews for an app.
 * If the user specifies filter=apikey in the request, we continue
 * instead with authenticating the user and giving him his own review.
 */
async function get_reviews(req, res, next) {
    try {
        if(req.query.hasOwnProperty('filter') && req.query.filter == 'apikey') {
            return next();
        }

        let pkg = await PackageRepo.findOne(req.params.id);
        if (!pkg) {
            return helpers.error(res, APP_NOT_FOUND, 400);
        }

        let limit = 10;
        if(req.query.hasOwnProperty('limit')) {
            limit = parseInt(req.query.limit);
            if(isNaN(limit) || limit < 0 || limit > 100) {
                limit = 10
            }
        }

        let query = {pkg: pkg._id, body: {$ne: ""}};
        let reviews_total_count = await Review.countDocuments(query); // Total number of written reviews in database

        // Add given filter criteria
        if(req.query.hasOwnProperty('from') && !isNaN(parseInt(req.query.from))) {
            query.date = {$lt: new Date(parseInt(req.query.from))}
        }
        
        let data = {
            count: reviews_total_count,
            reviews: []
        }

        // Get reviews and craft the response object
        let reviews = await Review.find(query, null, {limit: limit, sort: {date: -1}}).populate('user', 'name').populate('comment');
        data.reviews = serialize(reviews);

        helpers.success(res, data);
    }
    catch (err) {
        logger.error('Error getting reviews');
        helpers.captureException(err, req.originalUrl);
        return helpers.error(res, 'There was an error getting the review list, please try again later');
    }
}

async function get_own_review(req, res) {
    try {
        let pkg = await PackageRepo.findOne(req.params.id);
        if (!pkg) {
            return helpers.error(res, APP_NOT_FOUND, 400);
        }

        let own_review = await Review.findOne({pkg: pkg._id, user: req.user._id}).populate('comment');
        let data = {
            count: 0,
            reviews: []
        }
        if(own_review) {
            data.count++;
            data.reviews = serialize([own_review]);
        }

        helpers.success(res, data);
    }
    catch (err) {
        logger.error('Error getting own review');
        helpers.captureException(err, req.originalUrl);
        return helpers.error(res, 'There was an error getting your own review, please try again later');
    }
}


async function post_review(req, res) {
    try {
        // Check if necessary paramters are given
        if(!('body' in req.body) || !('version' in req.body) || !('rating' in req.body)) {
            return helpers.error(res, PARAMETER_MISSING, 400);
        }

        let message = req.body.body.trim();
        let version = req.body.version;
        let rating = req.body.rating;
        let pkg = await PackageRepo.findOne(req.params.id);

        // Sanity checks
        if (!pkg) {
            return helpers.error(res, APP_NOT_FOUND, 400);
        }
        /*if(req.user._id == pkg.maintainer) {
            return helpers.error(res, CANNOT_REVIEW_OWN_APP, 400);
        }*/
        if(!pkg.revisions || !pkg.revisions.find((revision) => revision.version == version)) {
            return helpers.error(res, VERSION_NOT_FOUND, 400);
        }
        if(message.length > REVIEW_MAX_LEN) {
            return helpers.error(res, REVIEW_TOO_LONG, 400);
        }
        if(RATINGS.indexOf(rating) == -1) {
            return helpers.error(res, INVALID_RATING, 400);
        }

        let own_review;
        if(req.method == 'PUT') {
            // If the request method is PUT, the user is editing his existing review
            own_review = await Review.findOne({pkg: pkg._id, user: req.user._id});
            if(!own_review) {
                return helpers.error(res, NO_REVIEW_TO_EDIT, 400);
            }
            if(own_review.redacted) {
                return helpers.error(res, REVIEW_REDACTED, 400);
            }
        } else {
            // User is creating a new review
            if(await Review.countDocuments({user: req.user._id, pkg: pkg._id}) != 0) {
                return helpers.error(res, ALREADY_REVIEWED, 400);
            }
            own_review = Review();
            own_review.pkg = pkg._id;
            own_review.user = req.user._id;
            own_review.redacted = false;
        }

        own_review.body = message;
        own_review.rating = rating;
        own_review.version = version;
        own_review.date = new Date();
        own_review = await own_review.save();

        await recalculate_ratings(pkg._id);
        
        helpers.success(res, {review_id: own_review._id});
    }
    catch (err) {
        logger.error('Error posting a review');
        helpers.captureException(err, req.originalUrl);
        return helpers.error(res, 'There was an error posting your review, please try again later');
    }
}


async function recalculate_ratings(pkg_id) {
    let pkg = await Package.findOne({_id: pkg_id}).populate('rating_counts');
    if(!pkg) {
        console.log('Failed to recalculate ratings: could not find package');
        return;
    }
    if(!pkg.rating_counts) {
        pkg.rating_counts = [];
    }
    let reviews = await Review.find({pkg: pkg_id});

    for(let rating_name of RATINGS) {
        let count = 0;
        for(let rev of reviews) {
            if(rev.rating == rating_name) count++;
        }

        let updated_count = false;
        for(let rating_count of pkg.rating_counts) {
            if(rating_count.name == rating_name) {
                rating_count.count = count;
                await rating_count.save();
                updated_count = true;
                break;
            }
        }
        if(!updated_count) {
            let rating_count = RatingCount();
            rating_count.name = rating_name;
            rating_count.count = count;
            await rating_count.save();
            pkg.rating_counts.push(rating_count._id);
        }
    }
    await pkg.save();
}


exports.main = router;
exports.ratings = RATINGS;