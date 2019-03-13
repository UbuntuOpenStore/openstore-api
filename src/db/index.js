const mongoose = require('mongoose');
const bluebird = require('bluebird');

const config = require('../utils/config');
const logger = require('../utils/logger');

mongoose.Promise = bluebird;
mongoose.connect(`${config.mongo.uri}/${config.mongo.database}`, {useNewUrlParser: true}, (err) => {
    if (err) {
        logger.error('database error:', err);
        process.exit(1);
    }
});
