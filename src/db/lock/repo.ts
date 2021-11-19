/* eslint-disable no-await-in-loop */
import { sleep } from 'sleepjs';
import { Request } from 'express';

import { logger, captureException } from 'utils';
import Lock from './model';
import { LockDoc } from './types';

const TIMEOUT = 30 * 1000; // 30s in ms
const WAIT_TIME = 500; // ms
const MAX_RETRIES = 100;

export default {
  async acquire(name: string) {
    let lock: LockDoc = new Lock({
      name,
      expire: Date.now() + TIMEOUT,
      inserted: Date.now(),
    });

    let retries = MAX_RETRIES;
    while (retries > 0) {
      const now = Date.now();

      // Remove expired locks
      await Lock.findOneAndRemove({ name, expire: { $lt: new Date(now) } });

      lock = new Lock({
        name,
        expire: now + TIMEOUT,
        inserted: now,
      });

      try {
        await lock.save();
        retries = 0;
        logger.debug('Lock acquired');
      }
      catch (err) {
        if (err?.code == 11000) {
          // a lock already exists, try again
          logger.debug(`Lock exists, going to wait (retries: ${retries})`);
          retries--;
          await sleep(WAIT_TIME);
        }
        else {
          throw err;
        }
      }
    }

    return lock;
  },

  async release(lock: LockDoc | null, req: Request) {
    if (!lock) {
      return;
    }

    try {
      await lock.remove();
    }
    catch (err) {
      logger.error('failed to release lock');
      captureException(err, req.originalUrl);
    }
  },
};
