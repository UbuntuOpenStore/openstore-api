import { test, describe, beforeEach, before, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { cleanMongoose, closeMongoose, waitForMongoose } from 'tests/utils';
import factory, { type TestUser, type TestPackage } from 'tests/factory';
import * as api from 'api';
import { type App } from 'supertest/types';

import path from 'path';
import { Package } from 'db/package';
import { packageSearchInstance } from 'db/package/search';
import * as messages from 'utils/error-messages';

describe('Manage', () => {
  let app: App;
  let user: TestUser;

  // TODO setup elastic search for testing in CI
  const mockSearchMethod = (process.env.NODE_ENV === 'ci' ? () => {} : undefined) as any;

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
  });

  describe('Manage GET', () => {
    let route: string;
    let package1: TestPackage;

    beforeEach(async () => {
      route = `/api/v3/manage/?apikey=${user.apikey}`;

      [package1] = await Promise.all([
        factory.package({ maintainer: user._id, name: 'User app' }),
        factory.package(),
      ]);
    });

    test('blocks access when not logged in', async () => {
      await request(app).get('/api/v3/manage/').expect(401);
    });

    describe('admin user', () => {
      beforeEach(async () => {
        user.role = 'admin';
        await user.save();
      });

      test('shows all apps for an admin user', async () => {
        const res = await request(app).get(route).expect(200);

        assert.ok(res.body.success);
        assert.equal(res.body.data.count, 2);
        assert.equal(res.body.data.packages.length, 2);
      });

      test('has a next link', async () => {
        const res = await request(app).get(`${route}&limit=1`).expect(200);

        assert.ok(res.body.success);
        assert.equal(res.body.data.count, 2);
        assert.equal(res.body.data.packages.length, 1);
        assert.ok(res.body.data.next.includes('skip=1'));
        assert.ok(res.body.data.next.includes('limit=1'));
      });

      test('has a previous link', async () => {
        const res = await request(app).get(`${route}&limit=1&skip=1`).expect(200);

        assert.ok(res.body.success);
        assert.equal(res.body.data.count, 2);
        assert.equal(res.body.data.packages.length, 1);
        assert.ok(res.body.data.previous.includes('skip=0'));
        assert.ok(res.body.data.previous.includes('limit=1'));
      });

      test('searches', async () => {
        const res = await request(app).get(`${route}&search=${package1.name}`).expect(200);

        assert.ok(res.body.success);
        assert.equal(res.body.data.count, 1);
        assert.equal(res.body.data.packages.length, 1);
        assert.equal(res.body.data.packages[0].id, package1.id);
      });
    });

    describe('community user', () => {
      beforeEach(async () => {
        user.role = 'community';
        await user.save();
      });

      test('shows only the logged in users apps for a community user', async () => {
        const res = await request(app).get(route).expect(200);

        assert.ok(res.body.success);
        assert.equal(res.body.data.count, 1);
        assert.equal(res.body.data.packages.length, 1);
        assert.equal(res.body.data.packages[0].id, package1.id);
        assert.equal(res.body.data.packages[0].maintainer, user._id.toString());
      });

      test('fails gracefully', async (t) => {
        const findMock = t.mock.method(Package, 'findByFilters', () => { throw new Error(); });

        const res = await request(app).get(route).expect(500);

        assert.equal(res.body.success, false);
        assert.equal(findMock.mock.callCount(), 1);
      });
    });
  });

  describe('Manage GET id', () => {
    let route: string;
    let package1: TestPackage;
    let package2: TestPackage;

    beforeEach(async () => {
      [package1, package2] = await Promise.all([
        factory.package({ maintainer: user._id, name: 'User app' }),
        factory.package(),
      ]);
      route = `/api/v3/manage/${package1.id}?apikey=${user.apikey}`;
    });

    test('blocks access when not logged in', async () => {
      await request(app).get(`/api/v3/manage/${package1.id}`).expect(401);
    });

    describe('admin user', () => {
      test('sees any app', async () => {
        const res = await request(app).get(route).expect(200);

        assert.ok(res.body.success);
        assert.equal(res.body.data.id, package1.id);
        assert.equal(res.body.data.maintainer, user._id.toString());
      });

      test('404s on a bad id', async () => {
        await request(app).get(`/api/v3/manage/foo?apikey=${user.apikey}`).expect(404);
      });
    });

    describe('community user', () => {
      beforeEach(async () => {
        user.role = 'community';
        await user.save();
      });

      test('sees their own app', async () => {
        const res = await request(app).get(route).expect(200);

        assert.ok(res.body.success);
        assert.equal(res.body.data.id, package1.id);
        assert.equal(res.body.data.maintainer, user._id.toString());
      });

      test('can not see other apps', async () => {
        await request(app).get(`/api/v3/manage/${package2.id}?apikey=${user.apikey}`).expect(403);
      });

      test('fails gracefully', async (t) => {
        const findMock = t.mock.method(Package, 'findOneByFilters', () => { throw new Error(); });

        const res = await request(app).get(route).expect(500);

        assert.equal(res.body.success, false);
        assert.equal(findMock.mock.callCount(), 1);
      });
    });
  });

  describe('Manage POST', () => {
    let route: string;
    let package1: TestPackage;

    beforeEach(async () => {
      route = `/api/v3/manage/?apikey=${user.apikey}`;
      package1 = await factory.package({ maintainer: user._id, name: 'User app' });
    });

    test('blocks access when not logged in', async () => {
      await request(app).post('/api/v3/manage/').expect(401);
    });

    describe('admin user', () => {
      beforeEach(async () => {
        user.role = 'admin';
        await user.save();
      });

      test('succeeds with a com.ubuntu id', async () => {
        const res = await request(app).post(route)
          .send({ id: 'com.ubuntu.app', name: 'App Dev' })
          .expect(200);

        assert.ok(res.body.success);
      });

      test('succeeds with a com.canonical id', async () => {
        const res = await request(app).post(route)
          .send({ id: 'com.canonical.app', name: 'App Dev' })
          .expect(200);

        assert.ok(res.body.success);
      });

      test('succeeds with a ubports id', async () => {
        const res = await request(app).post(route)
          .send({ id: 'ubports.app', name: 'App Dev' })
          .expect(200);

        assert.ok(res.body.success);
      });

      test('succeeds with a openstore id', async () => {
        const res = await request(app).post(route)
          .send({ id: 'OpenStore.app', name: 'App Dev' })
          .expect(200);

        assert.ok(res.body.success);
      });

      test('succeeds with a lomiri id', async () => {
        const res = await request(app).post(route)
          .send({ id: 'lomiri.app', name: 'App Dev' })
          .expect(200);

        assert.ok(res.body.success);
      });
    });

    describe('truested user', () => {
      beforeEach(async () => {
        user.role = 'trusted';
        await user.save();
      });

      test('succeeds with a com.ubuntu id', async () => {
        const res = await request(app).post(route)
          .send({ id: 'com.ubuntu.app', name: 'App Dev' })
          .expect(200);

        assert.ok(res.body.success);
      });

      test('succeeds with a com.canonical id', async () => {
        const res = await request(app).post(route)
          .send({ id: 'com.canonical.app', name: 'App Dev' })
          .expect(200);

        assert.ok(res.body.success);
      });

      test('succeeds with a ubports id', async () => {
        const res = await request(app).post(route)
          .send({ id: 'ubports.app', name: 'App Dev' })
          .expect(200);

        assert.ok(res.body.success);
      });

      test('succeeds with a openstore id', async () => {
        const res = await request(app).post(route)
          .send({ id: 'OpenStore.app', name: 'App Dev' })
          .expect(200);

        assert.ok(res.body.success);
      });

      test('succeeds with a lomiri id', async () => {
        const res = await request(app).post(route)
          .send({ id: 'lomiri.app', name: 'App Dev' })
          .expect(200);

        assert.ok(res.body.success);
      });
    });

    describe('community user', () => {
      beforeEach(async () => {
        user.role = 'community';
        await user.save();
      });

      test('fails with no id', async () => {
        const res = await request(app).post(route).expect(400);

        assert.equal(res.body.success, false);
        assert.equal(res.body.message, messages.NO_APP_NAME);
      });

      test('fails with no name', async () => {
        const res = await request(app).post(route)
          .send({ id: 'app.dev' })
          .expect(400);

        assert.equal(res.body.success, false);
        assert.equal(res.body.message, messages.NO_APP_TITLE);
      });

      test('fails with spaces in the id', async () => {
        const res = await request(app).post(route)
          .send({ id: 'app dev', name: 'App Dev' })
          .expect(400);

        assert.equal(res.body.success, false);
        assert.equal(res.body.message, messages.NO_SPACES_NAME);
      });

      test('fails with a duplicate id', async () => {
        const res = await request(app).post(route)
          .send({ id: package1.id, name: 'App Dev' })
          .expect(400);

        assert.equal(res.body.success, false);
        assert.equal(res.body.message, messages.DUPLICATE_PACKAGE);
      });

      test('fails with a com.ubuntu id', async () => {
        const res = await request(app).post(route)
          .send({ id: 'com.ubuntu.app', name: 'App Dev' })
          .expect(400);

        assert.equal(res.body.success, false);
        assert.equal(res.body.message, messages.BAD_NAMESPACE);
      });

      test('fails with a com.canonical id', async () => {
        const res = await request(app).post(route)
          .send({ id: 'com.canonical.app', name: 'App Dev' })
          .expect(400);

        assert.equal(res.body.success, false);
        assert.equal(res.body.message, messages.BAD_NAMESPACE);
      });

      test('fails with a ubports id', async () => {
        const res = await request(app).post(route)
          .send({ id: 'ubports.app', name: 'App Dev' })
          .expect(400);

        assert.equal(res.body.success, false);
        assert.equal(res.body.message, messages.BAD_NAMESPACE);
      });

      test('fails with a openstore id', async () => {
        const res = await request(app).post(route)
          .send({ id: 'OpenStore.app', name: 'App Dev' })
          .expect(400);

        assert.equal(res.body.success, false);
        assert.equal(res.body.message, messages.BAD_NAMESPACE);
      });

      test('fails with a lomiri id', async () => {
        const res = await request(app).post(route)
          .send({ id: 'lomiri.app', name: 'App Dev' })
          .expect(400);

        assert.equal(res.body.success, false);
        assert.equal(res.body.message, messages.BAD_NAMESPACE);
      });

      test('succeeds with a com.ubuntu.developer id', async () => {
        const res = await request(app).post(route)
          .send({ id: 'com.ubuntu.developer.app', name: 'App Dev' })
          .expect(200);

        assert.ok(res.body.success);
      });

      test('creates a new package', async () => {
        const res = await request(app).post(route)
          .send({ id: 'app.dev', name: 'App Dev' })
          .expect(200);

        assert.ok(res.body.success);
        assert.equal(res.body.data.id, 'app.dev');
        assert.equal(res.body.data.name, 'App Dev');

        const pkg = await Package.findOneByFilters('app.dev');
        assert.ok(pkg);
        assert.equal(pkg.id, 'app.dev');
        assert.equal(pkg.name, 'App Dev');
        assert.equal(!!pkg.published, false);
        assert.equal(pkg.maintainer, user._id.toString());
        assert.equal(pkg.maintainer_name, user.name);
      });

      test('fails gracefully', async (t) => {
        const findMock = t.mock.method(Package, 'findOneByFilters', () => { throw new Error(); });

        const res = await request(app).post(route)
          .send({ id: 'app.dev', name: 'App Dev' })
          .expect(500);

        assert.equal(res.body.success, false);
        assert.equal(findMock.mock.callCount(), 1);
      });
    });
  });

  describe('Manage PUT', () => {
    let route: string;
    let route2: string;
    let package1: TestPackage;
    let package2: TestPackage;

    const screenshot1 = path.join(__dirname, '../tests/fixtures/empty1.png');
    const screenshot2 = path.join(__dirname, '../tests/fixtures/empty2.png');
    const notAScreenshot = path.join(__dirname, '../tests/fixtures/empty.click');

    beforeEach(async () => {
      [package1, package2] = await Promise.all([
        factory.package({ maintainer: user._id, name: 'User app' }),
        factory.package(),
      ]);

      route = `/api/v3/manage/${package1.id}?apikey=${user.apikey}`;
      route2 = `/api/v3/manage/${package2.id}?apikey=${user.apikey}`;
    });

    test('blocks access when not logged in', async () => {
      await request(app).put(`/api/v3/manage/${package1.id}`).expect(401);
    });

    describe('admin user', () => {
      beforeEach(async () => {
        user.role = 'admin';
        await user.save();
      });

      test('allows changing admin only fields', async (t) => {
        const removeSpy = t.mock.method(packageSearchInstance, 'remove', mockSearchMethod);

        const user2 = await factory.user();

        const res = await request(app).put(route)
          .send({ maintainer: user2._id, type_override: 'webapp', locked: true })
          .expect(200);

        assert.ok(res.body.success);
        assert.equal(res.body.data.maintainer, user2._id.toString());
        assert.equal(res.body.data.type_override, 'webapp');
        assert.ok(res.body.data.locked);

        assert.equal(removeSpy.mock.callCount(), 1);

        const pkg = await Package.findOneByFilters(package1.id);
        assert.equal(pkg?.maintainer, user2._id.toString());
      });

      test('can update any package', async (t) => {
        const removeSpy = t.mock.method(packageSearchInstance, 'remove', mockSearchMethod);

        const res = await request(app).put(route2)
          .send({ name: 'Foo Bar' })
          .expect(200);

        assert.ok(res.body.success);
        assert.equal(res.body.data.name, 'Foo Bar');

        assert.equal(removeSpy.mock.callCount(), 1);

        const pkg = await Package.findOneByFilters(package2.id);
        assert.equal(pkg?.name, 'Foo Bar');
      });

      test('can update a locked package', async (t) => {
        const removeSpy = t.mock.method(packageSearchInstance, 'remove', mockSearchMethod);

        package2.locked = true;
        await package2.save();

        const res = await request(app).put(route2)
          .send({ name: 'Foo Bar' })
          .expect(200);

        assert.ok(res.body.success);
        assert.equal(res.body.data.name, 'Foo Bar');

        assert.equal(removeSpy.mock.callCount(), 1);

        const pkg = await Package.findOneByFilters(package2.id);
        assert.equal(pkg?.name, 'Foo Bar');
      });
    });

    describe('community user', () => {
      beforeEach(async () => {
        user.role = 'community';
        await user.save();
      });

      test('fails with a bad id', async () => {
        await request(app).put(`/api/v3/manage/foo?apikey=${user.apikey}`).expect(404);
      });

      test('does not allow modifying another users package', async () => {
        await request(app).put(route2).expect(403);
      });

      test('does not allow publishing without revisions', async () => {
        const res = await request(app).put(route)
          .send({ published: true })
          .expect(400);

        assert.equal(res.body.success, false);
        assert.equal(res.body.message, messages.NO_REVISIONS);
      });

      test('does not allow changing admin only fields', async (t) => {
        const removeSpy = t.mock.method(packageSearchInstance, 'remove', mockSearchMethod);

        const res = await request(app).put(route)
          .send({ maintainer: 'foo', type_override: 'webapp', locked: true })
          .expect(200);

        assert.ok(res.body.success);
        assert.equal(res.body.data.maintainer, user._id.toString());
        assert.equal(res.body.data.type_override, '');
        assert.equal(res.body.data.locked, false);

        assert.equal(removeSpy.mock.callCount(), 1);
      });

      test('updates successfully', async (t) => {
        const removeSpy = t.mock.method(packageSearchInstance, 'remove', mockSearchMethod);

        const res = await request(app).put(route)
          .send({ name: 'Foo Bar' })
          .expect(200);

        assert.ok(res.body.success);
        assert.equal(res.body.data.name, 'Foo Bar');

        assert.equal(removeSpy.mock.callCount(), 1);

        const pkg = await Package.findOneByFilters(package1.id);
        assert.equal(pkg?.name, 'Foo Bar');
      });

      test('publishes the package', async (t) => {
        const upsertSpy = t.mock.method(packageSearchInstance, 'upsert', mockSearchMethod);

        package1.revisions.push({});
        await package1.save();

        const res = await request(app).put(route)
          .send({ published: true })
          .expect(200);

        assert.ok(res.body.success);
        assert.equal(upsertSpy.mock.callCount(), 1);

        const pkg = await Package.findOneByFilters(package1.id);
        assert.ok(pkg?.published);
      });

      test('unpublishes the package', async (t) => {
        package1.published = true;
        await package1.save();

        const removeSpy = t.mock.method(packageSearchInstance, 'remove', mockSearchMethod);

        package1.revisions.push({});
        await package1.save();

        const res = await request(app).put(route)
          .send({ published: false })
          .expect(200);

        assert.ok(res.body.success);
        assert.equal(removeSpy.mock.callCount(), 1);

        const pkg = await Package.findOneByFilters(package1.id);
        assert.equal(!!pkg?.published, false);
      });

      test('fails gracefully', async (t) => {
        const findMock = t.mock.method(Package, 'findOneByFilters', () => { throw new Error(); });

        const res = await request(app).put(route).expect(500);

        assert.equal(res.body.success, false);
        assert.equal(findMock.mock.callCount(), 1);
      });

      test('cannot update a locked package', async () => {
        package1.published = false;
        package1.locked = true;
        await package1.save();

        const res = await request(app).put(route)
          .send({ published: true, locked: false })
          .expect(403);

        assert.equal(res.body.success, false);
        assert.equal(res.body.message, messages.APP_LOCKED);

        const pkg = await Package.findOneByFilters(package1.id);
        assert.equal(!!pkg?.published, false);
        assert.ok(pkg?.locked);
      });

      test('adds screenshots up to the limit', async (t) => {
        const removeSpy = t.mock.method(packageSearchInstance, 'remove', mockSearchMethod);

        const res = await request(app).put(route)
          .attach('screenshot_files', screenshot1)
          .attach('screenshot_files', screenshot2)
          .attach('screenshot_files', screenshot1)
          .attach('screenshot_files', screenshot2)
          .attach('screenshot_files', screenshot1)
          .attach('screenshot_files', screenshot2)
          .expect(200);

        assert.ok(res.body.success);
        assert.equal(res.body.data.screenshots.length, 5);

        assert.equal(removeSpy.mock.callCount(), 1);

        const pkg = await Package.findOneByFilters(package1.id);
        assert.equal(pkg?.screenshots.length, 5);
      });

      test('rejects non-images uploaded as screenshots', async (t) => {
        const removeSpy = t.mock.method(packageSearchInstance, 'remove', mockSearchMethod);

        const res = await request(app).put(route)
          .attach('screenshot_files', screenshot1)
          .attach('screenshot_files', notAScreenshot)
          .expect(200);

        assert.ok(res.body.success);
        assert.equal(res.body.data.screenshots.length, 1);

        assert.equal(removeSpy.mock.callCount(), 1);

        const pkg = await Package.findOneByFilters(package1.id);
        assert.equal(pkg?.screenshots.length, 1);
      });

      test('removes screenshots', async (t) => {
        const removeSpy = t.mock.method(packageSearchInstance, 'remove', mockSearchMethod);

        const res = await request(app).put(route)
          .attach('screenshot_files', screenshot1)
          .attach('screenshot_files', screenshot2)
          .expect(200);

        assert.ok(res.body.success);
        assert.equal(res.body.data.screenshots.length, 2);

        const res2 = await request(app).put(route)
          .send({ screenshots: [] })
          .expect(200);

        assert.ok(res2.body.success);
        assert.equal(res2.body.data.screenshots.length, 0);

        assert.equal(removeSpy.mock.callCount(), 2);

        const pkg = await Package.findOneByFilters(package1.id);
        assert.equal(pkg?.screenshots.length, 0);
      });

      test('reorders screenshots', async (t) => {
        const removeSpy = t.mock.method(packageSearchInstance, 'remove', mockSearchMethod);

        const res = await request(app).put(route)
          .attach('screenshot_files', screenshot1)
          .attach('screenshot_files', screenshot2)
          .expect(200);

        assert.ok(res.body.success);
        assert.equal(res.body.data.screenshots.length, 2);

        const res2 = await request(app).put(route)
          .send({
            screenshots: [
              res.body.data.screenshots[1].replace('http://local.open-store.io/screenshots/', ''),
              res.body.data.screenshots[0].replace('http://local.open-store.io/screenshots/', ''),
            ],
          })
          .expect(200);

        assert.ok(res2.body.success);
        assert.equal(res2.body.data.screenshots.length, 2);
        assert.equal(res2.body.data.screenshots[0], res.body.data.screenshots[1]);
        assert.equal(res2.body.data.screenshots[1], res.body.data.screenshots[0]);

        assert.equal(removeSpy.mock.callCount(), 2);

        const pkg = await Package.findOneByFilters(package1.id);
        assert.equal(pkg?.screenshots.length, 2);
        assert.equal(pkg?.screenshots[0], res.body.data.screenshots[1].replace('http://local.open-store.io/screenshots/', ''));
        assert.equal(pkg?.screenshots[1], res.body.data.screenshots[0].replace('http://local.open-store.io/screenshots/', ''));
      });

      test('clears out urls', async (t) => {
        const removeSpy = t.mock.method(packageSearchInstance, 'remove', mockSearchMethod);

        const res = await request(app).put(route)
          .send({
            source: 'https://example.com/',
            support_url: 'https://example.com/',
            donate_url: 'https://example.com/',
            translation_url: 'https://example.com/',
            video_url: 'https://www.youtube.com/embed/example',
          })
          .expect(200);

        assert.ok(res.body.success);
        assert.ok(res.body.data.source.length > 0);
        assert.ok(res.body.data.support_url.length > 0);
        assert.ok(res.body.data.donate_url.length > 0);
        assert.ok(res.body.data.translation_url.length > 0);
        assert.ok(res.body.data.video_url.length > 0);

        const res2 = await request(app).put(route)
          .send({
            source: '',
            support_url: '',
            donate_url: '',
            translation_url: '',
            video_url: '',
          })
          .expect(200);

        assert.ok(res2.body.success);
        assert.equal(res2.body.data.source.length, 0);
        assert.equal(res2.body.data.support_url.length, 0);
        assert.equal(res2.body.data.donate_url.length, 0);
        assert.equal(res2.body.data.translation_url.length, 0);
        assert.equal(res2.body.data.video_url.length, 0);

        assert.equal(removeSpy.mock.callCount(), 2);
      });
    });
  });

  describe('Manage DELETE', () => {
    let route: string;
    let route2: string;
    let package1: TestPackage;
    let package2: TestPackage;

    beforeEach(async () => {
      [package1, package2] = await Promise.all([
        factory.package({ maintainer: user._id, name: 'User app' }),
        factory.package(),
      ]);
      route = `/api/v3/manage/${package1.id}?apikey=${user.apikey}`;
      route2 = `/api/v3/manage/${package2.id}?apikey=${user.apikey}`;
    });

    describe('admin user', () => {
      beforeEach(async () => {
        user.role = 'admin';
        await user.save();
      });

      test('can delete any package', async () => {
        await request(app).delete(route).expect(200);

        const pkg = await Package.findOneByFilters(package1.id);
        assert.equal(pkg, null);
      });
    });

    describe('community user', () => {
      beforeEach(async () => {
        user.role = 'community';
        await user.save();
      });

      test('fails with a bad id', async () => {
        await request(app).delete(`/api/v3/manage/foo?apikey=${user.apikey}`).expect(404);
      });

      test('does not allow modifying another users package', async () => {
        await request(app).delete(route2).expect(403);
      });

      test('does not allow deleting an app with revisions', async () => {
        package1.revisions.push({});
        await package1.save();

        await request(app).delete(route).expect(400);
      });

      test('deletes a package', async () => {
        await request(app).delete(route).expect(200);

        const pkg = await Package.findOneByFilters(package1.id);
        assert.equal(pkg, null);
      });

      test('fails gracefully', async (t) => {
        const findMock = t.mock.method(Package, 'findOneByFilters', () => { throw new Error(); });

        const res = await request(app).delete(route).expect(500);

        assert.equal(res.body.success, false);
        assert.equal(findMock.mock.callCount(), 1);
      });
    });
  });
});
