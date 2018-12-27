const express = require('express');

const Package = require('../db').Package;
const helpers = require('../utils/helpers');
const logger = require('../utils/logger');

const router = express.Router();

function revisionsByVersion(req, res) {
    let versions = [];
    if (req.query.apps) {
        versions = req.query.apps.split(',');
    }
    else if (req.body && req.body.apps) {
        versions = req.body.apps;
    }

    let defaultChannel = Package.VIVID;
    if (req.query.channel) {
        defaultChannel = req.query.channel.toLowerCase();
    }
    else if (req.body && req.body.channel) {
        defaultChannel = req.body.channel.toLowerCase();
    }

    if (!Package.CHANNELS.includes(defaultChannel)) {
        defaultChannel = Package.XENIAL;
    }

    let frameworks = [];
    if (req.query.frameworks) {
        frameworks = req.query.frameworks.split(',');
    }
    else if (req.body && req.body.frameworks) {
        frameworks = req.body.frameworks;
    }

    let architecture = null;
    if (req.query.architecture) {
        architecture = req.query.architecture.trim().toLowerCase();
    }
    else if (req.body && req.body.architecture) {
        architecture = req.body.architecture.trim().toLowerCase();
    }

    let ids = versions.map((version) => version.split('@')[0]);
    Package.find({published: true, id: {$in: ids}}).then((pkgs) => {
        pkgs = pkgs.filter((pkg) => (frameworks.length === 0 || frameworks.includes(pkg.framework)))
            .filter((pkg) => (!architecture || pkg.architectures.includes(architecture)))
            .map((pkg) => {
                let version = versions.filter((v) => (v.split('@')[0] == pkg.id))[0];

                let parts = version.split('@');
                let channel = (parts.length > 2) ? parts[2] : defaultChannel;
                version = parts[1];

                let revisionData = pkg.revisions.filter((rev) => (rev.version == version && rev.channel == channel))[0];
                let revision = revisionData ? revisionData.revision : 0;

                return {
                    id: pkg.id,
                    version: version,
                    revision: revision,
                    latest_version: pkg.version,
                    latest_revision: (channel == Package.XENIAL) ? pkg.xenial_revision : pkg.vivid_revision,
                };
            });

        helpers.success(res, pkgs);
    }).catch((err) => {
        logger.error('Error finding packages for revision:', err);
        helpers.error(res, 'Could not fetch app revisions at this time');
    });
}

router.get('/', revisionsByVersion);
router.post('/', revisionsByVersion);

module.exports = router;
