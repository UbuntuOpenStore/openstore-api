/* eslint-disable no-await-in-loop */
import { sleep } from 'sleepjs';
import { type Request } from 'express';
import { Schema, model } from 'mongoose';

import { logger, captureException } from 'utils';
import { type HydratedLock, type ILock, type LockModel } from './types';

const TIMEOUT = 30 * 1000; // 30s in ms
const WAIT_TIME = 500; // ms
const MAX_RETRIES = 100;

const lockSchema = new Schema<ILock, LockModel>({
  name: { type: String },
  expire: { type: Date },
  inserted: { type: Date, default: () => new Date() },
}, { autoIndex: true });

lockSchema.index({ name: 1 }, { unique: true });

lockSchema.statics.acquire = async function (name: string) {
  let lock: HydratedLock = new this({
    name,
    expire: Date.now() + TIMEOUT,
    inserted: Date.now(),
  });

  let retries = MAX_RETRIES;
  while (retries > 0) {
    const now = Date.now();

    // Remove expired locks
    await this.findOneAndRemove({ name, expire: { $lt: new Date(now) } });

    lock = new this({
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
      if (err?.code === 11000) {
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
};

lockSchema.statics.release = async function (lock: HydratedLock | null, req: Request) {
  if (!lock) {
    return;
  }

  try {
    await lock.deleteOne();
  }
  catch (err) {
    logger.error('failed to release lock');
    captureException(err, req.originalUrl);
  }
};

export const Lock = model<ILock, LockModel>('Lock', lockSchema);
