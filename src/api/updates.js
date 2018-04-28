const Package = require('../db').Package;
const helpers = require('../utils/helpers');

const express = require('express');

const router = express.Router();

// TODO support channels
function updates(req, res) {
    let byRevision = true;
    if (req.originalUrl.substring(0, 20) == '/api/v1/apps/updates') {
        byRevision = false;
    }

    let ids = [];
    if (req.query.apps) {
        ids = req.query.apps.split(',');
    }
    else if (req.body && req.body.apps) {
        ids = req.body.apps;
    }

    if (ids.length > 0) {
        Package.find({id: {$in: ids}, published: true}).then((pkgs) => {
            helpers.success(res, pkgs.reduce((value, pkg) => {
                if (byRevision) {
                    value[pkg.id] = pkg.revision;
                }
                else {
                    value[pkg.id] = pkg.version;
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

router.get('/', updates);
router.post('/', updates);

module.exports = router;
