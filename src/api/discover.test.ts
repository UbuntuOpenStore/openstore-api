import { test, describe, beforeEach, before, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { cleanMongoose, closeMongoose, waitForMongoose } from 'tests/utils';
import factory from 'tests/factory';
import * as api from 'api';
import { type App } from 'supertest/types';

import { Package } from 'db/package';
import { RatingCount } from 'db/rating_count';
import { Architecture, Channel, ChannelArchitecture, PackageType } from 'db/package/types';
import discoverJSON from './json/discover_apps.json';

describe('Discover API', () => {
  const route = '/api/v3/discover/';
  let app: App;

  before(async () => {
    await waitForMongoose();

    app = api.setup();
  });

  after(async () => {
    await closeMongoose();
  });

  beforeEach(async () => {
    await cleanMongoose();

    await Promise.all([
      factory.package({
        published: true,
        id: discoverJSON.highlights[0].id,
        architectures: [Architecture.ALL],
        channels: [Channel.FOCAL],
        channel_architectures: [ChannelArchitecture.FOCAL_ALL],
        device_compatibilities: [`${ChannelArchitecture.FOCAL_ALL}:ubuntu-sdk-20.04`],
        published_date: (new Date()).toISOString(),
        types: [PackageType.APP],
      }),
      factory.package({
        published: true,
        id: discoverJSON.categories[1].ids[0],
        architectures: [Architecture.ALL],
        channels: [Channel.FOCAL],
        channel_architectures: [ChannelArchitecture.FOCAL_ALL],
        device_compatibilities: [`${ChannelArchitecture.FOCAL_ALL}:ubuntu-sdk-20.04`],
        published_date: '2021-01-01T13:35:16.095Z',
        updated_date: '2021-01-01T13:35:16.095Z',
        types: [PackageType.APP],
      }),
      factory.package({
        published: true,
        id: discoverJSON.categories[1].ids[1],
        architectures: [Architecture.ALL],
        channels: [Channel.FOCAL],
        channel_architectures: [ChannelArchitecture.FOCAL_ALL],
        device_compatibilities: [`${ChannelArchitecture.FOCAL_ALL}:ubuntu-sdk-16.04`],
        published_date: '2021-01-01T13:35:16.095Z',
        updated_date: '2021-01-01T13:35:16.095Z',
        types: [PackageType.APP],
      }),
      factory.package({
        published: true,
        id: discoverJSON.categories[1].ids[2],
        architectures: [Architecture.ALL],
        channels: [Channel.FOCAL],
        channel_architectures: [ChannelArchitecture.FOCAL_ALL],
        device_compatibilities: [`${ChannelArchitecture.FOCAL_ALL}:ubuntu-sdk-16.04`],
        published_date: (new Date()).toISOString(),
        types: [PackageType.APP],
      }),
    ]);
  });

  test('returns a nice error', async (t) => {
    const mockFn = t.mock.method(Package, 'findByFilters', () => { throw new Error(); });

    const res = await request(app).get(route).expect(500);
    assert.equal(res.body.success, false);
    assert.equal(mockFn.mock.callCount(), 1);
  });

  test('returns data', async (t) => {
    const getCountsByIdsSpy = t.mock.method(RatingCount, 'getCountsByIds');

    const res = await request(app).get(route).expect(200);

    assert.ok(res.body.success);
    assert.ok(res.body.data.highlight);
    assert.ok(res.body.data.highlights.length > 0);
    assert.ok(res.body.data.categories.length > 0);
    assert.equal(res.body.data.categories[0].ids.length, 4); // Category 0 is the new/updated apps

    assert.equal(getCountsByIdsSpy.mock.callCount(), 0);

    // Cache hit
    const res2 = await request(app).get(route).expect(200);

    assert.ok(res2.body.success);
    assert.ok(res2.body.data.highlight);
    assert.ok(res2.body.data.highlights.length > 0);
    assert.ok(res2.body.data.categories.length > 0);
    assert.equal(res.body.data.categories[0].ids.length, 4); // Category 0 is the new/updated apps

    // Verify that ratings get refreshed on a cache hit
    assert.equal(getCountsByIdsSpy.mock.callCount(), 1);
  });

  test('returns data for the latest supported framework', async (t) => {
    const getCountsByIdsSpy = t.mock.method(RatingCount, 'getCountsByIds');

    const frameworkRoute = `${route}?channel=${Channel.FOCAL}&architecture=${Architecture.ARM64}&frameworks=ubuntu-sdk-16.04`;
    const res = await request(app).get(frameworkRoute).expect(200);

    assert.ok(res.body.success);
    assert.equal(res.body.data.categories[0].ids.length, 2); // Category 0 is the new/updated apps

    assert.equal(getCountsByIdsSpy.mock.callCount(), 0);

    // Cache hit
    const res2 = await request(app).get(frameworkRoute).expect(200);

    assert.ok(res2.body.success);
    assert.equal(res.body.data.categories[0].ids.length, 2); // Category 0 is the new/updated apps

    // Verify that ratings get refreshed on a cache hit
    assert.equal(getCountsByIdsSpy.mock.callCount(), 1);
  });

  test('returns data for the multiple supported framework', async (t) => {
    const getCountsByIdsSpy = t.mock.method(RatingCount, 'getCountsByIds');

    const frameworkRoute =
      `${route}?channel=${Channel.FOCAL}&architecture=${Architecture.ARM64}&frameworks=ubuntu-sdk-16.04,ubuntu-sdk-20.04`;
    const res = await request(app).get(frameworkRoute).expect(200);

    assert.ok(res.body.success);
    assert.equal(res.body.data.categories[0].ids.length, 4); // Category 0 is the new/updated apps

    assert.equal(getCountsByIdsSpy.mock.callCount(), 0);

    // Cache hit
    const res2 = await request(app).get(frameworkRoute).expect(200);

    assert.ok(res2.body.success);
    assert.equal(res.body.data.categories[0].ids.length, 4); // Category 0 is the new/updated apps

    // Verify that ratings get refreshed on a cache hit
    assert.equal(getCountsByIdsSpy.mock.callCount(), 1);
  });
});
