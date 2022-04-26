import { NextFunction, Request, RequestHandler, Response } from 'express';
import { captureException, error } from 'utils';

export function asyncErrorWrapper(fn: RequestHandler, errorMessage: string) {
  return async function(req: Request, res: Response, next: NextFunction) {
    try {
      return await fn(req, res, next);
    }
    catch (err) {
      captureException(err, req.originalUrl);
      return error(res, errorMessage);
    }
  };
}
