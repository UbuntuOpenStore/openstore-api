const db = require('../db');
const Elasticsearch = require('../db/elasticsearch');
const config = require('../utils/config');
const packages = require('../utils/packages');
const logger = require('../utils/logger');
const helpers = require('../utils/helpers');
const upload = require('../utils/upload');
const clickParse = require('../utils/click-parser-async');
const checksum = require('../utils/checksum');
const reviewPackage = require('../utils/review-package');

const passport = require('passport');
const multer  = require('multer');
const cluster = require('cluster');
const fs = require('fs');
const crypto = require('crypto');
const exec = require('child_process').exec;
const bluebird = require('bluebird');
const path = require('path');
const mime = require('mime');
const uuid = require('node-uuid');

bluebird.promisifyAll(fs);
const mupload = multer({dest: '/tmp'});

const NEEDS_MANUAL_REVIEW = 'This app needs to be reviewed manually';
const MALFORMED_MANIFEST = 'Your package manifest is malformed';
const DUPLICATE_PACKAGE = 'A package with the same name already exists';
const PERMISSION_DENIED = 'You do not have permission to update this app';
const BAD_FILE = 'The file must be a click or snap package';
const WRONG_PACKAGE = 'The uploaded package does not match the name of the package you are editing';
const APP_NOT_FOUND = 'App not found';
const BAD_NAMESPACE = 'You package name is for a domain that you do not have access to';
const EXISTING_VERSION = 'A revision already exists with this version';

function fileName(file) {
    let filePath = file.path;
    //Rename the file so click-review doesn't freak out
    if (file.originalname.endsWith('.click')) {
        filePath += '.click';
    }
    else {
        filePath += '.snap';
    }

    return filePath;
}

async function parse(pkg, body, file, filePath) {
    let parseData = await clickParse(filePath, true);
    if (!parseData.name || !parseData.version || !parseData.architecture) {
        return [false, false, MALFORMED_MANIFEST];
    }

    if (pkg.id && parseData.name != pkg.id) {
        return [false, false, WRONG_PACKAGE];
    }

    if (pkg.id && pkg.revisions) {
        //Check for existing revisions with the same version string

        let matches = pkg.revisions.filter((revision) => (revision.version == parseData.version));
        if (matches.length > 0) {
            return [false, false, EXISTING_VERSION];
        }
    }

    pkg = await packages.updateInfo(pkg, parseData, body, file, null, true);
    pkg.download_sha512 = await checksum(filePath);

    return [pkg, parseData, null];
}

async function review(req, file, filePath) {
    if (
        !file.originalname.endsWith('.click') &&
        !file.originalname.endsWith('.snap')
    ) {
        fs.unlink(file.path);
        return [false, BAD_FILE];
    }

    await fs.renameAsync(file.path, filePath);

    if (!helpers.isAdminOrTrustedUser(req)) { // Admin & trusted users can upload apps without manual review
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
        };
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
            continue;
        }
        else {
            let id = uuid.v4();
            let filename = `${pkg.id}-screenshot-${id}${ext}`;

            fs.renameSync(
                screenshotFiles[i].path,
                `${config.image_dir}/${filename}`
            );

            pkg.screenshots.push(`${config.server.host}/api/screenshot/${filename}`);
        }
    }
}

function setup(app) {
    app.get(['/api/v1/manage/apps', '/api/v2/manage/apps'], passport.authenticate('localapikey', {session: false}), function(req, res) {
        let defaultQuery = null;
        if (helpers.isAdminUser(req)) {
            defaultQuery = {};
        }
        else {
            defaultQuery = {maintainer: req.user._id};
        }

        let filters = packages.parseFiltersFromRequest(req);
        db.queryPackages(filters, defaultQuery).then((results) => {
            let pkgs = results[0];
            let count = results[1];

            let formatted = [];
            pkgs.forEach(function(pkg) {
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

    app.get(['/api/v1/manage/apps/:id', '/api/v2/manage/apps/:id'], passport.authenticate('localapikey', {session: false}), function(req, res) {
        let query = null;
        if (helpers.isAdminUser(req)) {
            query = db.Package.findOne({id: req.params.id});
        }
        else {
            query = db.Package.findOne({id: req.params.id, maintainer: req.user._id});
        }

        query.then((pkg) => {
            helpers.success(res, packages.toJson(pkg, req));
        }).catch((err) => {
            helpers.error(res, 'App not found', 404);
        });
    });

    app.post(['/api/apps', '/api/v1/manage/apps', '/api/v2/manage/apps'], passport.authenticate('localapikey', {session: false}), mupload.single('file'), helpers.isNotDisabled, helpers.downloadFileMiddleware, async function(req, res) {
        if (!req.file) {
            return helpers.error(res, 'No file upload specified');
        }

        try {
            if (req.body && !req.body.maintainer) {
                req.body.maintainer = req.user._id;
            }

            let filePath = fileName(req.file);
            [success, error] = await review(req, req.file, filePath);
            if (!success) {
                return helpers.error(res, error, 400);
            }

            let pkg = new db.Package();
            [pkg, parseData, error] = await parse(pkg, req.body, req.file, filePath);
            if (!pkg) {
                return helpers.error(res, error, 400);
            }

            if (!helpers.isAdminOrTrustedUser(req)) {
                if (parseData.name.substring(0, 11) == 'com.ubuntu.' && parseData.name.substring(0, 21) != 'com.ubuntu.developer.') {
                    return helpers.error(res, BAD_NAMESPACE, 400);
                }
                else if (parseData.name.substring(0, 12) == 'com.ubports.') {
                    return helpers.error(res, BAD_NAMESPACE, 400);
                }
            }

            let existing = await db.Package.findOne({id: parseData.name});
            if (existing) {
                return helpers.error(res, DUPLICATE_PACKAGE, 400);
            }

            [packageUrl, iconUrl] = await upload.uploadPackage(
                pkg,
                filePath,
                parseData.icon
            );

            pkg.package = packageUrl;
            pkg.icon = iconUrl;

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

    app.put(['/api/apps/:id', '/api/v1/manage/apps/:id', '/api/v2/manage/apps/:id'], passport.authenticate('localapikey', {session: false}), putUpload, helpers.isNotDisabled, helpers.downloadFileMiddleware, async function(req, res) {
        try {
            if (req.body && (!req.body.maintainer || req.body.maintainer == 'null')) {
                req.body.maintainer = req.user._id;
            }

            let pkg = await db.Package.findOne({id: req.params.id});
            if (!helpers.isAdminUser(req) && req.user._id != pkg.maintainer) {
                return helpers.error(res, PERMISSION_DENIED, 400);
            }

            if (req.files && req.files.file && req.files.file.length > 0) {
                // A new revision was uploaded

                let filePath = fileName(req.files.file[0]);
                [success, error] = await review(req, req.files.file[0], filePath);
                if (!success) {
                    return helpers.error(res, error, 400);
                }

                [pkg, parseData, error] = await parse(pkg, req.body, req.files.file[0], filePath);
                if (!pkg) {
                    return helpers.error(res, error, 400);
                }

                [packageUrl, iconUrl] = await upload.uploadPackage(
                    pkg,
                    filePath,
                    parseData.icon
                );

                pkg.package = packageUrl;
                pkg.icon = iconUrl;
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
}

exports.setup = setup;
