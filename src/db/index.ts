import mongoose from 'mongoose';

import { logger, config } from 'utils';

mongoose.connect(`${config.mongo.uri}/${config.mongo.database}`).catch((err) => {
  if (err) {
    logger.error('database error:', err);
    process.exit(1);
  }
});
