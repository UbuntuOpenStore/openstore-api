const multer = require('multer');
const path = require('path');
const uuid = require('node-uuid');
const express = require('express');

const Package = require('../db/package/model');
const PackageRepo = require('../db/package/repo');
const PackageSearch = require('../db/package/search');
const LockRepo = require('../db/lock/repo');
const { serialize } = require('../db/package/serializer');
const config = require('../utils/config');
const logger = require('../utils/logger');
const helpers = require('../utils/helpers');
const apiLinks = require('../utils/api-links');
const clickParser = require('../utils/click-parser-async');
const checksum = require('../utils/checksum');
const reviewPackage = require('../utils/review-package');
const { authenticate, userRole, downloadFile } = require('../utils/middleware');
const fs = require('../utils/async-fs');

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

function fileName(file) {
  // Rename the file so click-review doesn't freak out
  return `${file.path}.click`;
}

async function review(req, file, filePath) {
  if (!file.originalname.endsWith('.click')) {
    await fs.unlinkAsync(file.path);
    return [false, BAD_FILE];
  }

  await fs.renameAsync(file.path, filePath);

  if (!req.isAdminUser && !req.isTrustedUser) {
    // Admin & trusted users can upload apps without manual review
    const needsManualReview = await reviewPackage.review(filePath);
    if (needsManualReview) {
      // TODO improve this feedback
      let error = NEEDS_MANUAL_REVIEW;
      if (needsManualReview === true) {
        error = `${NEEDS_MANUAL_REVIEW}, please check your app using the click-review command`;
      }
      else {
        error = `${NEEDS_MANUAL_REVIEW} (Error: ${needsManualReview})`;
      }

      await fs.unlinkAsync(filePath);
      return [false, error];
    }
  }

  return [true, null];
}

function updateScreenshotFiles(pkg, screenshotFiles) {
  // Clear out the uploaded files that are over the limit
  let screenshotLimit = 5 - pkg.screenshots.length;
  if (screenshotFiles.length < screenshotLimit) {
    screenshotLimit = screenshotFiles.length;
  }

  if (screenshotFiles.length > screenshotLimit) {
    for (let i = screenshotLimit; i < screenshotFiles.length; i++) {
      fs.unlinkAsync(screenshotFiles[i].path);
    }
  }

  for (let i = 0; i < screenshotLimit; i++) {
    const file = screenshotFiles[i];

    const ext = path.extname(file.originalname);
    if (['.png', '.jpg', '.jpeg'].indexOf(ext) == -1) {
      // Reject anything not an image we support
      fs.unlinkAsync(file.path);
    }
    else {
      const id = uuid.v4();
      const filename = `${pkg.id}-screenshot-${id}${ext}`;

      fs.renameSync(
        screenshotFiles[i].path,
        `${config.image_dir}/${filename}`,
      );

      pkg.screenshots.push(`${config.server.host}/api/screenshot/${filename}`);
    }
  }

  return pkg;
}

router.get('/', authenticate, userRole, async(req, res) => {
  const filters = PackageRepo.parseRequestFilters(req);
  if (!req.isAdminUser) {
    filters.maintainer = req.user._id;
  }

  try {
    const pkgs = await PackageRepo.find(filters, filters.sort, filters.limit, filters.skip);
    const count = await PackageRepo.count(filters);

    const formatted = pkgs.map((pkg) => serialize(pkg));
    const { next, previous } = apiLinks(req.originalUrl, formatted.length, req.query.limit, req.query.skip);
    return helpers.success(res, { count, next, previous, packages: formatted });
  }
  catch (err) {
    logger.error('Error fetching packages');
    helpers.captureException(err, req.originalUrl);
    return helpers.error(res, 'Could not fetch app list at this time');
  }
});

router.get('/:id', authenticate, userRole, async(req, res) => {
  const filters = {};
  if (!req.isAdminUser) {
    filters.maintainer = req.user._id;
  }

  try {
    const pkg = await PackageRepo.findOne(req.params.id, filters);
    if (pkg) {
      return helpers.success(res, serialize(pkg));
    }

    return helpers.error(res, APP_NOT_FOUND, 404);
  }
  catch (err) {
    helpers.captureException(err, req.originalUrl);
    return helpers.error(res, APP_NOT_FOUND, 404);
  }
});

