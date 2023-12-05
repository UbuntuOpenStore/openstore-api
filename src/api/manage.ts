import multer from 'multer';
import express, { type Request, type Response } from 'express';

import fs from 'fs/promises';
import { existsSync } from 'fs';
import { type HydratedLock, Lock } from 'db/lock';
import { Channel } from 'db/package/types';
import { Package } from 'db/package';
import { packageSearchInstance } from 'db/package/search';
import { success, error, captureException, moveFile, apiLinks, logger, asyncErrorWrapper } from 'utils';
import { authenticate, userRole, downloadFile, extendTimeout, fetchPackage, canManage, canManageLocked, maintenanceMode } from 'middleware';
import {
  APP_NOT_FOUND,
  PERMISSION_DENIED,
  BAD_FILE,
  NO_FILE,
  INVALID_CHANNEL,
  NO_REVISIONS,
  NO_APP_NAME,
  NO_APP_TITLE,
  APP_HAS_REVISIONS,
  APP_LOCKED,
  NEEDS_MANUAL_REVIEW,
  CLICK_REVIEW_ERROR,
} from 'utils/error-messages';
import { HttpError, UserError, AuthorizationError, NotFoundError, ClickReviewError } from 'exceptions';
import { clickReview } from 'utils/review-package';

const mupload = multer({ dest: '/tmp' });
const router = express.Router();

/**
 * Get a list of apps belonging to the logged in user.
 * If the user is an admin, return all apps.
 */
router.get('/', authenticate, userRole, asyncErrorWrapper(async (req: Request, res: Response) => {
  const filters = Package.parseRequestFilters(req);
  if (!req.isAdminUser) {
    filters.maintainer = req.user!._id.toString();
  }

  const pkgs = await Package.findByFilters(filters, filters.sort, filters.limit, filters.skip, false);
  const count = await Package.countByFilters(filters, false);

  const formatted = pkgs.map((pkg) => pkg.serialize());
  const { next, previous } = apiLinks(req.originalUrl, formatted.length, filters.limit, filters.skip);
  success(res, { count, next, previous, packages: formatted });
}, 'Could not fetch app list at this time'));

/**
 * Get one app belonging to the logged in user.
 */
router.get('/:id', authenticate, userRole, fetchPackage(), canManage, async (req: Request, res: Response) => {
  success(res, req.pkg.serialize());
});

/**
 * Create a new app from the provided name and id.
 */
