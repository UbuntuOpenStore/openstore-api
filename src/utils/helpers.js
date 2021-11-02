const request = require('request');
const sanitizeHtml = require('sanitize-html');
const Sentry = require('@sentry/node');
const isString = require('lodash/isString');

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

// TODO refactor to use axios
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
        console.log(response);

        reject(new Error(`Failed to download "${url}": ${response.statusCode}`));
      }
    });
  });
}

function getData(req, name, defaultData) {
  if (req.query && req.query[name]) {
    return req.query[name].trim();
  }

  if (req.body && req.body[name]) {
    return req.body[name].trim();
  }

  return defaultData || '';
}

function getDataArray(req, name, defaultData) {
  if (req.query && req.query[name]) {
    if (Array.isArray(req.query[name])) {
      return req.query[name];
    }

    return req.query[name].split(',');
  }

  if (req.body && req.body[name]) {
    return req.body[name];
  }

  return defaultData || [];
}

function getDataBoolean(req, name, defaultData) {
  if (req.query && req.query[name] !== undefined) {
    if (isString(req.query[name])) {
      return req.query[name].toLowerCase() == 'true';
    }

    return Boolean(req.query[name]);
  }

  if (req.body && req.body[name] !== undefined) {
    if (isString(req.body[name])) {
      return req.body[name].toLowerCase() == 'true';
    }

    return Boolean(req.body[name]);
  }

  return Boolean(defaultData);
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
exports.getDataBoolean = getDataBoolean;
exports.sanitize = sanitize;
exports.captureException = captureException;
