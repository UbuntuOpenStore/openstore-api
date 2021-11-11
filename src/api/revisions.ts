import express, { Request, Response } from 'express';

import Package from 'db/package/model';
import PackageRepo from 'db/package/repo';
import { downloadUrl } from 'db/package/serializer';
import { getDataArray, getData, success, error, captureException } from 'utils/helpers';
import logger from 'utils/logger';

// TODO remove this when system settings properly sends frameworks
import defaultFrameworks from './json/default_frameworks.json';

const router = express.Router();

async function revisionsByVersion(req: Request, res: Response) {
  const versions = getDataArray(req, 'apps');
  const ids = versions.map((version) => version.split('@')[0]);

  let defaultChannel = getData(req, 'channel').toLowerCase();
  const frameworks = getDataArray(req, 'frameworks', defaultFrameworks);
  let architecture = getData(req, 'architecture', Package.ARMHF).toLowerCase();

  if (!Package.CHANNELS.includes(defaultChannel)) {
    defaultChannel = Package.DEFAULT_CHANNEL;
  }

  if (!Package.ARCHITECTURES.includes(architecture)) {
    architecture = Package.ARMHF;
  }

  try {
    const pkgs = (await PackageRepo.find({ published: true, ids }))
      .filter((pkg) => (frameworks.length === 0 || frameworks.includes(pkg.framework)))
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

    success(res, pkgs);
  }
  catch (err) {
    logger.error('Error finding packages for revision:', err);
    captureException(err, req.originalUrl);
    error(res, 'Could not fetch app revisions at this time');
  }
}

router.get('/', revisionsByVersion);
router.post('/', revisionsByVersion);

export default router;
