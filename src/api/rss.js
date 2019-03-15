const RSS = require('rss');
const express = require('express');

const Package = require('../db/package/model');
const PackageRepo = require('../db/package/repo');
const logger = require('../utils/logger');
const config = require('../utils/config');
const packages = require('../utils/packages');
const helpers = require('../utils/helpers');

const router = express.Router();

async function generateFeed(res, updates) {
    let feed = new RSS({
        title: updates ? 'Updated Apps in the OpenStore' : 'New Apps in the OpenStore',
        description: updates ? 'Cool updates for Ubuntu Touch apps' : 'The hottest new apps for Ubuntu Touch',
        feed_url: `${config.server.host}/rss/${updates ? 'updates' : 'new'}.xml`,
        site_url: config.server.host,
        image_url: `${config.server.host}/logo.png`,
        ttl: 240, // 4 hours
    });

    try {
        let sort = updates ? '-updated_date' : '-published_date';
        let pkgs = await PackageRepo.find({published: true}, sort, 10);

        pkgs.forEach((pkg) => {
            let changelog = '';
            let description = pkg.description ? `<br/>${pkg.description}` : '';
            if (updates) {
                changelog = pkg.changelog ? `<br/><br/>Changelog:<br/>${pkg.changelog}` : '';
                changelog = changelog.replace('\n', '<br/>');
                description = pkg.description ? `<br/><br/>Description:<br/>${pkg.description}` : '';
            }

            let url = `${config.server.host}/app/${pkg.id}`;

            feed.item({
                title: pkg.name,
                url: url,
                description: `<a href="${url}"><img src="${packages.iconUrl(pkg)}" /></a>${changelog}${description}`,
                author: pkg.author,
                date: pkg.updated_date,
                custom_elements: [{tagline: pkg.tagline ? pkg.tagline : ''}],
            });
        });
    }
    catch (err) {
        logger.error('RSS feed error', err);
        return helpers.error(res, 'There was an error generating the RSS feed');
    }

    res.header('Content-Type', 'text/xml');
    res.send(feed.xml({indent: true}));
}

router.get('/new.xml', (req, res) => {
    generateFeed(res, false);
});

router.get('/updates.xml', async (req, res) => {
    generateFeed(res, true);
});

module.exports = router;