router.post(
  '/',
  authenticate,
  userRole,
  downloadFile,
  async(req, res) => {
    if (!req.body.id || !req.body.id.trim()) {
      return helpers.error(res, NO_APP_NAME, 400);
    }

    if (!req.body.name || !req.body.name.trim()) {
      return helpers.error(res, NO_APP_TITLE, 400);
    }

    const name = req.body.name.trim();
    const id = req.body.id.toLowerCase().trim();

    if (id.includes(' ')) {
      return helpers.error(res, NO_SPACES_NAME, 400);
    }

    try {
      const existing = await PackageRepo.findOne(id);
      if (existing) {
        return helpers.error(res, DUPLICATE_PACKAGE, 400);
      }

      if (!req.isAdminUser && !req.isTrustedUser) {
        if (id.startsWith('com.ubuntu.') && !id.startsWith('com.ubuntu.developer.')) {
          return helpers.error(res, BAD_NAMESPACE, 400);
        }
        if (id.startsWith('com.canonical.')) {
          return helpers.error(res, BAD_NAMESPACE, 400);
        }
        if (id.includes('ubports')) {
          return helpers.error(res, BAD_NAMESPACE, 400);
        }
        if (id.includes('openstore')) {
          return helpers.error(res, BAD_NAMESPACE, 400);
        }
      }

      let pkg = new Package();
      pkg.id = id;
      pkg.name = name;
      pkg.maintainer = req.user._id;
      pkg.maintainer_name = req.user.name ? req.user.name : req.user.username;
      pkg = await pkg.save();

      return helpers.success(res, serialize(pkg));
    }
    catch (err) {
      logger.error('Error parsing new package');
      helpers.captureException(err, req.originalUrl);
      return helpers.error(res, 'There was an error creating your app, please try again later');
    }
  },
);

const putUpload = mupload.fields([
  { name: 'screenshot_files', maxCount: 5 },
]);

router.put(
  '/:id',
  authenticate,
  putUpload,
  userRole,
  async(req, res) => {
    try {
      if (req.body && (!req.body.maintainer || req.body.maintainer == 'null')) {
        req.body.maintainer = req.user._id;
      }

      if (!req.isAdminUser && req.body) {
        delete req.body.maintainer;
        delete req.body.locked;
        delete req.body.type_override;
      }

      if (!req.isAdminUser && req.body && req.body.type_override) {
        delete req.body.type_override;
      }

      let pkg = await PackageRepo.findOne(req.params.id);
      if (!pkg) {
        return helpers.error(res, APP_NOT_FOUND, 404);
      }

      if (!req.isAdminUser && req.user._id != pkg.maintainer) {
        return helpers.error(res, PERMISSION_DENIED, 403);
      }

      if (!req.isAdminUser && pkg.locked) {
        return helpers.error(res, APP_LOCKED, 403);
      }

      const published = (req.body.published == 'true' || req.body.published === true);
      if (published && pkg.revisions.length == 0) {
        return helpers.error(res, NO_REVISIONS, 400);
      }

      await pkg.updateFromBody(req.body);

      if (req.files && req.files.screenshot_files && req.files.screenshot_files.length > 0) {
        pkg = updateScreenshotFiles(pkg, req.files.screenshot_files);
      }

      pkg = await pkg.save();

      if (pkg.published) {
        await PackageSearch.upsert(pkg);
      }
      else {
        await PackageSearch.remove(pkg);
      }

      return helpers.success(res, serialize(pkg));
    }
    catch (err) {
      logger.error('Error updating package');
      helpers.captureException(err, req.originalUrl);
      return helpers.error(res, 'There was an error updating your app, please try again later');
    }
  },
);

router.delete(
  '/:id',
  authenticate,
  userRole,
  async(req, res) => {
    try {
      const pkg = await PackageRepo.findOne(req.params.id);
      if (!pkg) {
        return helpers.error(res, APP_NOT_FOUND, 404);
      }

      if (!req.isAdminUser && req.user._id != pkg.maintainer) {
        return helpers.error(res, PERMISSION_DENIED, 403);
      }

      if (pkg.revisions.length > 0) {
        return helpers.error(res, APP_HAS_REVISIONS, 400);
      }

      await pkg.remove();
      return helpers.success(res, {});
    }
    catch (err) {
      logger.error('Error deleting package');
      helpers.captureException(err, req.originalUrl);
      return helpers.error(res, 'There was an error deleting your app, please try again later');
    }
  },
);

const postUpload = mupload.fields([
  { name: 'file', maxCount: 1 },
]);

