import { type NextFunction, type Request, type RequestHandler, type Response } from 'express';

import { HttpError } from 'exceptions';
import { captureException, error } from 'utils';

export function asyncErrorWrapper(fn: RequestHandler, errorMessage: string = 'An unknown error happened.') {
  return async function (req: Request, res: Response, next: NextFunction) {
    try {
      // eslint-disable-next-line @typescript-eslint/await-thenable, @typescript-eslint/no-confusing-void-expression
      await fn(req, res, next);
    }
    catch (err) {
      if (err instanceof HttpError) {
        error(res, err.message, err.httpCode);
        return;
      }

      captureException(err, req.originalUrl);
      error(res, errorMessage);
    }
  };
}
