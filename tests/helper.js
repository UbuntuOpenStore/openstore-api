const chai = require('chai');
const FactoryGirl = require('factory-girl');
const adapter = new FactoryGirl.MongooseAdapter();
const mongoose = require('mongoose');
const request = require('supertest');
const sinon = require('sinon');

require('./factories/package');
require('./factories/user');
const api = require('../src/api');

FactoryGirl.factory.setAdapter(adapter);

chai.use(require('sinon-chai'));
chai.config.includeStack = true;

before(async function() {
    // Wait for the mongo connection to settle
    if (mongoose.connection.readyState != 1) {
        await new Promise((resolve) => mongoose.connection.once('open', resolve));
    }

    this.sandbox = sinon;
    this.app = api.setup();

    let generateRequest = (method) => {
        return (route, withApiKey=true) => {
            if (withApiKey) {
                route = route.includes('?') ? `${route}&apikey=${this.user.apikey}`: `${route}?apikey=${this.user.apikey}`;
            }

            return request(this.app)[method](route);
        };
    };

    this.get = generateRequest('get');
    this.post = generateRequest('post');
    this.put = generateRequest('put');
    this.delete = generateRequest('delete');
});

beforeEach(async function() {
    // Clean out the database
    collections = await mongoose.connection.db.listCollections().toArray()

    await Promise.all(collections.map(({name}) => {
        if (name == 'system.profile') {
            return;
        }

        collection = mongoose.connection.db.collection(name)
        collection.deleteMany({})
    }));

    this.user = await FactoryGirl.factory.create('user', {role: 'admin'})
});

after(function() {
    this.app.server.close();
    mongoose.connection.close();
});

afterEach(function() {
    this.sandbox.restore();
});

exports.expect = chai.expect;
