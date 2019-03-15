const request = require('request');
const path = require('path');
const mime = require('mime');
const sanitizeHtml = require('sanitize-html');

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

function sanitize(html) {
    return sanitizeHtml(html, {
        allowedTags: [],
        allowedAttributes: [],
    }).replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/\r/g, '');
}

exports.success = success;
exports.error = error;
exports.download = download;
exports.checkDownload = checkDownload;
exports.getData = getData;
exports.getDataArray = getDataArray;
exports.sanitize = sanitize;
