import multer from 'multer';
import path from 'path';
import { v4 } from 'uuid';
import express, { Request, Response } from 'express';

import fs from 'fs/promises';
import { Lock, LockDoc } from 'db/lock';
import { PackageDoc, Architecture, Channel, DEFAULT_CHANNEL } from 'db/package/types';
import { Package } from 'db/package';
import PackageSearch from 'db/package/search';
import { success, error, captureException, sanitize, moveFile, apiLinks, sha512Checksum, logger, config, asyncErrorWrapper } from 'utils';
import * as clickParser from 'utils/click-parser-async';
import * as reviewPackage from 'utils/review-package';
import { authenticate, userRole, downloadFile, extendTimeout, fetchPackage, canManage, canManageLocked } from 'middleware';
import {
  APP_NOT_FOUND,
  NEEDS_MANUAL_REVIEW,
  MALFORMED_MANIFEST,
  DUPLICATE_PACKAGE,
  PERMISSION_DENIED,
  BAD_FILE,
  WRONG_PACKAGE,
  BAD_NAMESPACE,
  EXISTING_VERSION,
  NO_FILE,
  INVALID_CHANNEL,
  NO_REVISIONS,
  NO_APP_NAME,
  NO_SPACES_NAME,
  NO_APP_TITLE,
  APP_HAS_REVISIONS,
  NO_ALL,
  NO_NON_ALL,
  MISMATCHED_FRAMEWORK,
  APP_LOCKED,
} from '../utils/error-messages';

const mupload = multer({ dest: '/tmp' });
const router = express.Router();

export type File = {
  originalname: string;
  path: string;
  size: number;
}

// TODO move???
function fileName(file: File) {
  // Rename the file so click-review doesn't freak out
  return `${file.path}.click`;
}

// TODO move
async function review(req: Request, file: File, filePath: string) {
  if (!file.originalname.endsWith('.click')) {
    await fs.unlink(file.path);
    return [false, BAD_FILE];
  }

  await moveFile(file.path, filePath);

  if (!req.isAdminUser && !req.isTrustedUser) {
    // Admin & trusted users can upload apps without manual review
    const needsManualReview = await reviewPackage.reviewPackage(filePath);
    if (needsManualReview) {
      // TODO improve this feedback
      let reviewError = NEEDS_MANUAL_REVIEW;
      if (needsManualReview === true) {
        reviewError = `${NEEDS_MANUAL_REVIEW}, please check your app using the click-review command`;
      }
      else {
        reviewError = `${NEEDS_MANUAL_REVIEW} (Error: ${needsManualReview})`;
      }

      await fs.unlink(filePath);
      return [false, reviewError];
    }
  }

  return [true, null];
}

router.get('/', authenticate, userRole, asyncErrorWrapper(async(req: Request, res: Response) => {
  const filters = Package.parseRequestFilters(req);
  if (!req.isAdminUser) {
    filters.maintainer = req.user!._id;
  }

  const pkgs = await Package.findByFilters(filters, filters.sort, filters.limit, filters.skip);
  const count = await Package.countByFilters(filters);

  const formatted = pkgs.map((pkg) => pkg.serialize());
  const { next, previous } = apiLinks(req.originalUrl, formatted.length, filters.limit, filters.skip);
  return success(res, { count, next, previous, packages: formatted });
}, 'Could not fetch app list at this time'));

router.get('/:id', authenticate, userRole, fetchPackage(), canManage, async(req: Request, res: Response) => {
  return success(res, req.pkg.serialize());
});

