const chai = require('chai');
const mongoose = require('mongoose');
const request = require('supertest');
const sinon = require('sinon');
const sinonChai = require('sinon-chai');

const factory = require('./factory');
const api = require('../src/api');

chai.use(sinonChai);
chai.config.includeStack = true;

before(async function() {
  // Wait for the mongo connection to settle
  if (mongoose.connection.readyState != 1) {
    await new Promise((resolve) => mongoose.connection.once('open', resolve));
  }

  this.sandbox = sinon;
  this.app = api.setup();

  const generateRequest = (method) => {
    return (route, withApiKey = true) => {
      let modifiedRoute = route;
      if (withApiKey) {
        modifiedRoute = route.includes('?') ? `${route}&apikey=${this.user.apikey}` : `${route}?apikey=${this.user.apikey}`;
      }

      return request(this.app)[method](modifiedRoute);
    };
  };

  this.get = generateRequest('get');
  this.post = generateRequest('post');
  this.put = generateRequest('put');
  this.delete = generateRequest('delete');
});

beforeEach(async function() {
  // Clean out the database
  const collections = await mongoose.connection.db.listCollections().toArray();

  await Promise.all(collections.map(({ name }) => {
    if (name == 'system.profile') {
      return null;
    }

    const collection = mongoose.connection.db.collection(name);
    return collection.deleteMany({});
  }));

  this.user = await factory.user({ role: 'admin' });
});

after(function() {
  this.app.server.close();
  mongoose.connection.close();
});

afterEach(function() {
  this.sandbox.restore();
});

exports.expect = chai.expect;
