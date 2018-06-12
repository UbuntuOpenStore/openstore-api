const db = require('../db');
const { Package } = require('../db');
const Elasticsearch = require('../db/elasticsearch');
const config = require('../utils/config');
const packages = require('../utils/packages');
const logger = require('../utils/logger');
const helpers = require('../utils/helpers');
const upload = require('../utils/upload');
const clickParse = require('../utils/click-parser-async');
const checksum = require('../utils/checksum');
const reviewPackage = require('../utils/review-package');
const fs = require('../utils/asyncFs');

const passport = require('passport');
const multer = require('multer');
const path = require('path');
const uuid = require('node-uuid');
const express = require('express');

const mupload = multer({dest: '/tmp'});
const router = express.Router();

const APP_NOT_FOUND = 'App not found';
const NEEDS_MANUAL_REVIEW = 'This app needs to be reviewed manually';
const MALFORMED_MANIFEST = 'Your package manifest is malformed';
const DUPLICATE_PACKAGE = 'A package with the same name already exists';
const PERMISSION_DENIED = 'You do not have permission to update this app';
const BAD_FILE = 'The file must be a click package';
const WRONG_PACKAGE = 'The uploaded package does not match the name of the package you are editing';
const BAD_NAMESPACE = 'You package name is for a domain that you do not have access to';
const EXISTING_VERSION = 'A revision already exists with this version';
const NO_FILE = 'No file upload specified';
const INVALID_CHANNEL = 'The provided channel is not valid';

function fileName(file) {
    // Rename the file so click-review doesn't freak out
    return `${file.path}.click`;
}

async function parse(pkg, body, file, filePath, channel) {
    channel = channel || Package.VIVID;

    let parseData = await clickParse(filePath, true);
    if (!parseData.name || !parseData.version || !parseData.architecture) {
        return [false, false, MALFORMED_MANIFEST];
    }

    if (pkg.id && parseData.name != pkg.id) {
        return [false, false, WRONG_PACKAGE];
    }

    if (pkg.id && pkg.revisions) {
        // Check for existing revisions (for this channel) with the same version string

        let matches = pkg.revisions.filter((revision) => {
            return (revision.version == parseData.version && revision.channel == channel);
        });
        if (matches.length > 0) {
            return [false, false, EXISTING_VERSION];
        }
    }

    // Only update the data from the parsed click if it's for vivid
    let data = (channel == Package.VIVID) ? parseData : null;
    let download_sha512 = await checksum(filePath);

    pkg = await packages.updateInfo(pkg, data, body, file, null, true, channel, parseData.version, download_sha512);
    if (channel == Package.VIVID) {
        pkg.download_sha512 = download_sha512;
    }

    return [pkg, parseData, null];
}

async function review(req, file, filePath) {
    if (!file.originalname.endsWith('.click')) {
        fs.unlink(file.path);
        return [false, BAD_FILE];
    }

    await fs.renameAsync(file.path, filePath);

    if (!helpers.isAdminOrTrustedUser(req)) {
        // Admin & trusted users can upload apps without manual review
        let needsManualReview = await reviewPackage(filePath);
        if (needsManualReview) {
            // TODO improve this feedback
            let error = NEEDS_MANUAL_REVIEW;
            if (needsManualReview === true) {
                error = `${NEEDS_MANUAL_REVIEW}, please check you app using the click-review command`;
            }
            else {
                error = `${NEEDS_MANUAL_REVIEW} (Error: ${needsManualReview})`;
            }

            fs.unlink(filePath);
            return [false, error];
        }
    }

    return [true, null];
}

