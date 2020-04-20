/* eslint-disable no-await-in-loop */
const { sleep } = require('sleepjs');

const Lock = require('./model');
const logger = require('../../utils/logger');
const helpers = require('../../utils/helpers');

const TIMEOUT = 30 * 1000; // 30s in ms
const WAIT_TIME = 500; // ms
const MAX_RETRIES = 100;

const LockRepo = {
  async acquire(name) {
    let lock = null;
    let retries = MAX_RETRIES;
    while (retries > 0) {
      const now = Date.now();

      // Remove expired locks
      await Lock.findOneAndRemove({ name, expire: { $lt: now } });

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
        if (err.code == 11000) {
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

  async release(lock, req) {
    try {
      await lock.remove();
    }
    catch (err) {
      logger.error('failed to release lock');
      helpers.captureException(err, req.originalUrl);
    }
  },
};


module.exports = LockRepo;
