const {factory} = require('factory-girl');

const Package = require('../../src/db/package/model');

factory.define('package', Package, {
    id: factory.sequence('Package.id', (n) => `foo.bar${n}`),
    name: factory.sequence('Package.name', (n) => `Package ${n}`),
});
