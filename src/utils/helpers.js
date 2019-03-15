const request = require('request');
const path = require('path');
const mime = require('mime');

const fs = require('../utils/asyncFs');
const logger = require('../utils/logger');
const config = require('../utils/config');

function success(res, data, message) {
    res.send({
        success: true,
        data: data,
        message: message || null,
    });
}

function error(res, message, code) {
    logger.error(`server: ${message}`);

    res.status(code || 500);
    res.send({
        success: false,
        data: null,
        message: message,
    });
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
    let ok = false;
    if (req.isAuthenticated()) {
        if (req.user.role == 'admin') {
            ok = true;
        }
    }

    return ok;
}

function isAdminOrTrustedUser(req) {
    let ok = false;
    if (req.isAuthenticated()) {
        if (req.user.role == 'admin' || req.user.role == 'trusted') {
            ok = true;
        }
    }

    return ok;
}

function isAdminOrTrustedOwner(req, pkg) {
    let ok = false;
    if (req.isAuthenticated()) {
        if (req.user.role == 'admin') {
            ok = true;
        }
        /* eslint-disable no-underscore-dangle */
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
        }).on('response', (response) => {
            if (response.statusCode == 200) {
                let f = fs.createWriteStream(filename);
                f.on('error', (err) => {
                    reject(err);
                }).on('finish', () => {
                    resolve(filename);
                });

                r.pipe(f);
            }
            else {
                reject(new Error(`Failed to download "${url}": ${response.statusCode}`));
            }
        });
    });
}

function downloadFileMiddleware(req, res, next) {
    if (!req.file && req.body && req.body.downloadUrl) {
        let filename = path.basename(req.body.downloadUrl);

        // Strip extra hashes & params
        if (filename.indexOf('?') >= 0) {
            filename = filename.substring(0, filename.indexOf('?'));
        }

        if (filename.indexOf('#') >= 0) {
            filename = filename.substring(0, filename.indexOf('#'));
        }

        download(req.body.downloadUrl, `${config.data_dir}/${filename}`).then((tmpfile) => {
            req.files = {
                file: [{
                    originalname: filename,
                    path: tmpfile,
                    size: fs.statSync(tmpfile).size,
                }],
            };
            next();
        }).catch(() => {
            error(res, 'Failed to download remote file', 400);
        });
    }
    else {
        next();
    }
}

async function checkDownload(url, filename, headers, res) {
    if (!fs.existsSync(filename)) {
        filename = await download(url, filename);
    }

    let stat = await fs.statAsync(filename);
    res.setHeader('Content-Length', stat.size);
    res.setHeader('Content-type', mime.lookup(filename));

    for (let header of Object.keys(headers)) {
        res.setHeader(header, headers[header])
    }

    fs.createReadStream(filename).pipe(res);
}

function getData(req, name) {
    if (req.query && req.query[name]) {
        return req.query[name].trim().toLowerCase();
    }
    else if (req.body && req.body[name]) {
        return req.body[name].trim().toLowerCase();
    }

    return null;
}

function getDataArray(req, name) {
    if (req.query && req.query[name]) {
        return req.query[name].split(',');
    }
    else if (req.body && req.body[name]) {
        return req.body[name];
    }

    return [];
}

exports.success = success;
exports.error = error;
exports.isAdmin = isAdmin;
exports.isAdminOrTrusted = isAdminOrTrusted;
exports.isAdminOrTrustedOwner = isAdminOrTrustedOwner;
exports.isAdminUser = isAdminUser;
exports.isAdminOrTrustedUser = isAdminOrTrustedUser;
exports.download = download;
exports.downloadFileMiddleware = downloadFileMiddleware;
exports.checkDownload = checkDownload;
exports.getData = getData;
exports.getDataArray = getDataArray;
