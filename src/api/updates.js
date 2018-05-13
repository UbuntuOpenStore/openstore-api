const Package = require('../db').Package;
const helpers = require('../utils/helpers');

const express = require('express');

const router = express.Router();

function updates(req, res) {
    let ids = [];
    if (req.query.apps) {
        ids = req.query.apps.split(',');
    }
    else if (req.body && req.body.apps) {
        ids = req.body.apps;
    }

    let channel = Package.VIVID;
    if (req.query.channel) {
        channel = req.query.channel.toLowerCase();
    }
    else if (req.body && req.body.channel) {
        channel = req.body.channel.toLowerCase();
    }

    if (!Package.CHANNELS.includes(channel)) {
        channel = Package.VIVID;
    }

    if (ids.length > 0) {
        Package.find({id: {$in: ids}, published: true}).then((pkgs) => {
            helpers.success(res, pkgs.reduce((value, pkg) => {
                if (req.apiVersion == 1) {
                    value[pkg.id] = pkg.version;
                }
                else {
                    value[pkg.id] = (channel == Package.VIVID) ? pkg.revision : pkg.xenial_revision;
                }

                return value;
            }, {}));
        }).catch(() => {
            helpers.error(res, 'Could not fetch updates at this time');
        });
    }
    else {
        helpers.error(res, 'No apps were specified', 400);
    }
}

// TODO remove this, it's not being used by the app
router.get('/', updates);
router.post('/', updates);

module.exports = router;