router.post(
  '/',
  authenticate,
  userRole,
  downloadFile,
  asyncErrorWrapper(async(req: Request, res: Response) => {
    if (!req.body.id || !req.body.id.trim()) {
      return error(res, NO_APP_NAME, 400);
    }

    if (!req.body.name || !req.body.name.trim()) {
      return error(res, NO_APP_TITLE, 400);
    }

    // TODO refactor to use a service method

    const name = req.body.name.trim();
    const id = req.body.id.toLowerCase().trim();

    if (id.includes(' ')) {
      return error(res, NO_SPACES_NAME, 400);
    }

    const existing = await Package.findOneByFilters(id);
    if (existing) {
      return error(res, DUPLICATE_PACKAGE, 400);
    }

    if (!req.isAdminUser && !req.isTrustedUser) {
      if (id.startsWith('com.ubuntu.') && !id.startsWith('com.ubuntu.developer.')) {
        return error(res, BAD_NAMESPACE, 400);
      }
      if (id.startsWith('com.canonical.')) {
        return error(res, BAD_NAMESPACE, 400);
      }
      if (id.includes('ubports')) {
        return error(res, BAD_NAMESPACE, 400);
      }
      if (id.includes('openstore')) {
        return error(res, BAD_NAMESPACE, 400);
      }
    }

    let pkg = new Package();
    pkg.id = id;
    pkg.name = name;
    pkg.maintainer = req.user!._id;
    pkg.maintainer_name = req.user!.name ? req.user!.name : req.user!.username;
    pkg = await pkg.save();

    return success(res, pkg.serialize());
  },
  'There was an error creating your app, please try again later'),
);

const putUpload = mupload.fields([
  /*
    Don't have a max count here because items over the max count cause a cryptic error,
    the handling of extra files is done in updateScreenshotFiles()
  */
  { name: 'screenshot_files' },
]);

router.put(
  '/:id',
  authenticate,
  putUpload,
  userRole,
  fetchPackage(),
  canManageLocked,
  asyncErrorWrapper(async(req: Request, res: Response) => {
    if (req.body && (!req.body.maintainer || req.body.maintainer == 'null')) {
      req.body.maintainer = req.user!._id;
    }

    if (!req.isAdminUser && req.body) {
      delete req.body.maintainer;
      delete req.body.locked;
      delete req.body.type_override;
    }

    const published = (req.body.published == 'true' || req.body.published === true);
    if (published && req.pkg.revisions.length == 0) {
      return error(res, NO_REVISIONS, 400);
    }

    await req.pkg.updateFromBody(req.body);

    if (req.files && !Array.isArray(req.files) && req.files.screenshot_files && req.files.screenshot_files.length > 0) {
      await req.pkg.updateScreenshotFiles(req.files.screenshot_files);
    }

    const pkg = await req.pkg!.save();

    if (pkg.published) {
      await PackageSearch.upsert(pkg);
    }
    else {
      await PackageSearch.remove(pkg);
    }

    return success(res, pkg.serialize());
  },
  'There was an error updating your app, please try again later'),
);

router.delete(
  '/:id',
  authenticate,
  userRole,
  fetchPackage(),
  canManageLocked,
  asyncErrorWrapper(async(req: Request, res: Response) => {
    if (req.pkg.revisions.length > 0) {
      return error(res, APP_HAS_REVISIONS, 400);
    }

    await req.pkg.remove();
    return success(res, {});
  },
  'There was an error deleting your app, please try again later'),
);

const postUpload = mupload.fields([
  { name: 'file', maxCount: 1 },
]);

