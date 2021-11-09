import mongoose from 'mongoose';
import bluebird from 'bluebird';

import config from '../utils/config';
import logger from '../utils/logger';

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
