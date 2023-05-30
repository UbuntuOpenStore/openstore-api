import { type Request, type Response, type NextFunction } from 'express';

export function extendTimeout(req: Request, res: Response, next: NextFunction) {
  // There seems to be a default timeout of 2 minutes: https://stackoverflow.com/a/46157120
  req.socket.setTimeout(240000); // 4 minutes
  req.socket.on('timeout', () => {
    console.log('socket timeout processing', req.originalUrl, req.params);
  });

  next();
}
