const api = require('./api');
const config = require('./utils/config');
const logger = require('./utils/logger');

const cluster = require('cluster');
const os = require('os');

let cpus = os.cpus().length;
let processes = cpus;
if (config.server.process_limit > 0) {
    processes = config.server.process_limit;
    logger.debug(`limiting processes to ${processes} (CPUs: ${cpus})`);
}

if (processes == 1 || !cluster.isMaster) {
    api.setup();
}
else {
    logger.debug(`spawning ${processes} processes`);

    for (let i = 0; i < processes; i += 1) {
        cluster.fork();
    }

    cluster.on('exit', () => {
        cluster.fork();
    });
}
