const Package = require('../db').Package;
const helpers = require('../utils/helpers');
const logger = require('../utils/logger');

const express = require('express');

const router = express.Router();
const APP_NOT_FOUND = 'App not found';

router.get('/:id', (req, res) => {
    let query = {
        published: true,
        id: req.params.id,
    };

    Package.findOne(query).then((pkg) => {
        if (!pkg) {
            helpers.error(res, APP_NOT_FOUND, 404);
        }
        else {
            let version = req.query.version ? req.query.version : pkg.version;
            let revision = pkg.revisions.filter((rev) => {
                return (rev.version == version);
            })[0];
            revision = revision ? revision.revision : 0;

            helpers.success(res, {
                id: pkg.id,
                version: version,
                revision: revision,
                latest_version: pkg.version,
                latest_revision: pkg.revision,
            });
        }
    }).catch((err) => {
        logger.error('Error finding package for revision:', err);
        helpers.error(res, 'Could not fetch app revision at this time');
    });
});

// TODO support channels
function revisionsByVersion(req, res) {
    let versions = [];
    if (req.query.apps) {
        versions = req.query.apps.split(',');
    }
    else if (req.body && req.body.apps) {
        versions = req.body.apps;
    }

    let ids = versions.map((version) => {
        return version.split('@')[0];
    });
    Package.find({published: true, id: {$in: ids}}).then((pkgs) => {
        helpers.success(res, pkgs.map((pkg) => {
            let version = versions.filter((v) => {
                return (v.split('@')[0] == pkg.id);
            })[0];
            version = version.split('@')[1];

            let revision = pkg.revisions.filter((rev) => {
                return (rev.version == version);
            })[0];
            revision = revision ? revision.revision : 0;

            return {
                id: pkg.id,
                version: version,
                revision: revision,
                latest_version: pkg.version,
                latest_revision: pkg.revision,
            };
        }));
    }).catch((err) => {
        logger.error('Error finding packages for revision:', err);
        helpers.error(res, 'Could not fetch app revisions at this time');
    });
}

router.get('/', revisionsByVersion);
router.post('/', revisionsByVersion);

module.exports = router;
