import cluster from 'cluster';
import os from 'os';

import { setup } from './api';
import { logger, config } from './utils';

const cpus = os.cpus().length;
let processes = cpus;
if (config.server.process_limit > 0) {
  processes = config.server.process_limit;
  logger.debug(`limiting processes to ${processes} (CPUs: ${cpus})`);
}

if (processes === 1 || !cluster.isPrimary) {
  setup();
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
