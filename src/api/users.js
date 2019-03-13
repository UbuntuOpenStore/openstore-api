const express = require('express');
const passport = require('passport');

const User = require('../db/user/model');
const helpers = require('../utils/helpers');

const router = express.Router();
const USER_NOT_FOUND = 'User not found';

function userToJson(user) {
    return {
        /* eslint-disable no-underscore-dangle */
        _id: user._id,
        email: user.email,
        name: user.name,
        role: user.role ? user.role : 'community',
        username: user.username,
    };
}

router.get('/', passport.authenticate('localapikey', {session: false}), helpers.isAdmin, (req, res) => {
    User.find({}).then((users) => {
        helpers.success(res, users.map(userToJson));
    }).catch((err) => {
        helpers.error(res, err);
    });
});

router.get('/:id', passport.authenticate('localapikey', {session: false}), helpers.isAdmin, (req, res) => {
    User.findOne({_id: req.params.id}).then((user) => {
        if (!user) {
            throw USER_NOT_FOUND;
        }

        helpers.success(res, userToJson(user));
    }).catch((err) => {
        if (err == USER_NOT_FOUND) {
            helpers.error(res, USER_NOT_FOUND, 404);
        }
        else {
            helpers.error(res, err);
        }
    });
});

router.put('/:id', passport.authenticate('localapikey', {session: false}), helpers.isAdmin, (req, res) => {
    User.findOne({_id: req.params.id}).then((user) => {
        if (!user) {
            throw USER_NOT_FOUND;
        }

        user.role = req.body.role;

        return user.save();
    }).then((user) => {
        helpers.success(res, userToJson(user));
    }).catch((err) => {
        if (err == USER_NOT_FOUND) {
            helpers.error(res, USER_NOT_FOUND, 404);
        }
        else {
            helpers.error(res, err);
        }
    });
});

module.exports = router;
