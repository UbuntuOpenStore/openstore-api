const express = require('express');

const Package = require('../db/package/model');
const PackageRepo = require('../db/package/repo');
const config = require('../utils/config');
const logger = require('../utils/logger');
const helpers = require('../utils/helpers');
const translations = require('../utils/translations');
const categoryIcons = require('./json/category_icons.json');

const categoryNames = Object.keys(categoryIcons);
const router = express.Router();

router.get('/', async (req, res) => {
    let lang = req.query.lang ? req.query.lang : null;
    translations.setLang(lang);

    let channel = req.query.channel ? req.query.channel.toLowerCase() : Package.XENIAL;
    if (!Package.CHANNELS.includes(channel)) {
        channel = Package.XENIAL;
    }

    try {
        let categories = [];
        if (req.query.all) {
            /* eslint-disable-next-line arrow-body-style */
            categories = categoryNames.map((category) => {
                return {
                    category: category,
                    translation: translations.gettext(category),
                    icon: config.server.host + categoryIcons[category],
                };
            });
        }
        else {
            categories = await PackageRepo.categoryStats(channel);

            /* eslint-disable arrow-body-style */
            /* eslint-disable no-underscore-dangle */
            categories = categories.filter((category) => !!category._id)
                .map((category) => {
                    return {
                        category: category._id,
                        translation: translations.gettext(category._id),
                        count: category.count,
                        icon: config.server.host + categoryIcons[category._id],
                    };
                });
        }

        helpers.success(res, categories);
    }
    catch (err) {
        logger.error('Error fetching categories');
        helpers.captureException(err, req.originalUrl);
        helpers.error(res, 'Could not fetch category list at this time');
    }
});

module.exports = router;
