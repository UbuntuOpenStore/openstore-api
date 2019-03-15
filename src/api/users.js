const express = require('express');

const User = require('../db/user/model');
const helpers = require('../utils/helpers');
const {authenticate, adminOnly} = require('../utils/middleware');

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

router.get('/', authenticate, adminOnly, async (req, res) => {
    try {
        let users = await User.find({});
        return helpers.success(res, users.map(userToJson));
    }
    catch (err) {
        return helpers.error(res, err);
    }
});

router.get('/:id', authenticate, adminOnly, async (req, res) => {
    try {
        let user = await User.findOne({_id: req.params.id});
        if (!user) {
            return helpers.error(res, USER_NOT_FOUND, 404);
        }

        return helpers.success(res, userToJson(user));
    }
    catch (err) {
        return helpers.error(res, err);
    }
});

router.put('/:id', authenticate, adminOnly, async (req, res) => {
    try {
        let user = await User.findOne({_id: req.params.id});
        if (!user) {
            return helpers.error(res, USER_NOT_FOUND, 404);
        }

        user.role = req.body.role;
        await user.save();

        return helpers.success(res, userToJson(user));
    }
    catch (err) {
        return helpers.error(res, err);
    }
});

module.exports = router;
