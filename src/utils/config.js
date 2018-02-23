'use strict';

const fs = require('fs');

//Allow the smartfile api key/pass to be set when testing locally
let configFile = {};
if (fs.existsSync(__dirname + '/config.json')) {
    configFile = JSON.parse(fs.readFileSync(__dirname + '/config.json'));
}

var config = {
    data_dir: process.env.DATA_DIR || '/tmp',
    image_dir: process.env.IMAGE_DIR || '/tmp',
    server: {
        ip: process.env.NODEJS_IP || '0.0.0.0',
        port: process.env.PORT || process.env.NODEJS_PORT || 8080,
        session_secret: process.env.SESSION_SECRET || 'openstore',
        host: process.env.HOST || 'http://local.open-store.io',
        secondary_host: process.env.SECONDARY_HOST || 'http://local.open.uappexplorer.com',
        process_limit: process.env.PROCESS_LIMIT || 0,
        static_root: process.env.STATIC_ROOT || __dirname + '/../../www/',
    },
    mongo: {
        uri: process.env.MONGODB_URI || 'mongodb://localhost',
        database: process.env.MONGODB_DB || 'openstore',
    },
    elasticsearch: {
        uri: process.env.ELASTICSEARCH_URI || 'http://localhost:9200/',
    },
    smartfile: {
        key: configFile.SMARTFILE_KEY || process.env.SMARTFILE_KEY || '',
        password: configFile.SMARTFILE_PASS || process.env.SMARTFILE_PASS || '',
        url: process.env.SMARTFILE_URL || 'https://app.smartfile.com/api/2/path/data/test/',
        share: process.env.SMARTFILE_SHARE || 'https://file.ac/MjgQmGAVzEU/',
    },
    papertrail: {
        host: process.env.PAPERTRAIL_HOST,
        port: process.env.PAPERTRAIL_PORT,
    },
    clickreview: {
        //Heroku command: /app/.apt/usr/bin/click-review
        command: process.env.CLICK_REVIEW_COMMAND || 'click-review',
        //Heroku pythonpath: /app/.apt/usr/lib/python3/dist-packages/
        pythonpath: process.env.CLICK_REVIEW_PYTHONPATH || '',
    },
    github: {
        clientID: configFile.GITHUB_CLIENT_ID || process.env.GITHUB_CLIENT_ID || '',
        clientSecret: configFile.GITHUB_CLIENT_SECRET || process.env.GITHUB_CLIENT_SECRET || '',
    }
};

//Mongo uri from docker
if (process.env.MONGO_PORT) {
    config.mongo.uri = process.env.MONGO_PORT.replace('tcp', 'mongodb');
}

//Elasticsearch uri from docker
if (process.env.ELASTICSEARCH_PORT) {
    config.elasticsearch.uri = process.env.ELASTICSEARCH_PORT.replace('tcp', 'http');
}

module.exports = config;
