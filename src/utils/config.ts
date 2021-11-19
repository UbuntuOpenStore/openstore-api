import path from 'path';

let configuration = {
  data_dir: process.env.DATA_DIR || '/tmp',
  image_dir: process.env.IMAGE_DIR || '/tmp',
  icon_dir: process.env.ICON_DIR || '/tmp',
  server: {
    ip: process.env.NODEJS_IP || '0.0.0.0',
    port: parseInt(process.env.PORT || process.env.NODEJS_PORT || '8080', 10),
    session_secret: process.env.SESSION_SECRET || 'openstore',
    host: process.env.HOST || 'http://local.open-store.io',
    process_limit: parseInt(process.env.PROCESS_LIMIT || '2', 10),
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
  clickreview: {
    // Heroku command: /app/.apt/usr/bin/click-review
    command: process.env.CLICK_REVIEW_COMMAND || 'click-review',
    // Heroku pythonpath: /app/.apt/usr/lib/python3/dist-packages/
    pythonpath: process.env.CLICK_REVIEW_PYTHONPATH || '',
  },
  github: {
    clientID: process.env.GITHUB_CLIENT_ID || '',
    clientSecret: process.env.GITHUB_CLIENT_SECRET || '',
  },
  gitlab: {
    clientID: process.env.GITLAB_CLIENT_ID || '',
    clientSecret: process.env.GITLAB_CLIENT_SECRET || '',
  },
  sentry: process.env.SENTRY_URL || '',
  version: process.env.VERSION || 'dev',
  telegram: process.env.TELEGRAM || '',
};

if (process.env.NODE_ENV === 'testing') {
  configuration = {
    ...configuration,
    mongo: {
      uri: 'mongodb://127.0.0.1:27017',
      database: 'openstore-test',
    },
    server: {
      ...configuration.server,
      port: 8888,
    },
    elasticsearch: {
      uri: 'http://127.0.0.1:9200/',
      index: 'openstore_test',
    },
  };
}

export const config = configuration;
