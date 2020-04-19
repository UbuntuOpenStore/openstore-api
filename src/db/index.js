const mongoose = require('mongoose');
const bluebird = require('bluebird');

const config = require('../utils/config');
const logger = require('../utils/logger');

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
