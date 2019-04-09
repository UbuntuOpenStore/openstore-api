const shuffle = require('shuffle-array');
const moment = require('moment');
const express = require('express');

const Package = require('../db/package/model');
const PackageRepo = require('../db/package/repo');
const {serialize} = require('../db/package/serializer');
const config = require('../utils/config');
const discoverJSON = require('./json/discover_apps.json');
const helpers = require('../utils/helpers');

const router = express.Router();

discoverJSON.highlight.image = config.server.host + discoverJSON.highlight.image;
let discoverCache = {};
let discoverDate = {};

const NEW_AND_UPDATED = 'New and Updated Apps';

// TODO return slim version of the pkg json
router.get('/', async (req, res) => {
    let channel = req.query.channel ? req.query.channel.toLowerCase() : Package.XENIAL;
    if (!Package.CHANNELS.includes(channel)) {
        channel = Package.XENIAL;
    }

    let now = moment();
    if (!discoverDate[channel] || now.diff(discoverDate[channel], 'minutes') > 10 || !discoverCache[channel]) { // Cache miss
        let discover = JSON.parse(JSON.stringify(discoverJSON));
        let discoverCategories = discover.categories.filter((category) => (category.ids.length > 0));

        try {
            let [highlight, discoverCategoriesApps, newApps, updatedApps] = await Promise.all([
                PackageRepo.findOne(discover.highlight.id, {published: true}),

                Promise.all(discoverCategories.map((category) => PackageRepo.find({ids: category.ids, channel: channel, published: true}))),

                PackageRepo.find({
                    published: true,
                    channel: channel,
                    nsfw: [null, false],
                }, '-published_date', 8),

                PackageRepo.find({
                    published: true,
                    channel: channel,
                    nsfw: [null, false],
                }, '-updated_date', 8),
            ]);

            discover.highlight.app = serialize(highlight);

            discoverCategories.forEach((category, index) => {
                let apps = discoverCategoriesApps[index].map((app) => serialize(app));

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
            newAndUpdatedCategory.apps = newAndUpdatedCategory.apps.map((app) => serialize(app));

            discover.categories = discover.categories.filter((category) => (category.apps.length > 0));

            /* eslint-disable  arrow-body-style */
            discover.categories.forEach((category) => {
                category.ids = category.apps.map((app) => app.id);
            });

            discoverCache[channel] = discover;
            discoverDate[channel] = now;

            helpers.success(res, discover);
        }
        catch (err) {
            console.log(err);
            helpers.error(res, 'Unable to fetch discovery data at this time');
        }
    }
    else { // Cache hit
        helpers.success(res, discoverCache[channel]);
    }
});

module.exports = router;
