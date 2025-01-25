import { test, describe, beforeEach, before, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { cleanMongoose, closeMongoose, waitForMongoose } from 'tests/utils';
import factory, { type TestPackage } from 'tests/factory';
import * as api from 'api';
import { type App } from 'supertest/types';

import path from 'node:path';
import { Architecture, Channel, ChannelArchitecture, DEFAULT_CHANNEL } from 'db/package/types';
import { Package } from 'db/package/model';
import * as messages from 'utils/error-messages';

describe('Apps API', () => {
  const route = '/api/v3/apps/';
  let app: App;
  let package1: TestPackage;
  let package2: TestPackage;
  let unpublishedPackage: TestPackage;

  before(async () => {
    await waitForMongoose();

    app = api.setup();
  });

  after(async () => {
    await closeMongoose();
  });

  beforeEach(async () => {
    await cleanMongoose();

    [package1, package2, unpublishedPackage] = await Promise.all([
      factory.package({
        id: 'app1',
        name: 'App1',
        author: 'John',
        published: true,
        category: 'Utilities',
        channels: [DEFAULT_CHANNEL],
      }),
      factory.package({
        id: 'app2',
        name: 'App2',
        author: 'Jane',
        published: true,
        category: 'Games',
        channels: [DEFAULT_CHANNEL],
      }),
      factory.package({
        id: 'app3',
        name: 'App3',
        author: 'Joe',
        published: false,
        category: 'Games',
        channels: [DEFAULT_CHANNEL],
      }),
    ]);
  });

  describe('GET one app', () => {
    test('gets an app successfully', async () => {
      const { body } = await request(app).get(`${route}${package1.id}`).expect(200);

      assert.ok(body.success);
      assert.equal(body.data.id, package1.id);
    });

    test('throws a 404', async () => {
      const res = await request(app).get(`${route}foobar`).expect(404);

      assert.equal(res.body.success, false);
    });

    test('throws a 404 for an unpublished app', async () => {
      const res = await request(app).get(`${route}${unpublishedPackage.id}`).expect(404);

      assert.equal(res.body.success, false);
    });

    test('fails gracefully', async function (t) {
      const mockFindOneByFilters = t.mock.method(Package, 'findOneByFilters', () => { throw new Error(); });

      const res = await request(app).get(`${route}${package1.id}`).expect(500);

      assert.equal(res.body.success, false);
      assert.equal(mockFindOneByFilters.mock.callCount(), 1);
    });
  });

  describe('GET all apps', () => {
    test('returns successfully', async () => {
      const res = await request(app).get(route).expect(200);

      assert.ok(res.body.success);
      assert.equal(res.body.data.packages.length, 2);
      assert.equal(res.body.data.count, 2);
    });

    /*
    // TODO it seems that populating the data during the test doesn't work properly
    test('searches for apps', async () => {
      await packageSearchInstance.bulk([
        package1,
        package2,
      ]);

      const res = await request(app).get(`${route}?search=${package1.name}`).expect(200);

      assert.ok(res.body.success);
      assert.equal(res.body.data.packages.length, 1);
      assert.equal(res.body.data.count, 1);
      assert.equal(res.body.data.packages[0].id, package1.id);
      });
    */

    test('searches by author', async () => {
      const res = await request(app).get(`${route}?search=author:${package2.author!}`).expect(200);

      assert.ok(res.body.success);
      assert.equal(res.body.data.packages.length, 1);
      assert.equal(res.body.data.count, 1);
      assert.equal(res.body.data.packages[0].id, package2.id);
    });

    test('fails gracefully', async function (t) {
      const mockFindByFilters = t.mock.method(Package, 'findByFilters', () => { throw new Error(); });

      const res = await request(app).get(route).expect(500);

      assert.equal(res.body.success, false);
      assert.equal(mockFindByFilters.mock.callCount(), 1);
    });

    test('gets apps for a specific architecture/channel (including ALL)', async () => {
      package1.channel_architectures = [ChannelArchitecture.FOCAL_ARMHF];
      package2.channel_architectures = [ChannelArchitecture.FOCAL_ALL];
      unpublishedPackage.channel_architectures = [ChannelArchitecture.FOCAL_ARM64];
      await Promise.all([
        package1.save(),
        package2.save(),
        unpublishedPackage.save(),
      ]);

      const res = await request(app).get(`${route}?architecture=armhf&channel=${Channel.FOCAL}`).expect(200);
      assert.ok(res.body.success);
      assert.equal(res.body.data.packages.length, 2);
      assert.equal(res.body.data.count, 2);
      assert.equal(res.body.data.packages[0].id, package1.id);
      assert.equal(res.body.data.packages[1].id, package2.id);
    });

    test('gets apps for a specific architecture/channel (excluding other channels)', async () => {
      package1.channel_architectures = [ChannelArchitecture.FOCAL_ARMHF];
      package2.channel_architectures = [ChannelArchitecture.XENIAL_ALL];
      unpublishedPackage.channel_architectures = [ChannelArchitecture.XENIAL_ARM64];
      await Promise.all([
        package1.save(),
        package2.save(),
        unpublishedPackage.save(),
      ]);

      const res = await request(app).get(`${route}?architecture=armhf&channel=${Channel.FOCAL}`).expect(200);
      assert.ok(res.body.success);
      assert.equal(res.body.data.packages.length, 1);
      assert.equal(res.body.data.count, 1);
      assert.equal(res.body.data.packages[0].id, package1.id);
    });

    test('gets apps for a specific arch/channel/framework', async () => {
      package1.device_compatibilities = [`${ChannelArchitecture.FOCAL_ARMHF}:ubuntu-sdk-20.04`];
      package2.device_compatibilities = [`${ChannelArchitecture.FOCAL_ALL}:ubuntu-sdk-16.04`];
      unpublishedPackage.device_compatibilities = [`${ChannelArchitecture.FOCAL_ARMHF}:ubuntu-sdk-16.04`];
      await Promise.all([
        package1.save(),
        package2.save(),
        unpublishedPackage.save(),
      ]);

      const res = await request(app).get(
        `${route}?architecture=armhf&channel=${Channel.FOCAL}&frameworks=ubuntu-sdk-20.04,ubuntu-sdk-16.04`,
      ).expect(200);
      assert.ok(res.body.success);
      assert.equal(res.body.data.packages.length, 2);
      assert.equal(res.body.data.count, 2);
      assert.equal(res.body.data.packages[0].id, package1.id);
      assert.equal(res.body.data.packages[1].id, package2.id);
    });

    test('gets apps for the supported frameworks', async () => {
      package1.device_compatibilities = [`${ChannelArchitecture.FOCAL_ARMHF}:ubuntu-sdk-20.04`];
      package2.device_compatibilities = [`${ChannelArchitecture.FOCAL_ARMHF}:ubuntu-sdk-16.04`];
      unpublishedPackage.device_compatibilities = [`${ChannelArchitecture.FOCAL_ARMHF}:ubuntu-sdk-20.04`];
      await Promise.all([
        package1.save(),
        package2.save(),
        unpublishedPackage.save(),
      ]);

      const res = await request(app).get(
        `${route}?architecture=armhf&channel=${Channel.FOCAL}&frameworks=ubuntu-sdk-20.04`,
      ).expect(200);
      assert.ok(res.body.success);
      assert.equal(res.body.data.packages.length, 1);
      assert.equal(res.body.data.count, 1);
      assert.equal(res.body.data.packages[0].id, package1.id);
    });
  });

  describe('GET app download', () => {
    let package3: TestPackage;

    beforeEach(async () => {
      package3 = await factory.package({
        id: 'app4',
        published: true,
        category: 'Utilities',
        channels: [DEFAULT_CHANNEL],
        revisions: [
          {
            revision: 1,
            version: '1',
            downloads: 10,
            channel: DEFAULT_CHANNEL,
            download_url: path.join(__dirname, '/../tests/fixtures/empty.click'),
            architecture: Architecture.ARMHF,
            framework: 'ubuntu-sdk-20.04',
            filesize: 100,
          },
          {
            revision: 2,
            version: '2',
            downloads: 10,
            channel: DEFAULT_CHANNEL,
            download_url: path.join(__dirname, '/../tests/fixtures/empty.click'),
            architecture: Architecture.ARMHF,
            framework: 'ubuntu-sdk-20.04',
            filesize: 100,
          },
        ],
      });
    });

    test('returns successfully', async () => {
      await request(app).get(`${route}${package3.id}/download/${DEFAULT_CHANNEL}/armhf`).expect(200);
    });

    test('throws a 404', async () => {
      const res = await request(app).get(`${route}somepackage/download/${DEFAULT_CHANNEL}/armhf`).expect(404);

      assert.equal(res.body.success, false);
      assert.equal(res.body.message, messages.APP_NOT_FOUND);
    });

    test('throws for an invalid channel', async () => {
      const res = await request(app).get(`${route}${package3.id}/download/vivid/armhf`).expect(400);

      assert.equal(res.body.success, false);
      assert.equal(res.body.message, messages.INVALID_CHANNEL);
    });

    test('does not throw for newer-unknown channels', async () => {
      await request(app).get(`${route}${package3.id}/download/nobel/armhf`).expect(200);
    });

    test('throws for an invalid arch', async () => {
      const res = await request(app).get(`${route}${package3.id}/download/${DEFAULT_CHANNEL}/invalid`).expect(400);

      assert.equal(res.body.success, false);
      assert.equal(res.body.message, messages.INVALID_ARCH);
    });

    test('throws for a download not found for unknown version', async () => {
      const res = await request(app).get(`${route}${package3.id}/download/${DEFAULT_CHANNEL}/armhf/3`).expect(404);

      assert.equal(res.body.success, false);
      assert.equal(res.body.message, messages.DOWNLOAD_NOT_FOUND_FOR_CHANNEL);
    });

    test('fails gracefully', async (t) => {
      const mockFindOneByFilters = t.mock.method(Package, 'findOneByFilters', () => { throw new Error(); });

      const res = await request(app).get(`${route}${package3.id}/download/${DEFAULT_CHANNEL}/armhf`).expect(500);

      assert.equal(res.body.success, false);
      assert.equal(mockFindOneByFilters.mock.callCount(), 1);
    });

    test('gets the download by version', async () => {
      await request(app).get(`${route}${package3.id}/download/${DEFAULT_CHANNEL}/armhf/2`).expect(200);
    });
  });
});
