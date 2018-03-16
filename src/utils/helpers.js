'use strict';

const logger = require('../utils/logger');
const config = require('../utils/config');

const fs = require('fs');
const request = require('request');
const path = require('path');

function success(res, data, message) {
    res.send({
        success: true,
        data: data,
        message: message ? message : null
    });
}

function error(res, message, code) {
    logger.error('server: ' + message);

    res.status(code ? code : 500);
    res.send({
        success: false,
        data: null,
        message: message
    });
}

function isNotDisabled(req, res, next) {
    if (req.isAuthenticated() && req.user && req.user.role != 'disabled') {
        next();
    }
    else {
        error(res, 'Your account has been disabled at this time', 403);
    }
}

function isAdmin(req, res, next) {
    if (req.isAuthenticated() && req.user && req.user.role == 'admin') {
        next();
    }
    else {
        error(res, 'Forbidden', 403);
    }
}

function isAdminOrTrusted(req, res, next) {
    if (req.isAuthenticated() && req.user && (req.user.role == 'admin' || req.user.role == 'trusted')) {
        next();
    }
    else {
        error(res, 'Forbidden', 403);
    }
}

function isAdminUser(req) {
    var ok = false;
    if (req.isAuthenticated()) {
        if (req.user.role == 'admin') {
            ok = true;
        }
    }

    return ok;
}

function isAdminOrTrustedUser(req) {
    var ok = false;
    if (req.isAuthenticated()) {
        if (req.user.role == 'admin' || req.user.role == 'trusted') {
            ok = true;
        }
    }

    return ok;
}

function isAdminOrTrustedOwner(req, pkg) {
    var ok = false;
    if (req.isAuthenticated()) {
        if (req.user.role == 'admin') {
            ok = true;
        }
        else if (req.user.role == 'trusted' && pkg && pkg.maintainer == req.user._id) {
            ok = true;
        }
    }

    return ok;
}

function download(url, filename) {
    return new Promise((resolve, reject) => {
        let r = request(url);
        r.on('error', (err) => {
            reject(err);
        })
        .on('response', (response) => {
            if (response.statusCode == 200) {
                let f = fs.createWriteStream(filename);
                f.on('error', (err) => {
                    reject(err);
                })
                .on('finish', () => {
                    resolve(filename);
                });

                r.pipe(f);
            }
            else {
                reject('Failed to download "' + url + '": ' + response.statusCode);
            }
        });
    });
}

function downloadFileMiddleware(req, res, next) {
    if (!req.file && req.body.downloadUrl) {
        let filename = path.basename(req.body.downloadUrl);

        //Strip extra hashes & params
        if (filename.indexOf('?') >= 0) {
            filename = filename.substring(0, filename.indexOf('?'));
        }

        if (filename.indexOf('#') >= 0) {
            filename = filename.substring(0, filename.indexOf('#'));
        }

        download(req.body.downloadUrl, `${config.data_dir}/${filename}`).then((tmpfile) => {
            req.file = {
                originalname: filename,
                path: tmpfile,
                size: fs.statSync(tmpfile).size,
            };
            next();
        }).catch((err) => {
            error(res, 'Failed to download remote file', 400);
        });
    }
    else {
        next();
    }
}

function nextPreviousLinks(req, count) {
    let next = null;
    let previous = null;
    let limit = req.query.limit ? parseInt(req.query.limit) : 0;
    let skip = req.query.skip ? parseInt(req.query.skip) : 0;

    let url = config.server.host + req.originalUrl;
    if (count == limit) {
        let nextSkip = skip + limit;

        //TODO use the url module once the node version is upgraded
        if (url.indexOf('skip') == -1) {
            if (url.indexOf('?') == -1) {
                next = url + '?skip=' + nextSkip;
            }
            else {
                next = url + '&skip=' + nextSkip;
            }
        }
        else {
            next = url.replace('skip=' + skip, 'skip=' + nextSkip);
        }
    }

    if (skip > 0) {
        let previousSkip = (skip - limit > 0) ? (skip - limit) : 0;

        //TODO use the url module once the node version is upgraded
        if (url.indexOf('skip') == -1) {
            if (url.indexOf('?') == -1) {
                previous = url + '?skip=' + previousSkip;
            }
            else {
                previous = url + '&skip=' + previousSkip;
            }
        }
        else {
            previous = url.replace('skip=' + skip, 'skip=' + previousSkip);
        }
    }

    return {
        next: next,
        previous: previous,
    }
}

exports.success = success;
exports.error = error;
exports.isNotDisabled = isNotDisabled;
exports.isAdmin = isAdmin;
exports.isAdminOrTrusted = isAdminOrTrusted;
exports.isAdminOrTrustedOwner = isAdminOrTrustedOwner;
exports.isAdminUser = isAdminUser;
exports.isAdminOrTrustedUser = isAdminOrTrustedUser;
exports.download = download;
exports.downloadFileMiddleware = downloadFileMiddleware;
exports.nextPreviousLinks = nextPreviousLinks;
