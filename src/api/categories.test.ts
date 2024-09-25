import { test, describe, beforeEach, before, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { cleanMongoose, closeMongoose, waitForMongoose } from 'tests/utils';
import factory from 'tests/factory';
import * as api from 'api';
import { type App } from 'supertest/types';

import { Package } from 'db/package';
import { DEFAULT_CHANNEL } from 'db/package/types';
import categoryIcons from './json/category_icons.json';

describe('Categories API', () => {
  const route = '/api/v3/categories/';
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
      factory.package({ published: true, category: 'Utilities', channels: [DEFAULT_CHANNEL] }),
      factory.package({ published: true, category: 'Utilities', channels: [DEFAULT_CHANNEL] }),
      factory.package({ published: true, category: 'Games', channels: [DEFAULT_CHANNEL] }),
    ]);
  });

  test('returns only categories that have apps in them', async () => {
    const res = await request(app).get(route).expect(200);

    assert.ok(res.body.success);
    assert.equal(res.body.data.length, 2);
    assert.equal(res.body.data[0].category, 'Games');
    assert.equal(res.body.data[0].count, 1);
    assert.equal(res.body.data[1].category, 'Utilities');
    assert.equal(res.body.data[1].count, 2);
  });

  test('returns all categories', async () => {
    const res = await request(app).get(`${route}?all=true`).expect(200);

    assert.ok(res.body.success);
    assert.equal(res.body.data.length, Object.keys(categoryIcons).length);
  });

  test('throws a nice error', async (t) => {
    const categoryStatsMock = t.mock.method(Package, 'categoryStats', () => { throw new Error(); });

    const res = await request(app).get(route).expect(500);
    assert.equal(res.body.success, false);
    assert.equal(categoryStatsMock.mock.callCount(), 1);
  });

  test('handles invalid channels', async () => {
    const res = await request(app).get(`${route}?channel=invalid`).expect(200);

    assert.ok(res.body.success);
    assert.equal(res.body.data.length, 2);
  });

  test('handles languages channels', async () => {
    const res = await request(app).get(`${route}?lang=de`).expect(200);

    assert.ok(res.body.success);
    assert.equal(res.body.data.length, 2);
  });
});
