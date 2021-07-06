const express = require('express');

const Package = require('../db/package/model');
const PackageRepo = require('../db/package/repo');
const { downloadUrl } = require('../db/package/serializer');
const helpers = require('../utils/helpers');
const logger = require('../utils/logger');

// TODO remove this when system settings properly sends frameworks
const defaultFrameworks = require('./json/default_frameworks.json');

const router = express.Router();

async function revisionsByVersion(req, res) {
  const versions = helpers.getDataArray(req, 'apps');
  const ids = versions.map((version) => version.split('@')[0]);

  let defaultChannel = helpers.getData(req, 'channel').toLowerCase();
  const frameworks = helpers.getDataArray(req, 'frameworks', defaultFrameworks);
  let architecture = helpers.getData(req, 'architecture', Package.ARMHF).toLowerCase();

  if (!Package.CHANNELS.includes(defaultChannel)) {
    defaultChannel = Package.DEFAULT_CHANNEL;
  }

  if (!Package.ARCHITECTURES.includes(architecture)) {
    architecture = Package.ARMHF;
  }

  try {
    let pkgs = await PackageRepo.find({ published: true, ids });
    pkgs = pkgs.filter((pkg) => (frameworks.length === 0 || frameworks.includes(pkg.framework)))
      .filter((pkg) => (pkg.architectures.includes(architecture) || pkg.architectures.includes(Package.ALL)))
      .map((pkg) => {
        let version = versions.filter((v) => (v.split('@')[0] == pkg.id))[0];
        const parts = version.split('@');
        const channel = (parts.length > 2) ? parts[2] : defaultChannel;
        version = parts[1];

        const revisionData = pkg.revisions.filter((rev) => (
          rev.version == version &&
                    rev.channel == channel &&
                    (rev.architecture == architecture || rev.architecture == Package.ALL)
        ))[0];
        const revision = revisionData ? revisionData.revision : 0;

        // TODO return the latest revision for the given frameworks
        // (also account for this most places pkg.getLatestRevision is used)
        const { revisionData: latestRevisionData } = pkg.getLatestRevision(channel, architecture);

        if (!latestRevisionData || !latestRevisionData.download_url) {
          return null;
        }

        return {
          id: pkg.id,
          version,
          revision,
          latest_version: latestRevisionData.version,
          latest_revision: latestRevisionData.revision,
          download_url: downloadUrl(pkg, channel, architecture),
        };
      })
      .filter(Boolean);

    helpers.success(res, pkgs);
  }
  catch (err) {
    logger.error('Error finding packages for revision:', err);
    helpers.captureException(err, req.originalUrl);
    helpers.error(res, 'Could not fetch app revisions at this time');
  }
}

router.get('/', revisionsByVersion);
router.post('/', revisionsByVersion);

module.exports = router;
