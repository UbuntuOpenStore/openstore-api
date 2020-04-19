const request = require('request');
const sanitizeHtml = require('sanitize-html');
const Sentry = require('@sentry/node');

const fs = require('./async-fs');
const logger = require('./logger');

function success(res, data, message) {
  res.send({
    success: true,
    data,
    message: message || null,
  });
}

function error(res, message, code) {
  logger.debug(`server: ${message}`);

  res.status(code || 500);
  res.send({
    success: false,
    data: null,
    message,
  });
}

function download(url, filename) {
  return new Promise((resolve, reject) => {
    const r = request(url);
    r.on('error', (err) => {
      reject(err);
    }).on('response', (response) => {
      if (response.statusCode == 200) {
        const f = fs.createWriteStream(filename);
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

function getData(req, name) {
  if (req.query && req.query[name]) {
    return req.query[name].trim();
  }

  if (req.body && req.body[name]) {
    return req.body[name].trim();
  }

  return '';
}

function getDataArray(req, name, defaultData) {
  if (req.query && req.query[name]) {
    return req.query[name].split(',');
  }

  if (req.body && req.body[name]) {
    return req.body[name];
  }

  return defaultData || [];
}

function sanitize(html) {
  return sanitizeHtml(html, {
    allowedTags: [],
    allowedAttributes: [],
  }).replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/\r/g, '')
    .trim();
}

function captureException(err, route) {
  if (process.env.NODE_ENV != 'testing') {
    // TODO clean this up
    console.error(err);
  }

  Sentry.withScope((scope) => {
    scope.setTag('route', route);
    Sentry.captureException(err);
  });
}

exports.success = success;
exports.error = error;
exports.download = download;
exports.getData = getData;
exports.getDataArray = getDataArray;
exports.sanitize = sanitize;
exports.captureException = captureException;
