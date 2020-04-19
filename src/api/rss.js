const RSS = require('rss');
const express = require('express');

const PackageRepo = require('../db/package/repo');
const { iconUrl } = require('../db/package/serializer');
const logger = require('../utils/logger');
const config = require('../utils/config');
const helpers = require('../utils/helpers');

const router = express.Router();

async function generateFeed(req, res, updates) {
  const feed = new RSS({
    title: updates ? 'Updated Apps in the OpenStore' : 'New Apps in the OpenStore',
    description: updates ? 'Cool updates for Ubuntu Touch apps' : 'The hottest new apps for Ubuntu Touch',
    feed_url: `${config.server.host}/rss/${updates ? 'updates' : 'new'}.xml`,
    site_url: config.server.host,
    image_url: `${config.server.host}/logo.png`,
    ttl: 240, // 4 hours
  });

  try {
    const sort = updates ? '-updated_date' : '-published_date';
    const pkgs = await PackageRepo.find({ published: true }, sort, 10);

    pkgs.forEach((pkg) => {
      let changelog = '';
      let description = pkg.description ? `<br/>${pkg.description}` : '';
      if (updates) {
        changelog = pkg.changelog ? `<br/><br/>Changelog:<br/>${pkg.changelog}` : '';
        changelog = changelog.replace('\n', '<br/>');
        description = pkg.description ? `<br/><br/>Description:<br/>${pkg.description}` : '';
      }

      const url = `${config.server.host}/app/${pkg.id}`;

      feed.item({
        title: pkg.name,
        url,
        description: `<a href="${url}"><img src="${iconUrl(pkg)}" /></a>${changelog}${description}`,
        author: pkg.author,
        date: pkg.updated_date,
        custom_elements: [{ tagline: pkg.tagline ? pkg.tagline : '' }],
      });
    });
  }
  catch (err) {
    logger.error('RSS feed error', err);
    helpers.captureException(err, req.originalUrl);
    return helpers.error(res, 'There was an error generating the RSS feed');
  }

  res.header('Content-Type', 'text/xml');
  return res.send(feed.xml({ indent: true }));
}

router.get('/new.xml', (req, res) => {
  generateFeed(req, res, false);
});

router.get('/updates.xml', async(req, res) => {
  generateFeed(req, res, true);
});

router.get('/', (req, res) => {
  res.redirect(301, '/feeds');
});

module.exports = router;
