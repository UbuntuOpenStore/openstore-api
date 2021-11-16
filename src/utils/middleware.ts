import passport from 'passport';
import path from 'path';
import { Request, Response, NextFunction } from 'express';
import fs from 'fs';

import { error, download } from './helpers';
import config from './config';

export function userRole(req: Request, res: Response, next: NextFunction) {
  req.isAdminUser = (req.isAuthenticated() && req.user && req.user.role == 'admin');
  req.isTrustedUser = (req.isAuthenticated() && req.user && req.user.role == 'trusted');

  if (req.isAuthenticated() && req.user && req.user.role != 'disabled') {
    next();
  }
  else {
    error(res, 'Your account has been disabled at this time', 403);
  }
}

export function adminOnly(req: Request, res: Response, next: NextFunction) {
  if (req.isAuthenticated() && req.user && req.user.role == 'admin') {
    next();
  }
  else {
    error(res, 'Forbidden', 403);
  }
}

export function extendTimeout(req: Request, res: Response, next: NextFunction) {
  // There seems to be a default timeout of 2 minutes: https://stackoverflow.com/a/46157120
  req.socket.setTimeout(240000); // 4 minutes
  req.socket.on('timeout', () => {
    console.log('socket timeout processing', req.originalUrl, req.params);
  });

  next();
}

export function downloadFile(req: Request, res: Response, next: NextFunction) {
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
        } as any],
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

// Check if the user is logged in, but allow anonymous access
export function anonymousAuthenticate(req: Request, res: Response, next: NextFunction) {
  passport.authenticate('localapikey', { session: false }, (err, user) => {
    if (err) {
      return next(err);
    }

    req.user = user;
    return next();
  })(req, res, next);
}

export const authenticate = passport.authenticate('localapikey', { session: false });
