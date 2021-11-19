import { Response } from 'express';
import { logger } from './logger';

export function success(res: Response, data: any, message?: string) {
  res.send({
    success: true,
    data,
    message: message || null,
  });
}

export function error(res: Response, message: string | unknown | Error, code = 500) {
  logger.debug(`server: ${message}`);

  res.status(code);
  res.send({
    success: false,
    data: null,
    message,
  });
}
