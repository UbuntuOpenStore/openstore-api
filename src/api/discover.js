const shuffle = require('shuffle-array');
const express = require('express');

const Package = require('../db/package/model');
const PackageRepo = require('../db/package/repo');
const RatingCountRepo = require('../db/rating_count/repo');
const { serialize, serializeRatings } = require('../db/package/serializer');
const config = require('../utils/config');
const discoverJSON = require('./json/discover_apps.json');
const helpers = require('../utils/helpers');
const logger = require('../utils/logger');
const translations = require('../utils/translations');

// TODO remove this when system settings properly sends frameworks
const defaultFrameworks = require('./json/default_frameworks.json');

const router = express.Router();

discoverJSON.highlight.image = config.server.host + discoverJSON.highlight.image;
const discoverCache = {};
const discoverDate = {};

const NEW_AND_UPDATED = 'New and Updated Apps';
const POPULAR = 'Most Loved';

function checkFramework(discover, frameworks) {
  if (frameworks && frameworks.length > 0) {
    discover.categories.forEach((category) => {
      category.apps = category.apps.filter((app) => {
        return frameworks.includes(app.framework);
      });
      category.ids = category.apps.map((app) => app.id);
    });
  }

  return discover;
}

// TODO return slim version of the pkg json
router.get('/', async(req, res) => {
  const frameworks = helpers.getDataArray(req, 'frameworks', defaultFrameworks);

  let channel = helpers.getData(req, 'channel', Package.XENIAL).toLowerCase();
  if (!Package.CHANNELS.includes(channel)) {
    channel = Package.XENIAL;
  }

  let architecture = helpers.getData(req, 'architecture', Package.ARMHF).toLowerCase();
  if (!Package.ARCHITECTURES.includes(architecture)) {
    architecture = Package.ARMHF;
  }

  const cacheKey = `${channel}-${architecture}`;

  const now = new Date();
  if (
    !discoverDate[cacheKey] ||
    (now.getTime() - discoverDate[cacheKey].getTime()) > 600000 ||
    !discoverCache[cacheKey]
  ) { // Cache miss (10 minutes)
    const discover = JSON.parse(JSON.stringify(discoverJSON));

    try {
      const [highlight, discoverCategoriesApps, newApps, updatedApps, popularApps] = await Promise.all([
        PackageRepo.findOne(discover.highlight.id, { published: true }),

        Promise.all(discover.categories.map((category) => {
          if (category.ids.length === 0) {
            return [];
          }

          return PackageRepo.find({
            ids: category.ids,
            channel,
            architectures: [architecture, Package.ALL],
            published: true,
          });
        })),

        PackageRepo.find({
          published: true,
          channel,
          architectures: [architecture, Package.ALL],
          nsfw: [null, false],
          types: 'app',
        }, '-published_date', 8),

        PackageRepo.find({
          published: true,
          channel,
          architectures: [architecture, Package.ALL],
          nsfw: [null, false],
          types: 'app',
        }, '-updated_date', 8),

        PackageRepo.find({
          published: true,
          channel,
          architectures: [architecture, Package.ALL],
          nsfw: [null, false],
          types: 'app',
        }, '-calculated_rating', 8),
      ]);

      discover.highlight.app = highlight ? serialize(highlight, false, architecture, req.apiVersion) : null;

      discover.categories = discover.categories.map((category, index) => {
        const apps = discoverCategoriesApps[index].map((app) => serialize(app, false, architecture, req.apiVersion));

        return {
          ...category,
          ids: shuffle(category.ids),
          apps: shuffle(apps),
        };
      });

      const newAndUpdatedCategory = discover.categories.find((category) => (category.name == NEW_AND_UPDATED));
      const popularCategory = discover.categories.find((category) => (category.name == POPULAR));

      // Get the 10 latest updated or published apps
      let newAndUpdatedApps = newApps.concat(updatedApps);

      newAndUpdatedApps = newAndUpdatedApps.filter((app, pos) => {
        return newAndUpdatedApps.findIndex((a) => a.id == app.id) == pos;
      });

      newAndUpdatedApps.sort((a, b) => {
        if (a.updated_date > b.updated_date) {
          return -1;
        }

        if (a.updated_date < b.updated_date) {
          return 1;
        }

        return 0;
      });

      newAndUpdatedApps.forEach((app) => {
        console.log(app.id, app.updated_date);
      });

      newAndUpdatedCategory.apps = newAndUpdatedApps.slice(0, 10).map((app) => serialize(app, false, architecture, req.apiVersion));
      popularCategory.apps = popularApps.map((app) => serialize(app, false, architecture, req.apiVersion));

      discover.categories = discover.categories.filter((category) => (category.apps.length > 0));

      discover.categories = discover.categories.map((category) => {
        return {
          ...category,
          ids: category.apps.map((app) => app.id),
        };
      });

      discoverCache[cacheKey] = discover;
      discoverDate[cacheKey] = now;

      const lang = req.query.lang ? req.query.lang : null;
      translations.setLang(lang);

      let cloneDiscover = JSON.parse(JSON.stringify(discover));
      cloneDiscover = checkFramework(cloneDiscover, frameworks);
      cloneDiscover.categories = cloneDiscover.categories.map((category) => {
        return {
          ...category,
          name: translations.gettext(category.name),
          tagline: category.tagline ? translations.gettext(category.tagline) : '',
        };
      });

      helpers.success(res, cloneDiscover);
    }
    catch (err) {
      logger.error('Error processing discovery');
      helpers.captureException(err, req.originalUrl);
      helpers.error(res, 'Unable to fetch discovery data at this time');
    }
  }
  else { // Cache hit
    let discover = JSON.parse(JSON.stringify(discoverCache[cacheKey]));
    discover = checkFramework(discover, frameworks);

    const ids = discover.categories.reduce((accumulator, category) => {
      return [...accumulator, ...category.ids];
    }, []).concat([discover.highlight.id]);

    const ratingCounts = await RatingCountRepo.findByIds(ids);

    discover.highlight.app.ratings = serializeRatings(ratingCounts[discover.highlight.id]);
    discover.categories = discover.categories.map((category) => {
      return {
        ...category,
        apps: category.apps.map((app) => {
          return {
            ...app,
            ratings: serializeRatings(ratingCounts[app.id]),
          };
        }),
      };
    });

    helpers.success(res, discover);
  }
});

module.exports = router;
