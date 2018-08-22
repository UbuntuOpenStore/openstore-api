const RSS = require('rss');
const express = require('express');

const Package = require('../db').Package;
const logger = require('../utils/logger');
const config = require('../utils/config');
const packages = require('../utils/packages');
const helpers = require('../utils/helpers');

const router = express.Router();

router.get('/new.xml', async (req, res) => {
    let feed = new RSS({
        title: 'New Apps in the OpenStore',
        description: 'The hottest new apps for Ubuntu Touch',
        feed_url: `${config.server.host}/rss/new.xml`,
        site_url: config.server.host,
        image_url: `${config.server.host}/static/logo.png`,
        ttl: 240, // 4 hours
    });

    try {
        let pkgs = await Package.find({
            published: true,
        }).sort('-published_date').limit(10).exec();

        pkgs.forEach((pkg) => {
            let description = pkg.description ? `<br/>${pkg.description}` : '';
            let url = `${config.server.host}/app/${pkg.id}`;

            feed.item({
                title: pkg.name,
                url: url,
                description: `<a href="${url}"><img src="${packages.iconUrl(pkg)}" /></a>${description}`,
                author: pkg.author,
                date: pkg.updated_date,
                custom_elements: [{tagline: pkg.tagline ? pkg.tagline : ''}],
            });
        });
    }
    catch (err) {
        logger.error('RSS feed error', err);
        helpers.error(res, 'There was an error generating the RSS feed');
        return;
    }

    res.header('Content-Type', 'text/xml');
    res.send(feed.xml({indent: true}));
});

router.get('/updates.xml', async (req, res) => {
    let feed = new RSS({
        title: 'Updated Apps in the OpenStore',
        description: 'Cool updates for Ubuntu Touch apps',
        feed_url: `${config.server.host}/rss/updates.xml`,
        site_url: config.server.host,
        image_url: `${config.server.host}/static/logo.png`,
        ttl: 240, // 4 hours
    });

    try {
        let pkgs = await Package.find({
            published: true,
        }).sort('-updated_date').limit(10).exec();

        pkgs.forEach((pkg) => {
            let changelog = pkg.changelog ? `<br/><br/>Changelog:<br/>${pkg.changelog}` : '';
            changelog = changelog.replace('\n', '<br/>');
            let description = pkg.description ? `<br/><br/>Description:<br/>${pkg.description}` : '';
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
        helpers.error(res, 'There was an error generating the RSS feed');
        return;
    }

    res.header('Content-Type', 'text/xml');
    res.send(feed.xml({indent: true}));
});

module.exports = router;
