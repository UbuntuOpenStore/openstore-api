import { Request, Response, NextFunction } from 'express';

import { error } from 'utils';

export function maintenanceMode(req: Request, res: Response, next: NextFunction) {
  if (process.env.OPENSTORE_MAINTENANCE_MODE) {
    error(res, 'The OpenStore is currently under maintenance, please try again later', 503);
  }
  else {
    next();
  }
}