router.post(
  '/:id/revision',
  authenticate,
  extendTimeout,
  postUpload,
  userRole,
  downloadFile,
  async(req: Request, res: Response) => {
    // TODO refactor this into service method(s)

    if (!req.files || Array.isArray(req.files) || !req.files.file || req.files.file.length === 0) {
      return error(res, NO_FILE, 400);
    }

    const file = req.files.file[0];

    const channel = req.body.channel ? req.body.channel.toLowerCase() : '';
    if (!Object.values(Channel).includes(channel)) {
      return error(res, INVALID_CHANNEL, 400);
    }

    let lock: LockDoc | null = null;
    try {
      lock = await Lock.acquire(`revision-${req.params.id}`);

      // Not using the fetchPackage middleware because we need to lock before fetching the package
      let pkg = await Package.findOneByFilters(req.params.id);
      if (!pkg) {
        await Lock.release(lock, req);
        return error(res, APP_NOT_FOUND, 404);
      }

      if (!req.isAdminUser && req.user!._id != pkg.maintainer) {
        await Lock.release(lock, req);
        return error(res, PERMISSION_DENIED, 403);
      }

      if (!req.isAdminUser && pkg.locked) {
        await Lock.release(lock, req);
        return error(res, APP_LOCKED, 403);
      }

      const filePath = fileName(file);
      const [reviewSuccess, reviewError] = await review(req, file, filePath);
      if (!reviewSuccess) {
        await Lock.release(lock, req);
        return error(res, reviewError, 400);
      }

      const parseData = await clickParser.parseClickPackage(filePath, true);
      const { version, architecture } = parseData;
      if (!parseData.name || !version || !architecture) {
        await Lock.release(lock, req);
        return error(res, MALFORMED_MANIFEST, 400);
      }

      if (pkg.id && parseData.name != pkg.id) {
        await Lock.release(lock, req);
        return error(res, WRONG_PACKAGE, 400);
      }

      if (pkg.id && pkg.revisions) {
        // Check for existing revisions (for this channel) with the same version string

        const matches = pkg.revisions.find((revision) => {
          return (
            revision.version == version &&
            revision.channel == channel &&
            revision.architecture == architecture
          );
        });

        if (matches) {
          await Lock.release(lock, req);
          return error(res, EXISTING_VERSION, 400);
        }

        const currentRevisions = pkg.revisions.filter((rev) => rev.version === version);
        if (currentRevisions.length > 0) {
          const currentArches = currentRevisions.map((rev) => rev.architecture);
          if (architecture == Architecture.ALL && !currentArches.includes(Architecture.ALL)) {
            await Lock.release(lock, req);
            return error(res, NO_ALL, 400);
          }
          if (architecture != Architecture.ALL && currentArches.includes(Architecture.ALL)) {
            await Lock.release(lock, req);
            return error(res, NO_NON_ALL, 400);
          }

          if (parseData.framework != currentRevisions[0].framework) {
            await Lock.release(lock, req);
            return error(res, MISMATCHED_FRAMEWORK, 400);
          }

          // TODO check if permissions are the same with the current list of permissions
        }
      }

      // Only update the data from the parsed click if it's for the default channel or if it's the first one
      const data = (channel == DEFAULT_CHANNEL || pkg.revisions.length === 0) ? parseData : null;
      const downloadSha512 = await sha512Checksum(filePath);

      if (data) {
        pkg.updateFromClick(data);
      }

      const localFilePath = pkg.getClickFilePath(channel, architecture, version);
      await fs.copyFile(filePath, localFilePath);
      await fs.unlink(filePath);

      pkg.newRevision(
        version,
        channel,
        architecture,
        parseData.framework,
        localFilePath,
        downloadSha512,
        parseData.installedSize,
      );

      const updateIcon = (channel == DEFAULT_CHANNEL || !pkg.icon);
      if (updateIcon && parseData.icon) {
        const ext = path.extname(parseData.icon).toLowerCase();
        if (['.png', '.jpg', '.jpeg', '.svg'].includes(ext)) {
          const localIconPath = pkg.getIconFilePath(ext);
          await fs.copyFile(parseData.icon, localIconPath);

          pkg.icon = localIconPath;
        }

        await fs.unlink(parseData.icon);
      }

      if (req.body.changelog) {
        const changelog = pkg.changelog ? `${req.body.changelog.trim()}\n\n${pkg.changelog}` : req.body.changelog.trim();
        pkg.changelog = sanitize(changelog);
      }

      if (!pkg.channels.includes(channel)) {
        pkg.channels.push(channel);
      }

      if (pkg.architectures.includes(Architecture.ALL) && architecture != Architecture.ALL) {
        pkg.architectures = [architecture];
      }
      else if (!pkg.architectures.includes(Architecture.ALL) && architecture == Architecture.ALL) {
        pkg.architectures = [Architecture.ALL];
      }
      else if (!pkg.architectures.includes(architecture)) {
        pkg.architectures.push(architecture);
      }

      pkg = await pkg.save();

      if (pkg.published) {
        await PackageSearch.upsert(pkg);
      }

      await Lock.release(lock, req);
      return success(res, pkg.serialize());
    }
    catch (err) {
      if (lock) {
        await Lock.release(lock, req);
      }

      const message = err?.message ? err.message : err;
      logger.error(`Error updating package: ${message}`);
      captureException(err, req.originalUrl);

      return error(res, 'There was an error updating your app, please try again later');
    }
  },
);

export default router;
