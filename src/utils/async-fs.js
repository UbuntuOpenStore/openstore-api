const fs = require('fs');
const bluebird = require('bluebird');

bluebird.promisifyAll(fs);

module.exports = fs;
