const express = require('express');

const Package = require('../db/package/model');
const PackageRepo = require('../db/package/repo');
const helpers = require('../utils/helpers');
const logger = require('../utils/logger');

const router = express.Router();

async function revisionsByVersion(req, res) {
    let versions = helpers.getDataArray(req, 'apps');
    let ids = versions.map((version) => version.split('@')[0]);

    let defaultChannel = helpers.getData(req, 'channel');
    let frameworks = helpers.getDataArray(req, 'frameworks');
    let architecture = helpers.getData(req, 'architecture');

    if (!Package.CHANNELS.includes(defaultChannel)) {
        defaultChannel = Package.XENIAL;
    }

    try {
        let pkgs = await PackageRepo.find({published: true, ids: ids});
        pkgs = pkgs.filter((pkg) => (frameworks.length === 0 || frameworks.includes(pkg.framework)))
            .filter((pkg) => (!architecture || pkg.architectures.includes(architecture) || pkg.architectures.includes('all')))
            .map((pkg) => {
                let version = versions.filter((v) => (v.split('@')[0] == pkg.id))[0];

                let parts = version.split('@');
                let channel = (parts.length > 2) ? parts[2] : defaultChannel;
                version = parts[1];

                let revisionData = pkg.revisions.filter((rev) => (rev.version == version && rev.channel == channel))[0];
                let revision = revisionData ? revisionData.revision : 0;

                let {revisionData: latestRevisionData} = pkg.getLatestRevision(channel);

                return {
                    id: pkg.id,
                    version: version,
                    revision: revision,
                    latest_version: pkg.version,
                    latest_revision: latestRevisionData.revision,
                };
            });

        helpers.success(res, pkgs);
    }
    catch (err) {
        logger.error('Error finding packages for revision:', err);
        console.error(err);
        helpers.error(res, 'Could not fetch app revisions at this time');
    }
}

router.get('/', revisionsByVersion);
router.post('/', revisionsByVersion);

module.exports = router;
