const winston = require('winston');
require('winston-papertrail');

const config = require('./config');

const logger = winston.createLogger({
    transports: [
        new winston.transports.Console({
            level: 'debug',
            format: winston.format.simple(),
        }),
    ],
});

if (config.papertrail.port) {
    let winstonPapertrail = new winston.transports.Papertrail({
        host: config.papertrail.host,
        port: config.papertrail.port,
    });

    logger.add(winstonPapertrail);
}
else {
    logger.debug('No papertrail token');
}

process.on('uncaughtException', (err) => {
    logger.error('uncaughtException', err);

    if (err && err.stack) {
        logger.error(err.stack);
    }
});

process.on('unhandledRejection', (reason) => {
    logger.error('unhandledRejection', reason);
});

module.exports = logger;