router.post(
  '/',
  maintenanceMode,
  authenticate,
  userRole,
  downloadFile,
  asyncErrorWrapper(async (req: Request, res: Response) => {
    if (!req.body.id || !req.body.id.trim()) {
      error(res, NO_APP_NAME, 400);
      return;
    }

    if (!req.body.name || !req.body.name.trim()) {
      error(res, NO_APP_TITLE, 400);
      return;
    }

    const name = req.body.name.trim();
    const id = req.body.id.toLowerCase().trim();

    await Package.checkId(id);
    if (!req.isAdminUser && !req.isTrustedUser) {
      Package.checkRestrictedId(id);
    }

    let pkg = new Package();
    pkg.id = id;
    pkg.name = name;
    pkg.maintainer = req.user!._id.toString();
    pkg.maintainer_name = req.user!.name ? req.user!.name : req.user!.username;
    pkg = await pkg.save();

    success(res, pkg.serialize());
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

/**
 * Update an app. This includes stuff like the description, changelog, screenshots, etc.
 * This does not include updating the revisions.
 */
router.put(
  '/:id',
  maintenanceMode,
  authenticate,
  putUpload,
  userRole,
  fetchPackage(),
  canManageLocked,
  asyncErrorWrapper(async (req: Request, res: Response) => {
    if (req.body && (!req.body.maintainer || req.body.maintainer === 'null')) {
      req.body.maintainer = req.user!._id;
    }

    // Ensure non-admins cannot update admin only fields
    if (!req.isAdminUser && req.body) {
      delete req.body.maintainer;
      delete req.body.locked;
      delete req.body.type_override;
    }

    const published = (req.body.published === 'true' || req.body.published === true);
    if (published && req.pkg.revisions.length === 0) {
      error(res, NO_REVISIONS, 400);
      return;
    }

    await req.pkg.updateFromBody(req.body);

    if (req.files && !Array.isArray(req.files) && req.files.screenshot_files && req.files.screenshot_files.length > 0) {
      await req.pkg.updateScreenshotFiles(req.files.screenshot_files);
    }

    const pkg = await req.pkg.save();

    if (pkg.published) {
      await packageSearchInstance.upsert(pkg);
    }
    else {
      await packageSearchInstance.remove(pkg);
    }

    success(res, pkg.serialize());
  },
  'There was an error updating your app, please try again later'),
);

/**
 * Delete an app. This can only be done before the app has revisions attached.
 */
router.delete(
  '/:id',
  maintenanceMode,
  authenticate,
  userRole,
  fetchPackage(),
  canManageLocked,
  asyncErrorWrapper(async (req: Request, res: Response) => {
    if (req.pkg.revisions.length > 0) {
      error(res, APP_HAS_REVISIONS, 400);
      return;
    }

    await req.pkg.deleteOne();
    success(res, {});
  },
  'There was an error deleting your app, please try again later'),
);

const postUpload = mupload.fields([
  { name: 'file', maxCount: 1 },
]);

/**
 * Create a new revision for an app via the uploaded file. A revision is specific to a channel and an
 * architecture.
 */
router.post(
  '/:id/revision',
  maintenanceMode,
  authenticate,
  extendTimeout,
  postUpload,
  userRole,
  downloadFile,
  async (req: Request, res: Response) => {
    if (!req.files || Array.isArray(req.files) || !req.files.file || req.files.file.length === 0) {
      error(res, NO_FILE, 400);
      return;
    }

    const file = req.files.file[0];

    const channel = req.body.channel ? req.body.channel.toLowerCase() : '';
    if (!Object.values(Channel).includes(channel)) {
      error(res, INVALID_CHANNEL, 400);
      return;
    }

    let lock: HydratedLock | null = null;
    const filePath = `${file.path}.click`;
    try {
      lock = await Lock.acquire(`revision-${req.params.id}`);
      await moveFile(file.path, filePath);

      // Not using the fetchPackage middleware because we need to lock before fetching the package
      let pkg = await Package.findOneByFilters(req.params.id);
      if (!pkg) {
        throw new NotFoundError(APP_NOT_FOUND);
      }

      if (!req.isAdminUser && req.user!._id.toString() !== pkg.maintainer) {
        throw new AuthorizationError(PERMISSION_DENIED);
      }

      if (!req.isAdminUser && pkg.locked) {
        throw new AuthorizationError(APP_LOCKED);
      }

      if (!file.originalname.endsWith('.click')) {
        throw new UserError(BAD_FILE);
      }

      if (req.isAdminUser && pkg.skip_review) {
        logger.info(`Skipping review for ${pkg.id as string}`);
      }
      else {
        const reviewSummary = await clickReview(filePath, pkg.review_exceptions ?? []);
        if (!req.isAdminUser && !req.isTrustedUser) {
          // Admin & trusted users can upload apps without manual review

          if (reviewSummary.manualReviewMessages.length > 0) {
            throw new ClickReviewError(NEEDS_MANUAL_REVIEW, reviewSummary.manualReviewMessages);
          }
        }

        // Everyone needs to upload apps without issues
        if (reviewSummary.errorMessages.length > 0 || reviewSummary.warningMessages.length > 0) {
          throw new ClickReviewError(
            CLICK_REVIEW_ERROR,
            reviewSummary.errorMessages.concat(reviewSummary.warningMessages),
          );
        }
      }

      await pkg.createRevisionFromClick(filePath, channel, req.body.changelog);
      pkg.updateCalculatedProperties();

      pkg = await pkg.save();

      if (pkg.published) {
        await packageSearchInstance.upsert(pkg);
      }

      await Lock.release(lock, req);
      success(res, pkg.serialize());
    }
    catch (err) {
      if (lock) {
        await Lock.release(lock, req);
      }

      // Clean up the uploaded file
      if (existsSync(file.path)) {
        try {
          await fs.unlink(file.path);
        }
        catch (fileError) {
          logger.error(`Error deleting file: ${file.path}`);
          captureException(fileError, req.originalUrl);
        }
      }

      // Clean up the file in the final destination
      if (existsSync(filePath)) {
        try {
          await fs.unlink(filePath);
        }
        catch (fileError) {
          logger.error(`Error deleting file: ${filePath}`);
          captureException(fileError, req.originalUrl);
        }
      }

      if (err instanceof ClickReviewError) {
        error(res, err.message, err.httpCode, {
          reasons: err.reasons,
        });
        return;
      }
      if (err instanceof HttpError) {
        error(res, err.message, err.httpCode);
        return;
      }

      const message = err?.message ? err.message : err;
      logger.error(`Error updating package: ${message as string}`);
      captureException(err, req.originalUrl);

      error(res, 'There was an error updating your app, please try again later');
    }
  },
);

export default router;
