import { type Response } from 'express';
import { logger } from './logger';

export function success(res: Response, data: any, message?: string) {
  res.send({
    success: true,
    data,
    message: message || null,
  });
}

export function error(res: Response, message: string | unknown | Error, code = 500, data: any = null) {
  if (typeof message === 'string' || message instanceof Error) {
    logger.debug(`server: ${message.toString()}`);
  }
  else {
    console.log(message);
  }

  res.status(code);
  res.send({
    success: false,
    data,
    message,
  });
}
