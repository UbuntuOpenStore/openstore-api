const fs = require('fs');
const Gettext = require('node-gettext');
const po = require('gettext-parser').po;
const express = require('express');

const Package = require('../db/package/model');
const config = require('../utils/config');
const logger = require('../utils/logger');
const helpers = require('../utils/helpers');
const categoryIcons = require('./json/category_icons.json');

const router = express.Router();
const gt = new Gettext();

let langs = [];
fs.readdirSync('../po').forEach((poFile) => {
    if (poFile.endsWith('.po')) {
        let lang = poFile.replace('.po', '');
        let fileName = `../po/${poFile}`;
        let content = fs.readFileSync(fileName, 'utf-8');
        let parsed = po.parse(content);

        langs.push(lang);
        gt.addTranslations(lang, 'messages', parsed);
    }
});

router.get('/', (req, res) => {
    if (
        req.originalUrl.substring(0, 18) == '/api/v1/categories' ||
        req.originalUrl.substring(0, 15) == '/api/categories'
    ) {
        Package.aggregate([
            {
                $group: {
                    _id: '$category',
                },
            }, {
                $sort: {_id: 1},
            },
        ], (err, data) => {
            if (err) {
                logger.error('Error fetching categories:', err);
                helpers.error(res, 'Could not fetch category list at this time');
            }
            else {
                /* eslint-disable no-underscore-dangle */
                let categories = data.filter((category) => !!category._id)
                    .map((category) => category._id);

                helpers.success(res, categories);
            }
        });
    }
    else {
        let lang = req.query.lang ? req.query.lang : null;
        if (lang) {
            if (langs.indexOf(lang) == -1 && lang.indexOf('_') > -1) {
                lang = lang.split('_')[0];
            }

            if (langs.indexOf(lang) > -1) {
                gt.setLocale(lang);
            }
            else {
                gt.setLocale('en_US');
            }
        }
        else {
            gt.setLocale('en_US');
        }

        let channel = req.query.channel ? req.query.channel.toLowerCase() : Package.VIVID;
        if (!Package.CHANNELS.includes(channel)) {
            channel = Package.XENIAL;
        }

        let categoryTranslations = {
            Accessibility: gt.gettext('Accessibility'),
            'Books & Comics': gt.gettext('Books & Comics'),
            'Business & Finance': gt.gettext('Business & Finance'),
            'Communication & Social': gt.gettext('Communication & Social'),
            'Developer Tools': gt.gettext('Developer Tools'),
            'Education & Reference': gt.gettext('Education & Reference'),
            Entertainment: gt.gettext('Entertainment'),
            'Food & Drink': gt.gettext('Food & Drink'),
            Games: gt.gettext('Games'),
            Graphics: gt.gettext('Graphics'),
            'Health & Fitness': gt.gettext('Health & Fitness'),
            Lifestyle: gt.gettext('Lifestyle'),
            'Media & Video': gt.gettext('Media & Video'),
            'Music & Audio': gt.gettext('Music & Audio'),
            'News & Magazines': gt.gettext('News & Magazines'),
            Personalisation: gt.gettext('Personalisation'),
            Productivity: gt.gettext('Productivity'),
            'Science & Engineering': gt.gettext('Science & Engineering'),
            Shopping: gt.gettext('Shopping'),
            Sports: gt.gettext('Sports'),
            'Travel & Weather': gt.gettext('Travel & Weather'),
            Utilities: gt.gettext('Utilities'),
        };

        Package.aggregate([
            {
                $match: {published: true, channels: channel},
            }, {
                $group: {
                    _id: '$category',
                    count: { $sum: 1 },
                },
            }, {
                $sort: {_id: 1},
            },
        ], (err, categories) => {
            if (err) {
                logger.error('Error fetching categories:', err);
                helpers.error(res, 'Could not fetch category list at this time');
            }
            else {
                /* eslint-disable arrow-body-style */
                let data = categories.filter((category) => !!category._id)
                    .map((category) => {
                        return {
                            category: category._id,
                            translation: categoryTranslations[category._id],
                            count: category.count,
                            icon: config.server.host + categoryIcons[category._id],
                        };
                    });

                helpers.success(res, data);
            }
        });
    }
});

module.exports = router;