function updateScreenshotFiles(pkg, screenshotFiles) {
    let screenshotLimit = 5 - pkg.screenshots.length;
    if (screenshotFiles.length < screenshotLimit) {
        screenshotLimit = screenshotFiles.length;
    }

    if (screenshotFiles.length > screenshotLimit) {
        for (let i = screenshotLimit; i < screenshotFiles.length; i++) {
            fs.unlink(screenshotFiles[i].path);
        }
    }

    for (let i = 0; i < screenshotLimit; i++) {
        let file = screenshotFiles[i];

        let ext = path.extname(file.originalname);
        if (['.png', '.jpg', '.jpeg'].indexOf(ext) == -1) {
            // Reject anything not an image we support
            fs.unlink(file.path);
        }
        else {
            let id = uuid.v4();
            let filename = `${pkg.id}-screenshot-${id}${ext}`;

            fs.renameSync(
                screenshotFiles[i].path,
                `${config.image_dir}/${filename}`,
            );

            pkg.screenshots.push(`${config.server.host}/api/screenshot/${filename}`);
        }
    }

    return pkg;
}

router.get('/', passport.authenticate('localapikey', {session: false}), (req, res) => {
    let defaultQuery = null;
    if (helpers.isAdminUser(req)) {
        defaultQuery = {};
    }
    else {
        /* eslint-disable no-underscore-dangle */
        defaultQuery = {maintainer: req.user._id};
    }

    let filters = packages.parseFiltersFromRequest(req);
    db.queryPackages(filters, defaultQuery).then((results) => {
        let pkgs = results[0];
        let count = results[1];

        let formatted = [];
        pkgs.forEach((pkg) => {
            formatted.push(packages.toJson(pkg, req));
        });

        if (req.originalUrl.substring(0, 19) == '/api/v1/manage/apps') {
            helpers.success(res, formatted);
        }
        else {
            let links = helpers.nextPreviousLinks(req, formatted.length);

            helpers.success(res, {
                count: count,
                packages: formatted,
                next: links.next,
                previous: links.previous,
            });
        }
    }).catch((err) => {
        logger.error('Error fetching packages:', err);
        helpers.error(res, 'Could not fetch app list at this time');
    });
});

router.get('/:id', passport.authenticate('localapikey', {session: false}), (req, res) => {
    let query = null;
    if (helpers.isAdminUser(req)) {
        query = Package.findOne({id: req.params.id});
    }
    else {
        query = Package.findOne({id: req.params.id, maintainer: req.user._id});
    }

    query.then((pkg) => {
        helpers.success(res, packages.toJson(pkg, req));
    }).catch(() => {
        helpers.error(res, APP_NOT_FOUND, 404);
    });
});

// Make the post similar to the put
let postUpload = mupload.fields([
    {name: 'file', maxCount: 1},
]);

router.post('/', passport.authenticate('localapikey', {session: false}), postUpload, helpers.isNotDisabled, helpers.downloadFileMiddleware, async (req, res) => {
    if (!req.files.file.length == 1) {
        return helpers.error(res, NO_FILE);
    }

    try {
        if (req.body && !req.body.maintainer) {
            req.body.maintainer = req.user._id;
        }

        let success;
        let error;
        let filePath = fileName(req.files.file[0]);
        [success, error] = await review(req, req.files.file[0], filePath);
        if (!success) {
            return helpers.error(res, error, 400);
        }

        let parseData;
        let pkg = new Package();
        [pkg, parseData, error] = await parse(pkg, req.body, req.files.file[0], filePath);
        if (!pkg) {
            return helpers.error(res, error, 400);
        }

        if (!helpers.isAdminOrTrustedUser(req)) {
            if (parseData.name.substring(0, 11) == 'com.ubuntu.' && parseData.name.substring(0, 21) != 'com.ubuntu.developer.') {
                return helpers.error(res, BAD_NAMESPACE, 400);
            }
            else if (parseData.name.startsWith('com.canonical.')) {
                return helpers.error(res, BAD_NAMESPACE, 400);
            }
            else if (parseData.name.substring(0, 12) == 'com.ubports.') {
                return helpers.error(res, BAD_NAMESPACE, 400);
            }
        }

        let existing = await Package.findOne({id: parseData.name}).exec();
        if (existing) {
            return helpers.error(res, DUPLICATE_PACKAGE, 400);
        }

        let packageUrl;
        let iconUrl;
        [packageUrl, iconUrl] = await upload.uploadPackage(
            pkg,
            filePath,
            parseData.icon,
        );

        pkg.package = packageUrl;
        pkg.icon = iconUrl;

        pkg.revisions.forEach((data) => {
            if (data.revision == pkg.revision) {
                data.download_url = packageUrl;
            }
        });

        if (!pkg.channels.includes(Package.VIVID)) {
            pkg.channels.push(Package.VIVID);
        }

        pkg = await pkg.save();

        let es = new Elasticsearch();
        if (pkg.published) {
            await es.upsert(pkg);
        }
        else {
            await es.remove(pkg);
        }

        return helpers.success(res, packages.toJson(pkg, req));
    }
    catch (err) {
        logger.error('Error parsing new package:', err);
        return helpers.error(res, 'There was an error creating your app, please try again later');
    }
});

