const shuffle = require('shuffle-array');
const moment = require('moment');
const express = require('express');

const Package = require('../db/package/model');
const PackageRepo = require('../db/package/repo');
const {serialize} = require('../db/package/serializer');
const config = require('../utils/config');
const discoverJSON = require('./json/discover_apps.json');
const helpers = require('../utils/helpers');
const logger = require('../utils/logger');

const router = express.Router();

discoverJSON.highlight.image = config.server.host + discoverJSON.highlight.image;
let discoverCache = {};
let discoverDate = {};

const NEW_AND_UPDATED = 'New and Updated Apps';

// TODO return slim version of the pkg json
router.get('/', async (req, res) => {
    let channel = helpers.getData(req, 'channel', Package.XENIAL).toLowerCase();
    if (!Package.CHANNELS.includes(channel)) {
        channel = Package.XENIAL;
    }

    let architecture = helpers.getData(req, 'architecture', Package.ARMHF).toLowerCase();
    if (!Package.ARCHITECTURES.includes(architecture)) {
        architecture = Package.ARMHF;
    }

    const cacheKey = `${channel}-${architecture}`;

    let now = moment();
    if (!discoverDate[cacheKey] || now.diff(discoverDate[cacheKey], 'minutes') > 10 || !discoverCache[cacheKey]) { // Cache miss
        let discover = JSON.parse(JSON.stringify(discoverJSON));
        let discoverCategories = discover.categories.filter((category) => (category.ids.length > 0));

        try {
            let [highlight, discoverCategoriesApps, newApps, updatedApps] = await Promise.all([
                PackageRepo.findOne(discover.highlight.id, {published: true}),

                Promise.all(discoverCategories.map((category) => PackageRepo.find({
                    ids: category.ids,
                    channel: channel,
                    architectures: [architecture, Package.ALL],
                    published: true,
                }))),

                PackageRepo.find({
                    published: true,
                    channel: channel,
                    architectures: [architecture, Package.ALL],
                    nsfw: [null, false],
                }, '-published_date', 8),

                PackageRepo.find({
                    published: true,
                    channel: channel,
                    architectures: [architecture, Package.ALL],
                    nsfw: [null, false],
                }, '-updated_date', 8),
            ]);

            discover.highlight.app = highlight ? serialize(highlight, false, architecture, req.apiVersion) : null;

            discoverCategories.forEach((category, index) => {
                let apps = discoverCategoriesApps[index].map((app) => serialize(app, false, architecture, req.apiVersion));

                category.ids = shuffle(category.ids);
                category.apps = shuffle(apps);
            });

            let newAndUpdatedCategory = discover.categories.find((category) => (category.name == NEW_AND_UPDATED));

            // Get the first 10 unique app ids (unique ids)
            let ids = newApps.map((app) => app.id)
                .concat(updatedApps.map((app) => app.id));

            newAndUpdatedCategory.ids = ids.filter((item, pos) => ids.indexOf(item) == pos)
                .slice(0, 10);

            let newAndUpdatedApps = newApps.concat(updatedApps);
            /* eslint-disable  arrow-body-style */
            newAndUpdatedCategory.apps = newAndUpdatedCategory.ids.map((id) => {
                return newAndUpdatedApps.find((app) => (app.id == id));
            });
            newAndUpdatedCategory.apps = newAndUpdatedCategory.apps.map((app) => serialize(app, false, architecture, req.apiVersion));

            discover.categories = discover.categories.filter((category) => (category.apps.length > 0));

            /* eslint-disable  arrow-body-style */
            discover.categories.forEach((category) => {
                category.ids = category.apps.map((app) => app.id);
            });

            discoverCache[cacheKey] = discover;
            discoverDate[cacheKey] = now;

            helpers.success(res, discover);
        }
        catch (err) {
            logger.error('Error processing discovery');
            helpers.captureException(err, req.originalUrl);
            helpers.error(res, 'Unable to fetch discovery data at this time');
        }
    }
    else { // Cache hit
        helpers.success(res, discoverCache[cacheKey]);
    }
});

module.exports = router;
