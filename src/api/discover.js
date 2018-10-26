const shuffle = require('shuffle-array');
const moment = require('moment');
const express = require('express');

const Package = require('../db').Package;
const config = require('../utils/config');
const discoverJSON = require('./json/discover_apps.json');
const helpers = require('../utils/helpers');
const packages = require('../utils/packages');
const logger = require('../utils/logger');

const router = express.Router();

discoverJSON.highlight.image = config.server.host + discoverJSON.highlight.image;
let discoverCache = {};
let discoverDate = {};

// TODO return slim version of the pkg json
router.get('/', (req, res) => {
    let channel = req.query.channel ? req.query.channel.toLowerCase() : Package.VIVID;
    if (!Package.CHANNELS.includes(channel)) {
        channel = Package.XENIAL;
    }

    let now = moment();
    if (!discoverDate[channel] || now.diff(discoverDate[channel], 'minutes') > 10 || !discoverCache[channel]) { // Cache miss
        let discover = JSON.parse(JSON.stringify(discoverJSON));
        let staticCategories = discover.categories.filter((category) => (category.ids.length > 0));

        Promise.all([
            Package.findOne({id: discover.highlight.id}),

            Promise.all(staticCategories.map((category) => Package.find({id: {$in: category.ids}, channels: channel}))),

            Package.find({
                published: true,
                channels: channel,
                nsfw: {$in: [null, false]},
            }).limit(8).sort('-published_date'),

            Package.find({
                published: true,
                channels: channel,
                nsfw: {$in: [null, false]},
            }).limit(8).sort('-updated_date'),
        ]).then(([highlight, staticCategoriesApps, newApps, updatedApps]) => {
            discover.highlight.app = packages.toJson(highlight, req);

            staticCategories.forEach((category, index) => {
                let apps = staticCategoriesApps[index].map((app) => packages.toJson(app, req));

                category.ids = shuffle(category.ids);
                category.apps = shuffle(apps);
            });

            let newAndUpdatedCategory = discover.categories.filter((category) => (category.name == 'New and Updated Apps'))[0];

            // Get the first 10 unique app ids (unique ids)
            let ids = newApps.map((app) => app.id)
                .concat(updatedApps.map((app) => app.id))
                .filter((item, pos) => ids.indexOf(item) == pos);

            newAndUpdatedCategory.ids = ids.slice(0, 10);

            let newAndUpdatedApps = newApps.concat(updatedApps);
            /* eslint-disable  arrow-body-style */
            newAndUpdatedCategory.apps = newAndUpdatedCategory.ids.map((id) => {
                return newAndUpdatedApps.filter((app) => {
                    return (app.id == id);
                })[0];
            });
            newAndUpdatedCategory.apps = newAndUpdatedCategory.apps.map((app) => packages.toJson(app, req));

            discover.categories = discover.categories.filter((category) => (category.apps.length > 0));

            /* eslint-disable  arrow-body-style */
            discover.categories.forEach((category) => {
                category.ids = category.apps.map((app) => {
                    return app.id;
                });
            });

            discoverCache[channel] = discover;
            discoverDate[channel] = now;

            helpers.success(res, discover);
        }).catch((err) => {
            logger.error(err);
            helpers.error(res, 'Unable to fetch discovery data at this time');
        });
    }
    else { // Cache hit
        helpers.success(res, discoverCache[channel]);
    }
});

module.exports = router;