router.post(
  '/:id/revision',
  authenticate,
  postUpload,
  userRole,
  downloadFile,
  async(req, res) => {
    if (!req.files || !req.files.file || !req.files.file.length == 1) {
      return helpers.error(res, NO_FILE, 400);
    }

    const file = req.files.file[0];

    const channel = req.body.channel ? req.body.channel.toLowerCase() : '';
    if (!Package.CHANNELS.includes(channel)) {
      return helpers.error(res, INVALID_CHANNEL, 400);
    }

    let lock = null;
    try {
      lock = await LockRepo.acquire(`revision-${req.params.id}`);

      let pkg = await PackageRepo.findOne(req.params.id);
      if (!pkg) {
        await LockRepo.release(lock, req);
        return helpers.error(res, APP_NOT_FOUND, 404);
      }

      if (!req.isAdminUser && req.user._id != pkg.maintainer) {
        await LockRepo.release(lock, req);
        return helpers.error(res, PERMISSION_DENIED, 403);
      }

      if (!req.isAdminUser && pkg.locked) {
        await LockRepo.release(lock, req);
        return helpers.error(res, APP_LOCKED, 403);
      }

      const filePath = fileName(file);
      const [success, error] = await review(req, file, filePath);
      if (!success) {
        await LockRepo.release(lock, req);
        return helpers.error(res, error, 400);
      }

      const parseData = await clickParser.parse(filePath, true);
      const { version, architecture } = parseData;
      if (!parseData.name || !version || !architecture) {
        await LockRepo.release(lock, req);
        return helpers.error(res, MALFORMED_MANIFEST, 400);
      }

      if (pkg.id && parseData.name != pkg.id) {
        await LockRepo.release(lock, req);
        return helpers.error(res, WRONG_PACKAGE, 400);
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
          return helpers.error(res, EXISTING_VERSION, 400);
        }

        const currentRevisions = pkg.revisions.filter((rev) => rev.version === version);
        if (currentRevisions.length > 0) {
          const currentArches = currentRevisions.map((rev) => rev.architecture);
          if (architecture == Package.ALL && !currentArches.includes(Package.ALL)) {
            await LockRepo.release(lock, req);
            return helpers.error(res, NO_ALL, 400);
          }
          if (architecture != Package.ALL && currentArches.includes(Package.ALL)) {
            await LockRepo.release(lock, req);
            return helpers.error(res, NO_NON_ALL, 400);
          }

          if (parseData.framework != currentRevisions[0].framework) {
            await LockRepo.release(lock, req);
            return helpers.error(res, MISMATCHED_FRAMEWORK, 400);
          }

          // TODO check if permissions are the same with the current list of permissions
        }
      }

      // Only update the data from the parsed click if it's for XENIAL or if it's the first one
      const data = (channel == Package.XENIAL || pkg.revisions.length === 0) ? parseData : null;
      const downloadSha512 = await checksum(filePath);

      if (data) {
        pkg.updateFromClick(data);
      }

      const localFilePath = pkg.getClickFilePath(channel, architecture, version);
      await fs.copyFileAsync(filePath, localFilePath);
      await fs.unlinkAsync(filePath);

      pkg.newRevision(
        version,
        channel,
        architecture,
        parseData.framework,
        localFilePath,
        downloadSha512,
        parseData.installedSize,
      );

      const updateIcon = (channel == Package.XENIAL || !pkg.icon);
      if (updateIcon && parseData.icon) {
        const localIconPath = pkg.getIconFilePath(version, path.extname(parseData.icon));
        await fs.copyFileAsync(parseData.icon, localIconPath);
        await fs.unlinkAsync(parseData.icon);
        pkg.icon = localIconPath;
      }

      if (req.body.changelog) {
        const changelog = pkg.changelog ? `${req.body.changelog.trim()}\n\n${pkg.changelog}` : req.body.changelog.trim();
        pkg.changelog = helpers.sanitize(changelog);
      }

      if (!pkg.channels.includes(channel)) {
        pkg.channels.push(channel);
      }

      if (pkg.architectures.includes(Package.ALL) && architecture != Package.ALL) {
        pkg.architectures = [architecture];
      }
      else if (!pkg.architectures.includes(Package.ALL) && architecture == Package.ALL) {
        pkg.architectures = [Package.ALL];
      }
      else if (!pkg.architectures.includes(architecture)) {
        pkg.architectures.push(architecture);
      }

      pkg = await pkg.save();

      if (pkg.published) {
        await PackageSearch.upsert(pkg);
      }

      await LockRepo.release(lock, req);
      return helpers.success(res, serialize(pkg));
    }
    catch (err) {
      if (lock) {
        await LockRepo.release(lock, req);
      }

      const message = err.message ? err.message : err;
      logger.error(`Error updating package: ${message}`);
      helpers.captureException(err, req.originalUrl);

      if (err.response) {
        logger.info('Response data');
        console.log(err.response.data);
        console.log(err.response.status);
        console.log(err.response.headers);
      }
      else if (err.request) {
        logger.info('Request data (no response received)');
        console.log(err.request);
      }

      return helpers.error(res, 'There was an error updating your app, please try again later');
    }
  },
);

module.exports = router;
