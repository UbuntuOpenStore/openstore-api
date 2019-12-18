require('../db/comment/model');
const express = require('express');
const helpers = require('../utils/helpers');
const logger = require('../utils/logger');
const PackageRepo = require('../db/package/repo');
const Review = require('../db/review/model');
const RatingCount = require('../db/rating_count/model');
const Package = require('../db/package/model');
const {authenticate, userRole} = require('../utils/middleware');
const {serialize} = require('../db/review/serializer');

const REVIEW_MAX_LEN = 512;
const RATINGS = ['THUMBS_UP', 'THUMBS_DOWN', 'HAPPY', 'NEUTRAL', 'BUGGY'];

const APP_NOT_FOUND = 'App not found';
const PARAMETER_MISSING = 'Missing parameters for this endpoint';
const REVIEW_TOO_LONG = 'The review is too long';
const INVALID_RATING = 'Invalid rating';
const VERSION_NOT_FOUND = 'Specified version is unknown';
const CANNOT_REVIEW_OWN_APP = 'Reviewing your own app is not allowed';
const NO_REVIEW_TO_EDIT = 'You have no review to edit';
const REVIEW_REDACTED = 'Redacted review cannot be edited';
const ALREADY_REVIEWED = 'This app was already reviewed by you';


const router = express.Router({mergeParams: true});

async function recalculateRatings(pkgId) {
    let pkg = await Package.findOne({_id: pkgId}).populate('rating_counts');
    if (!pkg) {
        console.log('Failed to recalculate ratings: could not find package');
        return;
    }
    if (!pkg.rating_counts) {
        pkg.rating_counts = [];
    }
    let reviews = await Review.find({pkg: pkgId});

    for (let ratingName of RATINGS) {
        let count = 0;
        for (let rev of reviews) {
            if (rev.rating == ratingName) count++;
        }

        let updatedCount = false;
        for (let ratingCount of pkg.rating_counts) {
            if (ratingCount.name == ratingName) {
                ratingCount.count = count;
                await ratingCount.save();
                updatedCount = true;
                break;
            }
        }
        if (!updatedCount) {
            let ratingCount = RatingCount();
            ratingCount.name = ratingName;
            ratingCount.count = count;
            await ratingCount.save();
            pkg.rating_counts.push(ratingCount._id);
        }
    }
    await pkg.save();
}

/*
 * This function handles getting a (public) list of reviews for an app.
 * If the user specifies filter=apikey in the request, we continue
 * instead with authenticating the user and giving him his own review.
 */
async function getReviews(req, res, next) {
    try {
        if ('filter' in req.query && req.query.filter == 'apikey') {
            return next();
        }

        let pkg = await PackageRepo.findOne(req.params.id);
        if (!pkg) {
            return helpers.error(res, APP_NOT_FOUND, 400);
        }

        let limit = 10;
        if ('limit' in req.query) {
            limit = parseInt(req.query.limit, 10);
            if (Number.isNaN(limit) || limit < 0 || limit > 100) {
                limit = 10;
            }
        }

        let query = {pkg: pkg._id, body: {$ne: ''}};
        let reviewsTotalCount = await Review.countDocuments(query); // Total number of written reviews in database

        // Add given filter criteria
        if ('from' in req.query && !Number.isNaN(parseInt(req.query.from, 10))) {
            query.date = {$lt: new Date(parseInt(req.query.from, 10))};
        }

        let data = {
            count: reviewsTotalCount,
            reviews: [],
        };

        // Get reviews and craft the response object
        let reviews = await Review.find(query, null, {limit: limit, sort: {date: -1}}).populate('user', 'name').populate('comment');
        data.reviews = serialize(reviews);

        return helpers.success(res, data);
    }
    catch (err) {
        logger.error('Error getting reviews');
        helpers.captureException(err, req.originalUrl);
        return helpers.error(res, 'There was an error getting the review list, please try again later');
    }
}

async function getOwnReview(req, res) {
    try {
        let pkg = await PackageRepo.findOne(req.params.id);
        if (!pkg) {
            return helpers.error(res, APP_NOT_FOUND, 400);
        }

        let ownReview = await Review.findOne({pkg: pkg._id, user: req.user._id}).populate('comment');
        let data = {
            count: 0,
            reviews: [],
        };
        if (ownReview) {
            data.count++;
            data.reviews = serialize([ownReview]);
        }

        return helpers.success(res, data);
    }
    catch (err) {
        logger.error('Error getting own review');
        helpers.captureException(err, req.originalUrl);
        return helpers.error(res, 'There was an error getting your own review, please try again later');
    }
}


async function postReview(req, res) {
    try {
        // Check if necessary paramters are given
        if (!('body' in req.body) || !('version' in req.body) || !('rating' in req.body)) {
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
        if (req.user._id == pkg.maintainer) {
            return helpers.error(res, CANNOT_REVIEW_OWN_APP, 400);
        }
        if (!pkg.revisions || !pkg.revisions.find((revision) => revision.version == version)) {
            return helpers.error(res, VERSION_NOT_FOUND, 400);
        }
        if (message.length > REVIEW_MAX_LEN) {
            return helpers.error(res, REVIEW_TOO_LONG, 400);
        }
        if (RATINGS.indexOf(rating) == -1) {
            return helpers.error(res, INVALID_RATING, 400);
        }

        let ownReview;
        if (req.method == 'PUT') {
            // If the request method is PUT, the user is editing his existing review
            ownReview = await Review.findOne({pkg: pkg._id, user: req.user._id});
            if (!ownReview) {
                return helpers.error(res, NO_REVIEW_TO_EDIT, 400);
            }
            if (ownReview.redacted) {
                return helpers.error(res, REVIEW_REDACTED, 400);
            }
        }
        else {
            // User is creating a new review
            if (await Review.countDocuments({user: req.user._id, pkg: pkg._id}) != 0) {
                return helpers.error(res, ALREADY_REVIEWED, 400);
            }
            ownReview = Review();
            ownReview.pkg = pkg._id;
            ownReview.user = req.user._id;
            ownReview.redacted = false;
        }

        ownReview.body = message;
        ownReview.rating = rating;
        ownReview.version = version;
        ownReview.date = new Date();
        ownReview = await ownReview.save();

        await recalculateRatings(pkg._id);

        return helpers.success(res, {review_id: ownReview._id});
    }
    catch (err) {
        logger.error('Error posting a review');
        helpers.captureException(err, req.originalUrl);
        return helpers.error(res, 'There was an error posting your review, please try again later');
    }
}

router.get('/', getReviews, authenticate, userRole, getOwnReview);
router.post('/', authenticate, userRole, postReview);
router.put('/', authenticate, userRole, postReview);

exports.main = router;
exports.ratings = RATINGS;
