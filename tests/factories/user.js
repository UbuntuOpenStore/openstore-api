const { factory } = require('factory-girl');

const User = require('../../src/db/user/model');

factory.define('user', User, {
  name: factory.sequence('User.name', (n) => `name${n}`),
  username: factory.sequence('User.username', (n) => `username${n}`),
  apikey: factory.sequence('User.username', (n) => `apikey${n}`),
  role: 'community',
});
