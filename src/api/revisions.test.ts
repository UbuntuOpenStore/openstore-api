import { test, describe, beforeEach, before, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { cleanMongoose, closeMongoose, waitForMongoose } from 'tests/utils';
import factory, { type TestPackage } from 'tests/factory';
import * as api from 'api';
import { type App } from 'supertest/types';

import { Package } from 'db/package';
import { Architecture, Channel, type HydratedRevision } from 'db/package/types';

describe('Revisions GET', () => {
  const route = '/api/v3/revisions';
  let app: App;
  let package1: TestPackage;

  const makeUrl = function ({ version = '1.0.0', id = package1.id, architecture = 'all', channel = 'xenial' } = {}) {
    return `${route}?apps=${id}@${version}&architecture=${architecture}&channel=${channel}`;
  };

  before(async () => {
    await waitForMongoose();

    app = api.setup();
  });

  after(async () => {
    await closeMongoose();
  });

  beforeEach(async () => {
    await cleanMongoose();

    package1 = await factory.package({
      published: true,
      architectures: [Architecture.ALL],
      revisions: [
        {
          revision: 1,
          version: '1.0.0',
          channel: Channel.XENIAL,
          architecture: Architecture.ALL,
          framework: 'ubuntu-sdk-16.04',
          download_url: 'url',
        },
        {
          revision: 2,
          version: '1.0.1',
          channel: Channel.XENIAL,
          architecture: Architecture.ALL,
          framework: 'ubuntu-sdk-16.04',
          download_url: 'url',
        },
        {
          revision: 3,
          version: '2.0.0',
          channel: Channel.XENIAL,
          architecture: Architecture.ALL,
          framework: 'ubuntu-sdk-16.04',
          download_url: 'url',
        },
      ],
    });
  });

  test('returns latest update for an app', async () => {
    const { body } = await request(app).get(makeUrl()).expect(200);

    assert.ok(body.success);
    assert.equal(body.data.length, 1);

    const data = body.data[0];
    assert.equal(data.id, package1.id);
    assert.equal(data.version, '1.0.0');
    assert.equal(data.revision, 1);
    assert.equal(data.latest_version, '2.0.0');
    assert.equal(data.latest_revision, 3);
    assert.ok(data.download_url);
  });

  test('returns latest update for an app that is "all" when requesting a different arch', async () => {
    const { body } = await request(app).get(makeUrl({ architecture: Architecture.ARMHF })).expect(200);

    assert.ok(body.success);
    assert.equal(body.data.length, 1);

    const data = body.data[0];
    assert.equal(data.id, package1.id);
    assert.equal(data.version, '1.0.0');
    assert.equal(data.revision, 1);
    assert.equal(data.latest_version, '2.0.0');
    assert.equal(data.latest_revision, 3);
    assert.ok(data.download_url);
  });

  test('returns latest update for a "sideloaded" app', async () => {
    const { body } = await request(app).get(makeUrl({ version: '2.0.1' })).expect(200);

    assert.ok(body.success);
    assert.equal(body.data.length, 1);

    const data = body.data[0];
    assert.equal(data.id, package1.id);
    assert.equal(data.version, '2.0.1');
    assert.equal(data.revision, 0);
    assert.equal(data.latest_version, '2.0.0');
    assert.equal(data.latest_revision, 3);
    assert.ok(data.download_url);
  });

  test('returns nothing for an app that is not in the OpenStore', async () => {
    const { body } = await request(app).get(makeUrl({ id: 'foo.bar' })).expect(200);

    assert.ok(body.success);
    assert.equal(body.data.length, 0);
  });

  test('returns nothing when the latest revision does not have a download_url', async () => {
    package1.revisions = package1.revisions.map((revision: HydratedRevision) => {
      return {
        ...revision.toObject(),
        download_url: null,
      };
    }) as any;
    await package1.save();

    const { body } = await request(app).get(makeUrl()).expect(200);

    assert.ok(body.success);
    assert.equal(body.data.length, 0);
  });

  test('returns nothing for a different arch', async () => {
    package1.revisions = package1.revisions.map((revision: HydratedRevision) => {
      return {
        ...revision.toObject(),
        architecture: Architecture.ARM64,
      };
    }) as any;
    package1.architectures = [Architecture.ARM64];
    await package1.save();

    const { body } = await request(app).get(makeUrl({ architecture: Architecture.ARMHF })).expect(200);

    assert.ok(body.success);
    assert.equal(body.data.length, 0);
  });

  test('returns the correct arch', async () => {
    package1.revisions = package1.revisions.map((revision: HydratedRevision) => {
      return {
        ...revision.toObject(),
        architecture: Architecture.ARM64,
      };
    }) as any;
    package1.revisions.push({
      revision: 4,
      version: '2.0.0',
      channel: Channel.XENIAL,
      architecture: Architecture.ARMHF,
      framework: 'ubuntu-sdk-16.04',
      download_url: 'url',
    });
    package1.architectures = [Architecture.ARM64, Architecture.ARMHF];
    await package1.save();

    const { body } = await request(app).get(makeUrl({ version: '2.0.0', architecture: Architecture.ARMHF })).expect(200);

    assert.ok(body.success);
    assert.equal(body.data.length, 1);

    const data = body.data[0];
    assert.equal(data.id, package1.id);
    assert.equal(data.version, '2.0.0');
    assert.equal(data.revision, 4);
    assert.equal(data.latest_version, '2.0.0');
    assert.equal(data.latest_revision, 4);
    assert.ok(data.download_url);
  });

  test('fails if the channel is missing or invalid', async () => {
    await request(app).get(makeUrl({ channel: 'foo', architecture: Architecture.ARMHF })).expect(400);
    await request(app).get(makeUrl({ channel: '', architecture: Architecture.ARMHF })).expect(400);
  });

  test('fails gracefully', async (t) => {
    const findMock = t.mock.method(Package, 'findByFilters', () => { throw new Error(); });

    const res = await request(app).get(makeUrl()).expect(500);

    assert.equal(res.body.success, false);
    assert.equal(findMock.mock.callCount(), 1);
  });

  test('gets the channel from the version', async () => {
    const url = `${route}?apps=${package1.id}@1.0.0@${Channel.XENIAL}&channel=${Channel.FOCAL}&architecture=${Architecture.ARMHF}`;
    const { body } = await request(app).get(url).expect(200);

    assert.ok(body.success);
    assert.equal(body.data.length, 1);

    const data = body.data[0];
    assert.equal(data.id, package1.id);
    assert.equal(data.version, '1.0.0');
    assert.equal(data.revision, 1);
    assert.equal(data.latest_version, '2.0.0');
    assert.equal(data.latest_revision, 3);
    assert.ok(data.download_url);
  });

  test('fails if arch is not specified or is invalid', async () => {
    package1.revisions = package1.revisions.map((revision: HydratedRevision) => {
      return {
        ...revision,
        architecture: Architecture.ARM64,
      };
    }) as any;
    package1.architectures = [Architecture.ARM64];
    await package1.save();

    await request(app).get(makeUrl({ channel: Channel.FOCAL, architecture: 'foo' })).expect(400);
    await request(app).get(makeUrl({ channel: Channel.FOCAL, architecture: '' })).expect(400);
  });

  test('returns the most recent for the given frameworks', async () => {
    package1.revisions[0].framework = 'ubuntu-sdk-15.04';
    package1.revisions[1].framework = 'ubuntu-sdk-15.04';
    await package1.save();

    const { body } = await request(app).get(`${makeUrl()}&frameworks=ubuntu-sdk-15.04`).expect(200);

    assert.ok(body.success);
    assert.equal(body.data.length, 1);
    assert.equal(body.data[0].latest_revision, 2);

    const { body: body2 } = await request(app).get(`${makeUrl()}&frameworks=ubuntu-sdk-15.04,ubuntu-sdk-16.04`).expect(200);

    assert.ok(body2.success);
    assert.equal(body2.data.length, 1);
    assert.equal(body2.data[0].latest_revision, 3);
  });

  test('returns nothing when the updates are different than the given framework', async () => {
    const { body } = await request(app).get(`${makeUrl()}&frameworks=ubuntu-sdk-15.04`).expect(200);

    assert.ok(body.success);
    assert.equal(body.data.length, 0);
  });
});
