import winston from 'winston';
import * as Sentry from '@sentry/node';

export const logger = winston.createLogger({
  transports: [
    new winston.transports.Console({
      level: (process.env.NODE_ENV === 'production') ? 'info' : 'debug',
      format: winston.format.simple(),
      silent: (process.env.NODE_ENV === 'testing' || process.env.NODE_ENV === 'ci'),
    }),
  ],
});

process.on('uncaughtException', (err) => {
  logger.error('uncaughtException', err);
  console.error(err);

  if (err && err.stack) {
    logger.error(err.stack);
  }

  Sentry.withScope((scope) => {
    scope.setTag('type', 'uncaughtException');
    Sentry.captureException(err);
  });
});

process.on('unhandledRejection', (err) => {
  logger.error('unhandledRejection', err);
  console.error(err);

  Sentry.withScope((scope) => {
    scope.setTag('type', 'unhandledRejection');
    Sentry.captureException(err);
  });
});

export function captureException(err: string | unknown | Error, route: string) {
  if (process.env.NODE_ENV !== 'testing' && process.env.NODE_ENV !== 'ci') {
    console.log(`Error from route: ${route}`);
    console.error(err);
  }

  Sentry.withScope((scope) => {
    scope.setTag('route', route);
    Sentry.captureException(err);
  });
}
