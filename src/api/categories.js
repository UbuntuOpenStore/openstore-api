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

router.get('/', async(req, res) => {
  const lang = req.query.lang ? req.query.lang : null;
  translations.setLang(lang);

  let channel = req.query.channel ? req.query.channel.toLowerCase() : Package.DEFAULT_CHANNEL;
  if (!Package.CHANNELS.includes(channel)) {
    channel = Package.DEFAULT_CHANNEL;
  }

  try {
    let categories = categoryNames.map((category) => {
      return {
        name: category,
      };
    });

    if (!req.query.all) {
      categories = (await PackageRepo.categoryStats([channel])).map((stats) => {
        return {
          ...stats,
          name: stats._id,
        };
      });
    }

    categories = categories.filter((category) => !!category.name)
      .map((category) => {
        return {
          category: category.name,
          translation: translations.gettext(category.name),
          count: category.count,
          icon: config.server.host + categoryIcons[category.name],
        };
      });

    helpers.success(res, categories);
  }
  catch (err) {
    logger.error('Error fetching categories');
    helpers.captureException(err, req.originalUrl);
    helpers.error(res, 'Could not fetch category list at this time');
  }
});

module.exports = router;
