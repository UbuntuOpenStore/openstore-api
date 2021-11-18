import passport from 'passport';
import { Request, Response, NextFunction } from 'express';

import { error } from 'utils/helpers';

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
