import multer from 'multer';
import path from 'path';
import { v4 } from 'uuid';
import express, { Request, Response } from 'express';

import fs from 'fs/promises';
import { LockDoc } from 'db/lock/types';
import { PackageDoc, Architecture, Channel, DEFAULT_CHANNEL, PackageFindOneFilters } from 'db/package/types';
import Package from 'db/package/model';
import PackageRepo from 'db/package/repo';
import PackageSearch from 'db/package/search';
import LockRepo from 'db/lock/repo';
import { serialize } from 'db/package/serializer';
import config from 'utils/config';
import logger from 'utils/logger';
import { success, error, captureException, sanitize, moveFile } from 'utils/helpers';
import apiLinks from 'utils/api-links';
import * as clickParser from 'utils/click-parser-async';
import checksum from 'utils/checksum';
import * as reviewPackage from 'utils/review-package';
import { authenticate, userRole, downloadFile, extendTimeout } from 'utils/middleware';

const mupload = multer({ dest: '/tmp' });
const router = express.Router();

// TODO translate these errors
const APP_NOT_FOUND = 'App not found';
const NEEDS_MANUAL_REVIEW = 'This app needs to be reviewed manually';
const MALFORMED_MANIFEST = 'Your package manifest is malformed';
const DUPLICATE_PACKAGE = 'A package with the same name already exists';
const PERMISSION_DENIED = 'You do not have permission to update this app';
const BAD_FILE = 'The file must be a click package';
const WRONG_PACKAGE = 'The uploaded package does not match the name of the package you are editing';
const BAD_NAMESPACE = 'You package name is for a domain that you do not have access to';
const EXISTING_VERSION = 'A revision already exists with this version and architecture';
const NO_FILE = 'No file upload specified';
const INVALID_CHANNEL = 'The provided channel is not valid';
const NO_REVISIONS = 'You cannot publish your package until you upload a revision';
const NO_APP_NAME = 'No app name specified';
const NO_SPACES_NAME = 'You cannot have spaces in your app name';
const NO_APP_TITLE = 'No app title specified';
const APP_HAS_REVISIONS = 'Cannot delete an app that already has revisions';
const NO_ALL = 'You cannot upload a click with the architecture "all" for the same version as an architecture specific click';
const NO_NON_ALL = 'You cannot upload and architecture specific click for the same version as a click with the architecture "all"';
const MISMATCHED_FRAMEWORK = 'Framework does not match existing click of a different architecture';
const APP_LOCKED = 'Sorry this app has been locked by an admin';

export type File = {
  originalname: string;
  path: string;
  size: number;
}

function fileName(file: File) {
  // Rename the file so click-review doesn't freak out
  return `${file.path}.click`;
}

