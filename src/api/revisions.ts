import express, { Request, Response } from 'express';

import { Package } from 'db/package';
import { Architecture, Channel, DEFAULT_CHANNEL } from 'db/package/types';
import { getDataArray, getData, success, asyncErrorWrapper } from 'utils';

// TODO remove this when system settings properly sends frameworks
import defaultFrameworks from './json/default_frameworks.json';

const router = express.Router();

// TODO cleanup

async function revisionsByVersion(req: Request, res: Response) {
  const versions = getDataArray(req, 'apps');
  const ids = versions.map((version: string) => version.split('@')[0]);

  let defaultChannel = getData(req, 'channel').toLowerCase();
  const frameworks = getDataArray(req, 'frameworks', defaultFrameworks);
  let architecture = getData(req, 'architecture', Architecture.ARMHF).toLowerCase();

  if (!Object.values(Channel).includes(defaultChannel)) {
    defaultChannel = DEFAULT_CHANNEL;
  }

  if (!Object.values(Architecture).includes(architecture)) {
    architecture = Architecture.ARMHF;
  }

  const pkgs = (await Package.findByFilters({ published: true, ids }))
    .filter((pkg) => (frameworks.length === 0 || frameworks.includes(pkg.framework)))
    .filter((pkg) => (pkg.architectures.includes(architecture) || pkg.architectures.includes(Architecture.ALL)))
    .map((pkg) => {
      let version = versions.filter((v: string) => (v.split('@')[0] == pkg.id))[0];
      const parts = version.split('@');
      const channel = (parts.length > 2) ? parts[2] : defaultChannel;
      version = parts[1];

      const revisionData = pkg.revisions.filter((rev) => (
        rev.version == version &&
                  rev.channel == channel &&
                  (rev.architecture == architecture || rev.architecture == Architecture.ALL)
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
        download_url: pkg.getDownloadUrl(channel, architecture),
      };
    })
    .filter(Boolean);

  success(res, pkgs);
}

router.get('/', asyncErrorWrapper(revisionsByVersion, 'Could not fetch app revisions at this time'));
router.post('/', asyncErrorWrapper(revisionsByVersion, 'Could not fetch app revisions at this time'));

export default router;
