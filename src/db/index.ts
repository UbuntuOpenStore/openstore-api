import mongoose from 'mongoose';
import bluebird from 'bluebird';

import { logger, config } from 'utils';

mongoose.Promise = bluebird;
mongoose.set('useNewUrlParser', true);
mongoose.set('useFindAndModify', false);
mongoose.set('useCreateIndex', true);
mongoose.set('useUnifiedTopology', true);

mongoose.connect(`${config.mongo.uri}/${config.mongo.database}`, (err) => {
  if (err) {
    logger.error('database error:', err);
    process.exit(1);
  }
});