let putUpload = mupload.fields([
    {name: 'file', maxCount: 1},
    {name: 'screenshot_files', maxCount: 5},
]);

// TODO depricate file uploads
router.put('/:id', passport.authenticate('localapikey', {session: false}), putUpload, helpers.isNotDisabled, helpers.downloadFileMiddleware, async(req, res) => {
    try {
        if (req.body && (!req.body.maintainer || req.body.maintainer == 'null')) {
            req.body.maintainer = req.user._id;
        }

        let pkg = await Package.findOne({id: req.params.id}).exec();
        if (!pkg) {
            return helpers.error(res, APP_NOT_FOUND, 404);
        }

        let previousRevision = pkg.revision;

        if (!helpers.isAdminUser(req) && req.user._id != pkg.maintainer) {
            return helpers.error(res, PERMISSION_DENIED, 400);
        }

        if (req.files && req.files.file && req.files.file.length > 0) {
            // A new revision was uploaded

            let success;
            let error;
            let filePath = fileName(req.files.file[0]);
            [success, error] = await review(req, req.files.file[0], filePath);
            if (!success) {
                return helpers.error(res, error, 400);
            }

            let parseData;
            [pkg, parseData, error] = await parse(pkg, req.body, req.files.file[0], filePath);
            if (!pkg) {
                return helpers.error(res, error, 400);
            }

            let packageUrl;
            let iconUrl;
            [packageUrl, iconUrl] = await upload.uploadPackage(
                pkg,
                filePath,
                parseData.icon,
            );

            pkg.package = packageUrl;
            pkg.icon = iconUrl;

            let xenialRevisionData = pkg.revisions.filter((data) => {
                return (data.revision == pkg.xenial_revision);
            });
            xenialRevisionData = (xenialRevisionData.length > 0) ? xenialRevisionData[0] : null;

            for (let i = 0; i < pkg.revisions.length; i++) {
                let data = pkg.revisions[i];
                if (data.revision == pkg.revision) {
                    data.download_url = packageUrl;
                }

                if (data.revision == previousRevision) {
                    if (data.channel == Package.VIVID && xenialRevisionData && xenialRevisionData.download_url == data.download_url) {
                        /*
                        Do nothing, this revision has a migrated xenial revision
                        relying on the same download_url.
                        */
                    }
                    else {
                        await upload.removeFile(data.download_url);
                    }
                }
            }
        }
        else {
            // Just the app info was updated
            pkg = await packages.updateInfo(pkg, null, req.body, null, null, false);
        }

        if (req.files && req.files.screenshot_files && req.files.screenshot_files.length > 0) {
            pkg = updateScreenshotFiles(pkg, req.files.screenshot_files);
        }

        pkg = await pkg.save();

        let es = new Elasticsearch();
        if (pkg.published) {
            await es.upsert(pkg);
        }
        else {
            await es.remove(pkg);
        }

        return helpers.success(res, packages.toJson(pkg, req));
    }
    catch (err) {
        console.log(err);
        logger.error('Error updating package:', err);
        return helpers.error(res, 'There was an error updating your app, please try again later');
    }
});

