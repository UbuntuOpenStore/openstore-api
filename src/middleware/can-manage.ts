import { Request, Response, NextFunction } from 'express';
import { error } from 'utils';
import { APP_LOCKED, PERMISSION_DENIED } from 'utils/error-messages';

export function canManage(req: Request, res: Response, next: NextFunction) {
  if (!req.isAdminUser && req.user!._id != req.pkg.maintainer) {
    error(res, PERMISSION_DENIED, 403);
    return;
  }

  next();
}

export function canManageLocked(req: Request, res: Response, next: NextFunction) {
  canManage(req, res, () => {
    if (!req.isAdminUser && req.pkg.locked) {
      error(res, APP_LOCKED, 403);
      return;
    }

    next();
  });
}
