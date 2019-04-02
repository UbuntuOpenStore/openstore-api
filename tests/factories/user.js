const {factory} = require('factory-girl');

const User = require('../../src/db/user/model');

factory.define('user', User, {
    username: factory.sequence('User.username', (n) => `username${n}`),
    apikey: factory.sequence('User.username', (n) => `apikey${n}`),
    role: 'community',
});
