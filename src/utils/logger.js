const config = require('./config');

const winston = require('winston');
const papertrail = require('winston-papertrail');

const logger = new (winston.Logger)({
    transports: [
        new (winston.transports.Console)({level: 'debug'}),
    ],
});

logger.cli();

if (config.papertrail.port) {
    logger.add(papertrail.Papertrail, {
        host: config.papertrail.host,
        port: config.papertrail.port,
    });
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
