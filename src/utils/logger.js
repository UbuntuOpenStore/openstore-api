const winston = require('winston');
require('winston-papertrail');

const config = require('./config');

// TODO set this to log level when running tests
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
    console.error(err);

    if (err && err.stack) {
        logger.error(err.stack);
    }
});

process.on('unhandledRejection', (err) => {
    logger.error('unhandledRejection', err);
    console.error(err);
});

module.exports = logger;