router.post('/:id/revision', passport.authenticate('localapikey', {session: false}), postUpload, helpers.isNotDisabled, helpers.downloadFileMiddleware, async(req, res) => {
    if (!req.files || !req.files.file || !req.files.file.length == 1) {
        return helpers.error(res, NO_FILE, 400);
    }

    let channel = req.body.channel ? req.body.channel.toLowerCase() : '';
    let bothChannels = (channel == 'vivid-xenial');
    if (bothChannels) {
        channel = Package.VIVID;
    }
    else if (!Package.CHANNELS.includes(channel)) {
        return helpers.error(res, INVALID_CHANNEL, 400);
    }

    try {
        let pkg = await Package.findOne({id: req.params.id}).exec();
        if (!pkg) {
            return helpers.error(res, APP_NOT_FOUND, 404);
        }

        let previousRevision = (channel == Package.XENIAL) ? pkg.xenial_revision : pkg.revision;

        if (!helpers.isAdminUser(req) && req.user._id != pkg.maintainer) {
            return helpers.error(res, PERMISSION_DENIED, 400);
        }

        let success;
        let error;
        let filePath = fileName(req.files.file[0]);
        [success, error] = await review(req, req.files.file[0], filePath);
        if (!success) {
            return helpers.error(res, error, 400);
        }

        let parseData;
        [pkg, parseData, error] = await parse(pkg, null, req.files.file[0], filePath, channel);
        if (!pkg) {
            return helpers.error(res, error, 400);
        }

        let packageUrl;
        let iconUrl;
        [packageUrl, iconUrl] = await upload.uploadPackage(
            pkg,
            filePath,
            (channel == Package.VIVID) ? parseData.icon : null,
            channel,
            parseData.version, // Don't use pkg.version as that is only the vivid version number
        );

        let revision = (channel == Package.XENIAL) ? pkg.xenial_revision : pkg.revision;
        if (channel == Package.VIVID) {
            pkg.package = packageUrl;
            pkg.icon = iconUrl;
        }

        if (bothChannels) {
            pkg = await packages.updateInfo(pkg, null, null, req.files.file[0], null, true, Package.XENIAL, parseData.version, pkg.download_sha512);

            if (!pkg.channels.includes(Package.XENIAL)) {
                pkg.channels.push(Package.XENIAL);
            }
        }

        let xenialRevisionData = pkg.revisions.filter((data) => {
            return (data.revision == pkg.xenial_revision);
        });
        xenialRevisionData = (xenialRevisionData.length > 0) ? xenialRevisionData[0] : null;

        for (let i = 0; i < pkg.revisions.length; i++) {
            let data = pkg.revisions[i];
            if (data.channel == channel) {
                if (data.revision == revision) {
                    data.download_url = packageUrl;
                }

                if (data.revision == previousRevision) {
                    if (data.channel == Package.VIVID && xenialRevisionData && xenialRevisionData.download_url == data.download_url) {
                        /*
                        Do nothing, this revision has a migrated xenial revision
                        relying on the same download_url.
                        */
                        console.log('no delete');
                    }
                    else {
                        console.log('delete');
                        await upload.removeFile(data.download_url);
                    }
                }
            }

            if (bothChannels && data.channel == Package.XENIAL) {
                if (data.revision == pkg.xenial_revision) {
                    data.download_url = packageUrl;
                }
            }
        }

        if (!pkg.channels.includes(channel)) {
            pkg.channels.push(channel);
        }

        pkg = await pkg.save();

        if (pkg.published) {
            let es = new Elasticsearch();
            await es.upsert(pkg);
        }

        return helpers.success(res, packages.toJson(pkg, req));
    }
    catch (err) {
        console.log(err);
        logger.error('Error updating package:', err);
        return helpers.error(res, 'There was an error updating your app, please try again later');
    }
});

module.exports = router;