async function review(req: Request, file: File, filePath: string) {
  if (!file.originalname.endsWith('.click')) {
    await fs.unlink(file.path);
    return [false, BAD_FILE];
  }

  await moveFile(file.path, filePath);

  if (!req.isAdminUser && !req.isTrustedUser) {
    // Admin & trusted users can upload apps without manual review
    const needsManualReview = await reviewPackage.review(filePath);
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

async function updateScreenshotFiles(pkg: PackageDoc, screenshotFiles: File[]) {
  // Clear out the uploaded files that are over the limit
  let screenshotLimit = 5 - pkg.screenshots.length;
  if (screenshotFiles.length < screenshotLimit) {
    screenshotLimit = screenshotFiles.length;
  }

  if (screenshotFiles.length > screenshotLimit) {
    for (let i = screenshotLimit; i < screenshotFiles.length; i++) {
      await fs.unlink(screenshotFiles[i].path);
    }
  }

  for (let i = 0; i < screenshotLimit; i++) {
    const file = screenshotFiles[i];

    const ext = path.extname(file.originalname);
    if (['.png', '.jpg', '.jpeg'].indexOf(ext) == -1) {
      // Reject anything not an image we support
      await fs.unlink(file.path);
    }
    else {
      const id = v4();
      const filename = `${pkg.id}-screenshot-${id}${ext}`;

      await moveFile(
        screenshotFiles[i].path,
        `${config.image_dir}/${filename}`,
      );

      pkg.screenshots.push(filename);
    }
  }
}

router.get('/', authenticate, userRole, async(req: Request, res: Response) => {
  const filters = PackageRepo.parseRequestFilters(req);
  if (!req.isAdminUser) {
    filters.maintainer = req.user!._id;
  }

  try {
    const pkgs = await PackageRepo.find(filters, filters.sort, filters.limit, filters.skip);
    const count = await PackageRepo.count(filters);

    const formatted = pkgs.map((pkg) => serialize(pkg));
    const { next, previous } = apiLinks(req.originalUrl, formatted.length, filters.limit, filters.skip);
    return success(res, { count, next, previous, packages: formatted });
  }
  catch (err) {
    logger.error('Error fetching packages');
    captureException(err, req.originalUrl);
    return error(res, 'Could not fetch app list at this time');
  }
});

router.get('/:id', authenticate, userRole, async(req: Request, res: Response) => {
  const filters: PackageFindOneFilters = {};
  if (!req.isAdminUser) {
    filters.maintainer = req.user!._id;
  }

  try {
    const pkg = await PackageRepo.findOne(req.params.id, filters);
    if (pkg) {
      return success(res, serialize(pkg));
    }

    return error(res, APP_NOT_FOUND, 404);
  }
  catch (err) {
    captureException(err, req.originalUrl);
    return error(res, APP_NOT_FOUND, 404);
  }
});

router.post(
  '/',
  authenticate,
  userRole,
  downloadFile,
  async(req: Request, res: Response) => {
    if (!req.body.id || !req.body.id.trim()) {
      return error(res, NO_APP_NAME, 400);
    }

    if (!req.body.name || !req.body.name.trim()) {
      return error(res, NO_APP_TITLE, 400);
    }

    const name = req.body.name.trim();
    const id = req.body.id.toLowerCase().trim();

    if (id.includes(' ')) {
      return error(res, NO_SPACES_NAME, 400);
    }

    try {
      const existing = await PackageRepo.findOne(id);
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

      return success(res, serialize(pkg));
    }
    catch (err) {
      logger.error('Error parsing new package');
      captureException(err, req.originalUrl);
      return error(res, 'There was an error creating your app, please try again later');
    }
  },
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
  async(req: Request, res: Response) => {
    try {
      if (req.body && (!req.body.maintainer || req.body.maintainer == 'null')) {
        req.body.maintainer = req.user!._id;
      }

      if (!req.isAdminUser && req.body) {
        delete req.body.maintainer;
        delete req.body.locked;
        delete req.body.type_override;
      }

      let pkg = await PackageRepo.findOne(req.params.id);
      if (!pkg) {
        return error(res, APP_NOT_FOUND, 404);
      }

      if (!req.isAdminUser && req.user!._id != pkg.maintainer) {
        return error(res, PERMISSION_DENIED, 403);
      }

      if (!req.isAdminUser && pkg.locked) {
        return error(res, APP_LOCKED, 403);
      }

      const published = (req.body.published == 'true' || req.body.published === true);
      if (published && pkg.revisions.length == 0) {
        return error(res, NO_REVISIONS, 400);
      }

      await pkg.updateFromBody(req.body);

      if (req.files && !Array.isArray(req.files) && req.files.screenshot_files && req.files.screenshot_files.length > 0) {
        await updateScreenshotFiles(pkg, req.files.screenshot_files);
      }

      pkg = await pkg!.save();

      if (pkg.published) {
        await PackageSearch.upsert(pkg);
      }
      else {
        await PackageSearch.remove(pkg);
      }

      return success(res, serialize(pkg));
    }
    catch (err) {
      logger.error('Error updating package');
      captureException(err, req.originalUrl);
      return error(res, 'There was an error updating your app, please try again later');
    }
  },
);

router.delete(
  '/:id',
  authenticate,
  userRole,
  async(req: Request, res: Response) => {
    try {
      const pkg = await PackageRepo.findOne(req.params.id);
      if (!pkg) {
        return error(res, APP_NOT_FOUND, 404);
      }

      if (!req.isAdminUser && req.user!._id != pkg.maintainer) {
        return error(res, PERMISSION_DENIED, 403);
      }

      if (pkg.revisions.length > 0) {
        return error(res, APP_HAS_REVISIONS, 400);
      }

      await pkg.remove();
      return success(res, {});
    }
    catch (err) {
      logger.error('Error deleting package');
      captureException(err, req.originalUrl);
      return error(res, 'There was an error deleting your app, please try again later');
    }
  },
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
      lock = await LockRepo.acquire(`revision-${req.params.id}`);

      let pkg = await PackageRepo.findOne(req.params.id);
      if (!pkg) {
        await LockRepo.release(lock, req);
        return error(res, APP_NOT_FOUND, 404);
      }

      if (!req.isAdminUser && req.user!._id != pkg.maintainer) {
        await LockRepo.release(lock, req);
        return error(res, PERMISSION_DENIED, 403);
      }

      if (!req.isAdminUser && pkg.locked) {
        await LockRepo.release(lock, req);
        return error(res, APP_LOCKED, 403);
      }

      const filePath = fileName(file);
      const [reviewSuccess, reviewError] = await review(req, file, filePath);
      if (!reviewSuccess) {
        await LockRepo.release(lock, req);
        return error(res, reviewError, 400);
      }

      const parseData = await clickParser.parsePackage(filePath, true);
      const { version, architecture } = parseData;
      if (!parseData.name || !version || !architecture) {
        await LockRepo.release(lock, req);
        return error(res, MALFORMED_MANIFEST, 400);
      }

      if (pkg.id && parseData.name != pkg.id) {
        await LockRepo.release(lock, req);
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
          await LockRepo.release(lock, req);
          return error(res, EXISTING_VERSION, 400);
        }

        const currentRevisions = pkg.revisions.filter((rev) => rev.version === version);
        if (currentRevisions.length > 0) {
          const currentArches = currentRevisions.map((rev) => rev.architecture);
          if (architecture == Architecture.ALL && !currentArches.includes(Architecture.ALL)) {
            await LockRepo.release(lock, req);
            return error(res, NO_ALL, 400);
          }
          if (architecture != Architecture.ALL && currentArches.includes(Architecture.ALL)) {
            await LockRepo.release(lock, req);
            return error(res, NO_NON_ALL, 400);
          }

          if (parseData.framework != currentRevisions[0].framework) {
            await LockRepo.release(lock, req);
            return error(res, MISMATCHED_FRAMEWORK, 400);
          }

          // TODO check if permissions are the same with the current list of permissions
        }
      }

      // Only update the data from the parsed click if it's for the default channel or if it's the first one
      const data = (channel == DEFAULT_CHANNEL || pkg.revisions.length === 0) ? parseData : null;
      const downloadSha512 = await checksum(filePath);

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

      await LockRepo.release(lock, req);
      return success(res, serialize(pkg));
    }
    catch (err) {
      if (lock) {
        await LockRepo.release(lock, req);
      }

      const message = err?.message ? err.message : err;
      logger.error(`Error updating package: ${message}`);
      captureException(err, req.originalUrl);

      return error(res, 'There was an error updating your app, please try again later');
    }
  },
);

export default router;
