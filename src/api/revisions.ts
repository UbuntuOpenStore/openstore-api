import express, { type Request, type Response } from 'express';

import { Package } from 'db/package';
import { Architecture, Channel } from 'db/package/types';
import { getDataArray, getData, success, asyncErrorWrapper } from 'utils';
import { INVALID_ARCH, INVALID_CHANNEL } from 'utils/error-messages';
import { UserError } from 'exceptions';

const router = express.Router();

async function revisionsByVersion(req: Request, res: Response) {
  const versions = getDataArray(req, 'apps');
  const ids = versions.map((version: string) => version.split('@')[0]);

  const defaultChannel = getData(req, 'channel').toLowerCase() as Channel;
  const frameworks = getDataArray(req, 'frameworks', []);
  const architecture = getData(req, 'architecture').toLowerCase() as Architecture;

  if (!Object.values(Channel).includes(defaultChannel) || !defaultChannel) {
    throw new UserError(INVALID_CHANNEL);
  }

  if (!Object.values(Architecture).includes(architecture) || !architecture) {
    throw new UserError(INVALID_ARCH);
  }

  if (ids.length === 0) {
    success(res, []);
    return;
  }

  const pkgs = (await Package.findByFilters({ published: true, ids }))
    .filter((pkg) => (pkg.architectures.includes(architecture) || pkg.architectures.includes(Architecture.ALL)))
    .map((pkg) => {
      let version = versions.filter((v: string) => (v.split('@')[0] === pkg.id))[0];
      const parts = version.split('@');
      const channel = (parts.length > 2) ? parts[2] as Channel : defaultChannel;
      version = parts[1];

      const revisionData = pkg.revisions.filter((rev) => (
        rev.version === version &&
                  rev.channel === channel &&
                  (rev.architecture === architecture || rev.architecture === Architecture.ALL)
      ))[0];
      const revision = revisionData ? revisionData.revision : 0;

      const { revisionData: latestRevisionData } = pkg.getLatestRevision(channel, architecture, undefined, frameworks);
      if (!latestRevisionData || !latestRevisionData.download_url) {
        return null;
      }

      return {
        id: pkg.id,
        version,
        revision,
        latest_version: latestRevisionData.version,
        latest_revision: latestRevisionData.revision,
        download_url: pkg.getDownloadUrl(channel, architecture, latestRevisionData.version),
      };
    })
    .filter(Boolean);

  success(res, pkgs);
}

router.get('/', asyncErrorWrapper(revisionsByVersion, 'Could not fetch app revisions at this time'));
router.post('/', asyncErrorWrapper(revisionsByVersion, 'Could not fetch app revisions at this time'));

export default router;
