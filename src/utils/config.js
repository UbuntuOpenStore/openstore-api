const fs = require('fs');
const path = require('path');

// Allow api key/pass to be set when testing locally
let configFile = {};
let configFilePath = path.join(__dirname, 'config.json');
if (fs.existsSync(configFilePath)) {
    configFile = JSON.parse(fs.readFileSync(configFilePath));
}

let config = {
    data_dir: process.env.DATA_DIR || '/tmp',
    image_dir: process.env.IMAGE_DIR || '/tmp',
    icon_dir: process.env.ICON_DIR || '/tmp',
    server: {
        ip: process.env.NODEJS_IP || '0.0.0.0',
        port: process.env.PORT || process.env.NODEJS_PORT || 8080,
        session_secret: process.env.SESSION_SECRET || 'openstore',
        host: process.env.HOST || 'http://local.open-store.io',
        process_limit: process.env.PROCESS_LIMIT || 2,
        static_root: process.env.STATIC_ROOT || path.join(__dirname, '../../www/'),
    },
    mongo: {
        uri: process.env.MONGODB_URI || 'mongodb://mongo:27017',
        database: process.env.MONGODB_DB || 'openstore',
    },
    elasticsearch: {
        uri: process.env.ELASTICSEARCH_URI || 'http://elasticsearch:9200/',
        index: process.env.ELASTICSEARCH_INDEX || 'openstore_packages',
    },
    papertrail: {
        host: process.env.PAPERTRAIL_HOST,
        port: process.env.PAPERTRAIL_PORT,
    },
    clickreview: {
        // Heroku command: /app/.apt/usr/bin/click-review
        command: process.env.CLICK_REVIEW_COMMAND || 'click-review',
        // Heroku pythonpath: /app/.apt/usr/lib/python3/dist-packages/
        pythonpath: process.env.CLICK_REVIEW_PYTHONPATH || '',
    },
    github: {
        clientID: configFile.GITHUB_CLIENT_ID || process.env.GITHUB_CLIENT_ID || '',
        clientSecret: configFile.GITHUB_CLIENT_SECRET || process.env.GITHUB_CLIENT_SECRET || '',
    },
    gitlab: {
        clientID: configFile.GITLAB_CLIENT_ID || process.env.GITLAB_CLIENT_ID || '',
        clientSecret: configFile.GITLAB_CLIENT_SECRET || process.env.GITLAB_CLIENT_SECRET || '',
    },
    sentry: configFile.SENTRY_URL || process.env.SENTRY_URL || '',
    version: configFile.VERSION || process.env.VERSION || 'dev',
    telegram: configFile.TELEGRAM || process.env.TELEGRAM || '',
};

module.exports = config;
