const passport = require('passport');
const path = require('path');

const helpers = require('./helpers');
const config = require('./config');
const fs = require('./async-fs');

function userRole(req, res, next) {
  req.isAdminUser = (req.isAuthenticated() && req.user.role == 'admin');
  req.isTrustedUser = (req.isAuthenticated() && req.user.role == 'trusted');

  if (req.isAuthenticated() && req.user && req.user.role != 'disabled') {
    next();
  }
  else {
    helpers.error(res, 'Your account has been disabled at this time', 403);
  }
}

function adminOnly(req, res, next) {
  if (req.isAuthenticated() && req.user && req.user.role == 'admin') {
    next();
  }
  else {
    helpers.error(res, 'Forbidden', 403);
  }
}

function extendTimeout(req, res, next) {
  // There seems to be a default timeout of 2 minutes: https://stackoverflow.com/a/46157120
  req.socket.setTimeout(240000); // 4 minutes
  req.socket.on('timeout', () => {
    console.log('socket timeout processing', req.originalUrl, req.params);
  });

  next();
}

function downloadFile(req, res, next) {
  if (!req.file && req.body && req.body.downloadUrl) {
    let filename = path.basename(req.body.downloadUrl);

    // Strip extra hashes & params
    if (filename.indexOf('?') >= 0) {
      filename = filename.substring(0, filename.indexOf('?'));
    }

    if (filename.indexOf('#') >= 0) {
      filename = filename.substring(0, filename.indexOf('#'));
    }

    helpers.download(req.body.downloadUrl, `${config.data_dir}/${filename}`).then((tmpfile) => {
      req.files = {
        file: [{
          originalname: filename,
          path: tmpfile,
          size: fs.statSync(tmpfile).size,
        }],
      };
      next();
    }).catch(() => {
      helpers.error(res, 'Failed to download remote file', 400);
    });
  }
  else {
    next();
  }
}

// Check if the user is logged in, but allow anonymous access
function anonymousAuthenticate(req, res, next) {
  passport.authenticate('localapikey', { session: false }, (err, user) => {
    if (err) {
      return next(err);
    }

    req.user = user;
    return next();
  })(req, res, next);
}

exports.anonymousAuthenticate = anonymousAuthenticate;
exports.authenticate = passport.authenticate('localapikey', { session: false });
exports.userRole = userRole;
exports.adminOnly = adminOnly;
exports.downloadFile = downloadFile;
exports.extendTimeout = extendTimeout;
