import { test, describe, beforeEach, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { cleanMongoose, closeMongoose, waitForMongoose } from 'tests/utils';
import factory, { type TestPackage, type TestUser } from 'tests/factory';
import * as api from 'api';
import { type App } from 'supertest/types';

import path from 'path';
import { Package } from 'db/package';
import { Architecture, Channel } from 'db/package/types';
import { Lock } from 'db/lock';
import * as reviewPackage from 'utils/review-package';
import * as clickParser from 'utils/click-parser-async';
import { packageSearchInstance } from 'db/package/search';
import * as messages from 'utils/error-messages';

const GOOD_REVIEW = { manualReviewMessages: [], errorMessages: [], warningMessages: [] };
const MANUAL_REVIEW = {
  ...GOOD_REVIEW,
  manualReviewMessages: ["'unconfined' not allowed"],
};
const ERROR_REVIEW = {
  ...GOOD_REVIEW,
  errorMessages: ['Something is very wrong with your click file'],
};

describe('Manage Revision POST', () => {
  let route1: string;
  let route2: string;
  let app: App;
  let package1: TestPackage;
  let package2: TestPackage;
  let user: TestUser;
  const goodClick = path.join(__dirname, '../tests/fixtures/good.click');
  const good64Click = path.join(__dirname, '../tests/fixtures/good64.click');
  const emptyClick = path.join(__dirname, '../tests/fixtures/empty.click');
  const notAClick = path.join(__dirname, '../tests/fixtures/notaclick.txt');

  before(async () => {
    await waitForMongoose();

    app = api.setup();
  });

  after(async () => {
    await closeMongoose();
  });

  beforeEach(async () => {
    await cleanMongoose();

    user = await factory.user();
    [package1, package2] = await Promise.all([
      factory.package({
        maintainer: user._id,
        name: 'OpenStore Test',
        id: 'openstore-test.openstore-team',
      }),
      factory.package(),
    ]);

    route1 = `/api/v3/manage/${package1.id}/revision?apikey=${user.apikey}`;
    route2 = `/api/v3/manage/${package2.id}/revision?apikey=${user.apikey}`;
  });

  afterEach(async () => {
    await cleanMongoose();
  });

  test('blocks access when not logged in', async () => {
    await request(app).post(`/api/v3/manage/${package1.id}/revision`).expect(401);
  });

  describe('admin user', () => {
    beforeEach(async () => {
      user.role = 'admin';
      await user.save();
    });

    test('allows access to other packages', async (t) => {
      const lockAcquireSpy = t.mock.method(Lock, 'acquire');
      const lockReleaseSpy = t.mock.method(Lock, 'release');
      const reviewMock = t.mock.method(reviewPackage, 'clickReview', async () => GOOD_REVIEW);
      const parseMock = t.mock.method(clickParser, 'parseClickPackage', async () => ({
        name: package2.id,
        version: '1.0.0',
        architecture: 'armhf',
        apps: [],
        framework: 'ubuntu-sdk-20.04',
      }));

      const res = await request(app).post(route2)
        .attach('file', emptyClick)
        .field('channel', Channel.FOCAL)
        .expect(200);

      assert.ok(res.body.success);
      assert.equal(parseMock.mock.callCount(), 1);
      assert.equal(reviewMock.mock.callCount(), 1);
      assert.equal(lockAcquireSpy.mock.callCount(), 1);
      assert.equal(lockReleaseSpy.mock.callCount(), 1);
    });

    test('does not fail for manual review', async (t) => {
      const lockAcquireSpy = t.mock.method(Lock, 'acquire');
      const lockReleaseSpy = t.mock.method(Lock, 'release');
      const reviewMock = t.mock.method(reviewPackage, 'clickReview', async () => MANUAL_REVIEW);
      const parseMock = t.mock.method(clickParser, 'parseClickPackage', async () => ({
        name: package1.id,
        version: '1.0.0',
        architecture: 'armhf',
        apps: [],
        framework: 'ubuntu-sdk-20.04',
      }));

      const res = await request(app).post(route1)
        .attach('file', emptyClick)
        .field('channel', Channel.FOCAL)
        .expect(200);

      assert.ok(res.body.success);
      assert.equal(reviewMock.mock.callCount(), 1);
      assert.equal(parseMock.mock.callCount(), 1);
      assert.equal(lockAcquireSpy.mock.callCount(), 1);
      assert.equal(lockReleaseSpy.mock.callCount(), 1);
    });

    test('skips review if configured', async (t) => {
      const lockAcquireSpy = t.mock.method(Lock, 'acquire');
      const lockReleaseSpy = t.mock.method(Lock, 'release');
      package1.skip_review = true;
      await package1.save();

      const reviewSpy = t.mock.method(reviewPackage, 'clickReview');
      const parseMock = t.mock.method(clickParser, 'parseClickPackage', async () => ({
        name: package1.id,
        version: '1.0.0',
        architecture: 'armhf',
        apps: [],
        framework: 'ubuntu-sdk-20.04',
      }));

      const res = await request(app).post(route1)
        .attach('file', emptyClick)
        .field('channel', Channel.FOCAL)
        .expect(200);

      assert.ok(res.body.success);
      assert.equal(reviewSpy.mock.callCount(), 0);
      assert.equal(parseMock.mock.callCount(), 1);
      assert.equal(lockAcquireSpy.mock.callCount(), 1);
      assert.equal(lockReleaseSpy.mock.callCount(), 1);
    });
  });

  describe('trusted user', () => {
    beforeEach(async () => {
      user.role = 'trusted';
      await user.save();
    });

    test('does not fail for manual review', async (t) => {
      const lockAcquireSpy = t.mock.method(Lock, 'acquire');
      const lockReleaseSpy = t.mock.method(Lock, 'release');
      const reviewMock = t.mock.method(reviewPackage, 'clickReview', async () => MANUAL_REVIEW);
      const parseMock = t.mock.method(clickParser, 'parseClickPackage', async () => ({
        name: package1.id,
        version: '1.0.0',
        architecture: 'armhf',
        apps: [],
        framework: 'ubuntu-sdk-20.04',
      }));

      const res = await request(app).post(route1)
        .attach('file', emptyClick)
        .field('channel', Channel.FOCAL)
        .expect(200);

      assert.ok(res.body.success);
      assert.equal(reviewMock.mock.callCount(), 1);
      assert.equal(parseMock.mock.callCount(), 1);
      assert.equal(lockAcquireSpy.mock.callCount(), 1);
      assert.equal(lockReleaseSpy.mock.callCount(), 1);
    });
  });

  describe('community user', () => {
    beforeEach(async () => {
      user.role = 'community';
      await user.save();
    });

    test('fails with no file', async (t) => {
      const lockAcquireSpy = t.mock.method(Lock, 'acquire');
      const lockReleaseSpy = t.mock.method(Lock, 'release');

      const res = await request(app).post(route1)
        .expect(400);

      assert.equal(res.body.message, messages.NO_FILE);
      assert.equal(lockAcquireSpy.mock.callCount(), 0);
      assert.equal(lockReleaseSpy.mock.callCount(), 0);
    });

    test('fails with invalid channel', async (t) => {
      const lockAcquireSpy = t.mock.method(Lock, 'acquire');
      const lockReleaseSpy = t.mock.method(Lock, 'release');

      const res = await request(app).post(route1)
        .attach('file', emptyClick)
        .field('channel', 'vivid')
        .expect(400);

      assert.equal(res.body.message, messages.INVALID_CHANNEL);
      assert.equal(lockAcquireSpy.mock.callCount(), 0);
      assert.equal(lockReleaseSpy.mock.callCount(), 0);
    });

    test('fails with invalid channel (deprecated channel)', async (t) => {
      const lockAcquireSpy = t.mock.method(Lock, 'acquire');
      const lockReleaseSpy = t.mock.method(Lock, 'release');

      const res = await request(app).post(route1)
        .attach('file', emptyClick)
        .field('channel', 'xenial')
        .expect(400);

      assert.equal(res.body.message, messages.INVALID_CHANNEL);
      assert.equal(lockAcquireSpy.mock.callCount(), 0);
      assert.equal(lockReleaseSpy.mock.callCount(), 0);
    });

    test('fails with bad id', async (t) => {
      const lockAcquireSpy = t.mock.method(Lock, 'acquire');
      const lockReleaseSpy = t.mock.method(Lock, 'release');

      const res = await request(app).post(`/api/v3/manage/foo/revision?apikey=${user.apikey}`)
        .attach('file', emptyClick)
        .field('channel', Channel.FOCAL)
        .expect(404);

      assert.equal(res.body.message, messages.APP_NOT_FOUND);
      assert.equal(lockAcquireSpy.mock.callCount(), 1);
      assert.equal(lockReleaseSpy.mock.callCount(), 1);
    });

    test('does not allow access to other packages', async (t) => {
      const lockAcquireSpy = t.mock.method(Lock, 'acquire');
      const lockReleaseSpy = t.mock.method(Lock, 'release');

      await request(app).post(route2)
        .attach('file', emptyClick)
        .field('channel', Channel.FOCAL)
        .expect(403);

      assert.equal(lockAcquireSpy.mock.callCount(), 1);
      assert.equal(lockReleaseSpy.mock.callCount(), 1);
    });

    test('needs manual review', async (t) => {
      const lockAcquireSpy = t.mock.method(Lock, 'acquire');
      const lockReleaseSpy = t.mock.method(Lock, 'release');

      const reviewMock = t.mock.method(reviewPackage, 'clickReview', async () => MANUAL_REVIEW);

      const res = await request(app).post(route1)
        .attach('file', emptyClick)
        .field('channel', Channel.FOCAL)
        .expect(400);

      assert.equal(res.body.success, false);
      assert.equal(res.body.message, messages.NEEDS_MANUAL_REVIEW);
      assert.equal(res.body.data?.reasons.length, MANUAL_REVIEW.manualReviewMessages.length);
      assert.equal(res.body.data?.reasons[0], MANUAL_REVIEW.manualReviewMessages[0]);
      assert.equal(reviewMock.mock.callCount(), 1);
      assert.equal(lockAcquireSpy.mock.callCount(), 1);
      assert.equal(lockReleaseSpy.mock.callCount(), 1);
    });

    test('fail review because of other errors', async (t) => {
      const lockAcquireSpy = t.mock.method(Lock, 'acquire');
      const lockReleaseSpy = t.mock.method(Lock, 'release');

      const reviewMock = t.mock.method(reviewPackage, 'clickReview', async () => ERROR_REVIEW);

      const res = await request(app).post(route1)
        .attach('file', emptyClick)
        .field('channel', Channel.FOCAL)
        .expect(400);

      assert.equal(res.body.success, false);
      assert.equal(res.body.message, messages.CLICK_REVIEW_ERROR);
      assert.equal(res.body.data?.reasons.length, ERROR_REVIEW.errorMessages.length);
      assert.equal(res.body.data?.reasons[0], ERROR_REVIEW.errorMessages[0]);
      assert.equal(reviewMock.mock.callCount(), 1);
      assert.equal(lockAcquireSpy.mock.callCount(), 1);
      assert.equal(lockReleaseSpy.mock.callCount(), 1);
    });

    test('fails if not a click', async (t) => {
      const lockAcquireSpy = t.mock.method(Lock, 'acquire');
      const lockReleaseSpy = t.mock.method(Lock, 'release');

      const res = await request(app).post(route1)
        .attach('file', notAClick)
        .field('channel', Channel.FOCAL)
        .expect(400);

      assert.equal(res.body.success, false);
      assert.equal(res.body.message, messages.BAD_FILE);
      assert.equal(lockAcquireSpy.mock.callCount(), 1);
      assert.equal(lockReleaseSpy.mock.callCount(), 1);
    });

    test('fails with a different package id from file', async (t) => {
      const lockAcquireSpy = t.mock.method(Lock, 'acquire');
      const lockReleaseSpy = t.mock.method(Lock, 'release');

      const reviewMock = t.mock.method(reviewPackage, 'clickReview', async () => GOOD_REVIEW);
      const parseMock = t.mock.method(clickParser, 'parseClickPackage', async () => ({
        name: 'foo',
        version: '1.0.0',
        architecture: 'armhf',
        framework: 'ubuntu-sdk-20.04',
      }));

      const res = await request(app).post(route1)
        .attach('file', emptyClick)
        .field('channel', Channel.FOCAL)
        .expect(400);

      assert.equal(res.body.success, false);
      assert.equal(res.body.message, messages.WRONG_PACKAGE);
      assert.equal(reviewMock.mock.callCount(), 1);
      assert.equal(parseMock.mock.callCount(), 1);
      assert.equal(lockAcquireSpy.mock.callCount(), 1);
      assert.equal(lockReleaseSpy.mock.callCount(), 1);
    });

    test('fails with a malformed manifest', async (t) => {
      const lockAcquireSpy = t.mock.method(Lock, 'acquire');
      const lockReleaseSpy = t.mock.method(Lock, 'release');

      const reviewMock = t.mock.method(reviewPackage, 'clickReview', async () => GOOD_REVIEW);
      const parseMock = t.mock.method(clickParser, 'parseClickPackage', async () => ({}));

      const res = await request(app).post(route1)
        .attach('file', emptyClick)
        .field('channel', Channel.FOCAL)
        .expect(400);

      assert.equal(res.body.success, false);
      assert.equal(res.body.message, messages.MALFORMED_MANIFEST);
      assert.equal(reviewMock.mock.callCount(), 1);
      assert.equal(parseMock.mock.callCount(), 1);
      assert.equal(lockAcquireSpy.mock.callCount(), 1);
      assert.equal(lockReleaseSpy.mock.callCount(), 1);
    });

    test('fails with an existing version of the same arch', async (t) => {
      const lockAcquireSpy = t.mock.method(Lock, 'acquire');
      const lockReleaseSpy = t.mock.method(Lock, 'release');

      package1.createNextRevision('1.0.0', Channel.FOCAL, Architecture.ARMHF, 'ubuntu-sdk-20.04', 'url', 'shasum', 10, 8);
      await package1.save();

      const reviewMock = t.mock.method(reviewPackage, 'clickReview', async () => GOOD_REVIEW);
      const parseMock = t.mock.method(clickParser, 'parseClickPackage', async () => ({
        name: package1.id,
        version: '1.0.0',
        architecture: Architecture.ARMHF,
        framework: 'ubuntu-sdk-20.04',
        apps: [],
      }));

      const res = await request(app).post(route1)
        .attach('file', emptyClick)
        .field('channel', Channel.FOCAL)
        .expect(400);

      assert.equal(res.body.success, false);
      assert.equal(res.body.message, messages.EXISTING_VERSION);
      assert.equal(reviewMock.mock.callCount(), 1);
      assert.equal(parseMock.mock.callCount(), 1);
      assert.equal(lockAcquireSpy.mock.callCount(), 1);
      assert.equal(lockReleaseSpy.mock.callCount(), 1);
    });

    test('does not fail with an existing version of a different arch', async (t) => {
      const lockAcquireSpy = t.mock.method(Lock, 'acquire');
      const lockReleaseSpy = t.mock.method(Lock, 'release');

      package1.createNextRevision('1.0.0', Channel.FOCAL, Architecture.ARM64, 'ubuntu-sdk-20.04', 'url', 'shasum', 10, 8);
      package1.architectures = [Architecture.ARM64];
      await package1.save();

      const reviewMock = t.mock.method(reviewPackage, 'clickReview', async () => GOOD_REVIEW);
      const parseMock = t.mock.method(clickParser, 'parseClickPackage', async () => ({
        name: package1.id,
        version: '1.0.0',
        architecture: Architecture.ARMHF,
        framework: 'ubuntu-sdk-20.04',
        apps: [],
      }));

      const res = await request(app).post(route1)
        .attach('file', emptyClick)
        .field('channel', Channel.FOCAL)
        .expect(200);

      const data = res.body.data;
      assert.ok(res.body.success);
      assert.equal(data.revisions.length, 2);
      assert.equal(
        data.revisions[1].revision,
        package1.generateRevisionCode('1.0.0', Channel.FOCAL, Architecture.ARMHF, 'ubuntu-sdk-20.04'),
      );
      assert.equal(data.revisions[1].version, '1.0.0');
      assert.equal(data.revisions[1].channel, Channel.FOCAL);
      assert.equal(data.revisions[1].architecture, Architecture.ARMHF);
      assert.equal(data.revisions[1].framework, 'ubuntu-sdk-20.04');
      assert.equal(data.architectures.length, 2);
      assert.ok(data.architectures.includes(Architecture.ARMHF));
      assert.ok(data.architectures.includes(Architecture.ARM64));
      assert.equal(reviewMock.mock.callCount(), 1);
      assert.equal(parseMock.mock.callCount(), 1);
      assert.equal(lockAcquireSpy.mock.callCount(), 1);
      assert.equal(lockReleaseSpy.mock.callCount(), 1);
    });

    test('fails when uploading all with existing armhf', async (t) => {
      const lockAcquireSpy = t.mock.method(Lock, 'acquire');
      const lockReleaseSpy = t.mock.method(Lock, 'release');

      package1.createNextRevision('1.0.0', Channel.FOCAL, Architecture.ARMHF, 'ubuntu-sdk-20.04', 'url', 'shasum', 10, 8);
      await package1.save();

      const reviewMock = t.mock.method(reviewPackage, 'clickReview', async () => GOOD_REVIEW);
      const parseMock = t.mock.method(clickParser, 'parseClickPackage', async () => ({
        name: package1.id,
        version: '1.0.0',
        architecture: Architecture.ALL,
        framework: 'ubuntu-sdk-20.04',
        apps: [],
      }));

      const res = await request(app).post(route1)
        .attach('file', emptyClick)
        .field('channel', Channel.FOCAL)
        .expect(400);

      assert.equal(res.body.success, false);
      assert.equal(res.body.message,
        'You cannot upload a click with the architecture "all" for the same version as an architecture specific click',
      );
      assert.equal(reviewMock.mock.callCount(), 1);
      assert.equal(parseMock.mock.callCount(), 1);
      assert.equal(lockAcquireSpy.mock.callCount(), 1);
      assert.equal(lockReleaseSpy.mock.callCount(), 1);
    });

    test('fails when uploading armhf with existing all', async (t) => {
      const lockAcquireSpy = t.mock.method(Lock, 'acquire');
      const lockReleaseSpy = t.mock.method(Lock, 'release');

      package1.createNextRevision('1.0.0', Channel.FOCAL, Architecture.ALL, 'ubuntu-sdk-20.04', 'url', 'shasum', 10, 8);
      await package1.save();

      const reviewMock = t.mock.method(reviewPackage, 'clickReview', async () => GOOD_REVIEW);
      const parseMock = t.mock.method(clickParser, 'parseClickPackage', async () => ({
        name: package1.id,
        version: '1.0.0',
        architecture: Architecture.ARMHF,
        framework: 'ubuntu-sdk-20.04',
        apps: [],
      }));

      const res = await request(app).post(route1)
        .attach('file', emptyClick)
        .field('channel', Channel.FOCAL)
        .expect(400);

      assert.equal(res.body.success, false);
      assert.equal(res.body.message,
        'You cannot upload and architecture specific click for the same version as a click with the architecture "all"',
      );
      assert.equal(reviewMock.mock.callCount(), 1);
      assert.equal(parseMock.mock.callCount(), 1);
      assert.equal(lockAcquireSpy.mock.callCount(), 1);
      assert.equal(lockReleaseSpy.mock.callCount(), 1);
    });

    test('fails when the same version but different arch and framework', async (t) => {
      const lockAcquireSpy = t.mock.method(Lock, 'acquire');
      const lockReleaseSpy = t.mock.method(Lock, 'release');

      package1.createNextRevision('1.0.0', Channel.FOCAL, Architecture.ARM64, 'ubuntu-sdk-20.04', 'url', 'shasum', 10, 8);
      await package1.save();

      const reviewMock = t.mock.method(reviewPackage, 'clickReview', async () => GOOD_REVIEW);
      const parseMock = t.mock.method(clickParser, 'parseClickPackage', async () => ({
        name: package1.id,
        version: '1.0.0',
        architecture: Architecture.ARMHF,
        framework: 'ubuntu-sdk-15.04',
        apps: [],
      }));

      const res = await request(app).post(route1)
        .attach('file', emptyClick)
        .field('channel', Channel.FOCAL)
        .expect(400);

      assert.equal(res.body.success, false);
      assert.equal(res.body.message, messages.MISMATCHED_FRAMEWORK);
      assert.equal(reviewMock.mock.callCount(), 1);
      assert.equal(parseMock.mock.callCount(), 1);
      assert.equal(lockAcquireSpy.mock.callCount(), 1);
      assert.equal(lockReleaseSpy.mock.callCount(), 1);
    });

    test('fails when the same version but different arch and permissions', async (t) => {
      const lockAcquireSpy = t.mock.method(Lock, 'acquire');
      const lockReleaseSpy = t.mock.method(Lock, 'release');

      package1.createNextRevision(
        '1.0.0',
        Channel.FOCAL,
        Architecture.ARM64,
        'ubuntu-sdk-20.04',
        'url',
        'shasum',
        10,
        8,
        ['permission1', 'permission2'],
      );
      await package1.save();

      const reviewMock = t.mock.method(reviewPackage, 'clickReview', async () => GOOD_REVIEW);
      const parseMock = t.mock.method(clickParser, 'parseClickPackage', async () => ({
        name: package1.id,
        version: '1.0.0',
        architecture: Architecture.ARMHF,
        framework: 'ubuntu-sdk-20.04',
        apps: [],
        permissions: ['permission1', 'permission3'],
      }));

      const res = await request(app).post(route1)
        .attach('file', emptyClick)
        .field('channel', Channel.FOCAL)
        .expect(400);

      assert.equal(res.body.success, false);
      assert.equal(res.body.message, messages.MISMATCHED_PERMISSIONS);
      assert.equal(reviewMock.mock.callCount(), 1);
      assert.equal(parseMock.mock.callCount(), 1);
      assert.equal(lockAcquireSpy.mock.callCount(), 1);
      assert.equal(lockReleaseSpy.mock.callCount(), 1);
    });

    test('passes when the same version but different framework and channel', async (t) => {
      const lockAcquireSpy = t.mock.method(Lock, 'acquire');
      const lockReleaseSpy = t.mock.method(Lock, 'release');

      package1.createNextRevision(
        '1.0.0',
        Channel.XENIAL,
        Architecture.ARM64,
        'ubuntu-sdk-20.04',
        'url',
        'shasum',
        10,
        8,
        ['permission1', 'permission2'],
      );
      await package1.save();

      const reviewMock = t.mock.method(reviewPackage, 'clickReview', async () => GOOD_REVIEW);
      const parseMock = t.mock.method(clickParser, 'parseClickPackage', async () => ({
        name: package1.id,
        version: '1.0.0',
        architecture: Architecture.ARM64,
        framework: 'ubuntu-sdk-20.04',
        apps: [],
        permissions: ['permission1', 'permission2'],
      }));

      const res = await request(app).post(route1)
        .attach('file', emptyClick)
        .field('channel', Channel.FOCAL)
        .expect(200);

      assert.ok(res.body.success);
      assert.equal(reviewMock.mock.callCount(), 1);
      assert.equal(parseMock.mock.callCount(), 1);
      assert.equal(lockAcquireSpy.mock.callCount(), 1);
      assert.equal(lockReleaseSpy.mock.callCount(), 1);
    });

    test('passes when the same version but different framework and channel (existing version does not have permissions)', async (t) => {
      const lockAcquireSpy = t.mock.method(Lock, 'acquire');
      const lockReleaseSpy = t.mock.method(Lock, 'release');

      package1.createNextRevision(
        '1.0.0',
        Channel.XENIAL,
        Architecture.ARM64,
        'ubuntu-sdk-20.04',
        'url',
        'shasum',
        10,
        8,
        [],
      );
      await package1.save();

      const reviewMock = t.mock.method(reviewPackage, 'clickReview', async () => GOOD_REVIEW);
      const parseMock = t.mock.method(clickParser, 'parseClickPackage', async () => ({
        name: package1.id,
        version: '1.0.0',
        architecture: Architecture.ARM64,
        framework: 'ubuntu-sdk-20.04',
        apps: [],
        permissions: ['permission1', 'permission2'],
      }));

      const res = await request(app).post(route1)
        .attach('file', emptyClick)
        .field('channel', Channel.FOCAL)
        .expect(200);

      assert.ok(res.body.success);
      assert.equal(reviewMock.mock.callCount(), 1);
      assert.equal(parseMock.mock.callCount(), 1);
      assert.equal(lockAcquireSpy.mock.callCount(), 1);
      assert.equal(lockReleaseSpy.mock.callCount(), 1);
    });

    test('fails when the app is locked', async (t) => {
      const lockAcquireSpy = t.mock.method(Lock, 'acquire');
      const lockReleaseSpy = t.mock.method(Lock, 'release');

      package1.locked = true;
      await package1.save();

      const res = await request(app).post(route1)
        .attach('file', emptyClick)
        .field('channel', Channel.FOCAL)
        .expect(403);

      assert.equal(res.body.success, false);
      assert.equal(res.body.message, messages.APP_LOCKED);
      assert.equal(lockAcquireSpy.mock.callCount(), 1);
      assert.equal(lockReleaseSpy.mock.callCount(), 1);
    });

    test('sanitizes and updates the changelog', async (t) => {
      const lockAcquireSpy = t.mock.method(Lock, 'acquire');
      const lockReleaseSpy = t.mock.method(Lock, 'release');

      package1.changelog = 'old changelog';
      await package1.save();

      const reviewMock = t.mock.method(reviewPackage, 'clickReview', async () => GOOD_REVIEW);
      const parseMock = t.mock.method(clickParser, 'parseClickPackage', async () => ({
        name: package1.id,
        version: '1.0.0',
        architecture: 'armhf',
        apps: [],
        framework: 'ubuntu-sdk-20.04',
      }));

      const res = await request(app).post(route1)
        .attach('file', emptyClick)
        .field('channel', Channel.FOCAL)
        .field('changelog', '<script></script> changelog update')
        .expect(200);

      assert.ok(res.body.success);
      assert.equal(reviewMock.mock.callCount(), 1);
      assert.equal(parseMock.mock.callCount(), 1);
      assert.equal(lockAcquireSpy.mock.callCount(), 1);
      assert.equal(lockReleaseSpy.mock.callCount(), 1);

      const pkg = await Package.findOneByFilters(package1.id);
      assert.equal(pkg?.changelog, 'changelog update\n\nold changelog');
    });

    test('successfully reviews/updates/saves a package and icon and updates elasticsearch', async (t) => {
      const lockAcquireSpy = t.mock.method(Lock, 'acquire');
      const lockReleaseSpy = t.mock.method(Lock, 'release');

      package1.published = true;
      package1.createNextRevision('0.0.1', Channel.FOCAL, Architecture.ARMHF, 'ubuntu-sdk-20.04', 'url', 'shasum', 10, 8);
      await package1.save();

      const reviewMock = t.mock.method(reviewPackage, 'clickReview', async () => GOOD_REVIEW);

      // TODO setup elastic search for testing in CI
      const mockSearchMethod = (process.env.NODE_ENV === 'ci' ? () => { } : undefined) as any;
      const usertSpy = t.mock.method(packageSearchInstance, 'upsert', mockSearchMethod);

      const res = await request(app).post(route1)
        .attach('file', goodClick)
        .field('channel', Channel.FOCAL)
        .expect(200);

      const data = res.body.data;

      assert.deepEqual(data.architectures, [Architecture.ARMHF]);
      assert.notEqual(data.author, 'OpenStore Team'); // The click no longer updates the author name
      assert.deepEqual(data.channels, [Channel.FOCAL]);
      assert.equal(data.icon, 'http://local.open-store.io/icons/openstore-test.openstore-team/openstore-test.openstore-team-1.0.0.svg');
      assert.ok(data.published);
      assert.ok(data.manifest);
      assert.equal(data.tagline, 'OpenStore test app');
      assert.equal(data.version, '1.0.0');
      assert.deepEqual(data.types, ['app']);
      assert.equal(data.revisions.length, 2);
      assert.equal(
        data.revisions[1].revision,
        package1.generateRevisionCode('1.0.0', Channel.FOCAL, Architecture.ARMHF, 'ubuntu-sdk-20.04.1'),
      );
      assert.equal(data.revisions[1].version, '1.0.0');
      assert.equal(data.revisions[1].channel, Channel.FOCAL);
      assert.equal(data.revisions[1].architecture, Architecture.ARMHF);
      assert.equal(data.revisions[1].framework, 'ubuntu-sdk-20.04.1');

      assert.equal(reviewMock.mock.callCount(), 1);
      assert.equal(usertSpy.mock.callCount(), 1);
      assert.equal(lockAcquireSpy.mock.callCount(), 1);
      assert.equal(lockReleaseSpy.mock.callCount(), 1);
    });

    test('fails gracefully', async (t) => {
      const lockAcquireSpy = t.mock.method(Lock, 'acquire');
      const lockReleaseSpy = t.mock.method(Lock, 'release');

      const findSpy = t.mock.method(Package, 'findOneByFilters', () => { throw new Error(); });

      const res = await request(app).post(route1)
        .attach('file', emptyClick)
        .field('channel', Channel.FOCAL)
        .expect(500);

      assert.equal(res.body.success, false);
      assert.equal(findSpy.mock.callCount(), 1);
      assert.equal(lockAcquireSpy.mock.callCount(), 1);
      assert.equal(lockReleaseSpy.mock.callCount(), 1);
    });

    test('sets the arch to "all" only when switching to a new version (from "arm64")', async (t) => {
      const lockAcquireSpy = t.mock.method(Lock, 'acquire');
      const lockReleaseSpy = t.mock.method(Lock, 'release');

      package1.createNextRevision('1.0.0', Channel.FOCAL, Architecture.ARM64, 'ubuntu-sdk-20.04', 'url', 'shasum', 10, 8);
      package1.architectures = [Architecture.ARM64];
      await package1.save();

      const reviewMock = t.mock.method(reviewPackage, 'clickReview', async () => GOOD_REVIEW);
      const parseMock = t.mock.method(clickParser, 'parseClickPackage', async () => ({
        name: package1.id,
        version: '2.0.0',
        architecture: Architecture.ALL,
        framework: 'ubuntu-sdk-20.04',
        apps: [],
      }));

      const res = await request(app).post(route1)
        .attach('file', emptyClick)
        .field('channel', Channel.FOCAL)
        .expect(200);

      const data = res.body.data;
      assert.ok(res.body.success);
      assert.equal(data.revisions.length, 2);
      assert.equal(data.architectures.length, 1);
      assert.equal(data.architectures[0], Architecture.ALL);
      assert.equal(data.downloads.length, 1);
      assert.equal(data.downloads[0].architecture, Architecture.ALL);
      assert.equal(reviewMock.mock.callCount(), 1);
      assert.equal(parseMock.mock.callCount(), 1);
      assert.equal(lockAcquireSpy.mock.callCount(), 1);
      assert.equal(lockReleaseSpy.mock.callCount(), 1);
    });

    test('sets the arch to "armhf" only when switching to a new version (from "all")', async (t) => {
      const lockAcquireSpy = t.mock.method(Lock, 'acquire');
      const lockReleaseSpy = t.mock.method(Lock, 'release');

      package1.createNextRevision('1.0.0', Channel.FOCAL, Architecture.ALL, 'ubuntu-sdk-20.04', 'url', 'shasum', 10, 8);
      package1.architectures = [Architecture.ALL];
      await package1.save();

      const reviewMock = t.mock.method(reviewPackage, 'clickReview', async () => GOOD_REVIEW);
      const parseMock = t.mock.method(clickParser, 'parseClickPackage', async () => ({
        name: package1.id,
        version: '2.0.0',
        architecture: Architecture.ARMHF,
        framework: 'ubuntu-sdk-20.04',
        apps: [],
      }));

      const res = await request(app).post(route1)
        .attach('file', emptyClick)
        .field('channel', Channel.FOCAL)
        .expect(200);

      const data = res.body.data;
      assert.ok(res.body.success);
      assert.equal(data.revisions.length, 2);
      assert.equal(data.architectures.length, 1);
      assert.equal(data.architectures[0], Architecture.ARMHF);
      assert.equal(data.downloads.length, 1);
      assert.equal(data.downloads[0].architecture, Architecture.ARMHF);
      assert.equal(reviewMock.mock.callCount(), 1);
      assert.equal(parseMock.mock.callCount(), 1);
      assert.equal(lockAcquireSpy.mock.callCount(), 1);
      assert.equal(lockReleaseSpy.mock.callCount(), 1);
    });

    test('does not skip review for a non-admin user', async (t) => {
      const lockAcquireSpy = t.mock.method(Lock, 'acquire');
      const lockReleaseSpy = t.mock.method(Lock, 'release');

      package1.skip_review = true;
      package1.save();

      const reviewMock = t.mock.method(reviewPackage, 'clickReview', async () => GOOD_REVIEW);
      const parseMock = t.mock.method(clickParser, 'parseClickPackage', async () => ({
        name: package1.id,
        version: '1.0.0',
        architecture: 'armhf',
        apps: [],
        framework: 'ubuntu-sdk-20.04',
      }));

      const res = await request(app).post(route1)
        .attach('file', emptyClick)
        .field('channel', Channel.FOCAL)
        .expect(200);

      assert.ok(res.body.success);
      assert.equal(reviewMock.mock.callCount(), 1);
      assert.equal(parseMock.mock.callCount(), 1);
      assert.equal(lockAcquireSpy.mock.callCount(), 1);
      assert.equal(lockReleaseSpy.mock.callCount(), 1);
    });
  });

  describe('locks', () => {
    test('waits for a lock', async (t) => {
      const lockAcquireSpy = t.mock.method(Lock, 'acquire');
      const lockReleaseSpy = t.mock.method(Lock, 'release');

      const now = Date.now();
      const lock = new Lock({
        name: `revision-${package1.id}`,
        expire: now + (1 * 1000), // 1 second in the future
        inserted: now,
      });
      await lock.save();

      const saveSpy = t.mock.method(Lock.prototype, 'save');
      const reviewMock = t.mock.method(reviewPackage, 'clickReview', async () => GOOD_REVIEW);
      const parseMock = t.mock.method(clickParser, 'parseClickPackage', async () => ({
        name: package1.id,
        version: '1.0.0',
        architecture: 'armhf',
        apps: [],
        framework: 'ubuntu-sdk-20.04',
      }));

      const res = await request(app).post(route1)
        .attach('file', emptyClick)
        .field('channel', Channel.FOCAL)
        .field('changelog', '<script></script> changelog update')
        .expect(200);

      assert.ok(res.body.success);
      assert.equal(parseMock.mock.callCount(), 1);
      assert.equal(reviewMock.mock.callCount(), 1);
      assert.equal(lockAcquireSpy.mock.callCount(), 1);
      assert.equal(lockReleaseSpy.mock.callCount(), 1);

      // Should attempt to save the new lock multiple times
      assert.ok(saveSpy.mock.callCount() > 1);
    });

    test('does not clobber existing data', async (t) => {
      const lockAcquireSpy = t.mock.method(Lock, 'acquire');
      const lockReleaseSpy = t.mock.method(Lock, 'release');

      const armhfRevision = request(app).post(route1)
        .attach('file', goodClick)
        .field('channel', Channel.FOCAL)
        .expect(200);

      const arm64Revision = request(app).post(route1)
        .attach('file', good64Click)
        .field('channel', Channel.FOCAL)
        .expect(200);

      const [arm64Res] = await Promise.all([arm64Revision, armhfRevision]);

      const data = arm64Res.body.data;
      assert.equal(data.revisions.length, 2);
      assert.equal(data.revisions[0].architecture, Architecture.ARMHF);
      assert.equal(data.revisions[1].architecture, Architecture.ARM64);

      assert.equal(lockAcquireSpy.mock.callCount(), 2);
      assert.equal(lockReleaseSpy.mock.callCount(), 2);
    });
  });
});
