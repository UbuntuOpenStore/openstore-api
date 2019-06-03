const winston = require('winston');
require('winston-papertrail');
const Sentry = require('@sentry/node');

const config = require('./config');

const logger = winston.createLogger({
    transports: [
        new winston.transports.Console({
            level: (process.env.NODE_ENV == 'production') ? 'info' : 'debug',
            format: winston.format.simple(),
            silent: (process.env.NODE_ENV == 'testing'),
        }),
    ],
});

if (config.papertrail.port && config.papertrail.host) {
    try {
        let winstonPapertrail = new winston.transports.Papertrail({
            host: config.papertrail.host,
            port: config.papertrail.port,
        });

        logger.add(winstonPapertrail);
    }
    catch (err) {
        console.error(err);
        Sentry.withScope((scope) => {
            scope.setTag('type', 'logger');
            Sentry.captureException(err);
        });
    }
}

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

module.exports = logger;
