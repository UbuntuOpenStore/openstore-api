import path from 'path';
import factory from './factory';

import { expect } from './helper';
import { Package } from '../src/db/package';
import PackageSearch from '../src/db/package/search';
import * as messages from '../src/api/error-messages';

describe('Manage GET', () => {
  before(function() {
    this.route = '/api/v3/manage/';
  });

  beforeEach(async function() {
    [this.package] = await Promise.all([
      factory.package({ maintainer: this.user._id, name: 'User app' }),
      factory.package(),
    ]);
  });

  it('blocks access when not logged in', async function() {
    await this.get(this.route, false).expect(401);
  });

  context('admin user', () => {
    it('shows all apps for an admin user', async function() {
      const res = await this.get(this.route).expect(200);

      expect(res.body.success).to.be.true;
      expect(res.body.data.count).to.equal(2);
      expect(res.body.data.packages).to.have.lengthOf(2);
    });

    it('has a next link', async function() {
      const res = await this.get(`${this.route}?limit=1`).expect(200);

      expect(res.body.success).to.be.true;
      expect(res.body.data.count).to.equal(2);
      expect(res.body.data.packages).to.have.lengthOf(1);
      expect(res.body.data.next).to.include('skip=1');
      expect(res.body.data.next).to.include('limit=1');
    });

    it('has a previous link', async function() {
      const res = await this.get(`${this.route}?limit=1&skip=1`).expect(200);

      expect(res.body.success).to.be.true;
      expect(res.body.data.count).to.equal(2);
      expect(res.body.data.packages).to.have.lengthOf(1);
      expect(res.body.data.previous).to.include('skip=0');
      expect(res.body.data.previous).to.include('limit=1');
    });

    it('searches', async function() {
      const res = await this.get(`${this.route}?search=${this.package.name}`).expect(200);

      expect(res.body.success).to.be.true;
      expect(res.body.data.count).to.equal(1);
      expect(res.body.data.packages).to.have.lengthOf(1);
      expect(res.body.data.packages[0].id).to.equal(this.package.id);
    });
  });

  context('community user', () => {
    beforeEach(async function() {
      this.user.role = 'community';
      await this.user.save();
    });

    it('shows only the logged in users apps for a community user', async function() {
      const res = await this.get(this.route).expect(200);

      expect(res.body.success).to.be.true;
      expect(res.body.data.count).to.equal(1);
      expect(res.body.data.packages).to.have.lengthOf(1);
      expect(res.body.data.packages[0].id).to.equal(this.package.id);
      expect(res.body.data.packages[0].maintainer).to.equal(this.user._id.toString());
    });

    it('fails gracefully', async function() {
      const findStub = this.sandbox.stub(Package, 'findByFilters').rejects();

      const res = await this.get(this.route).expect(500);

      expect(res.body.success).to.be.false;
      expect(findStub).to.have.been.calledOnce;
    });
  });
});

describe('Manage GET id', () => {
  before(function() {
    this.route = '/api/v3/manage/';
  });

  beforeEach(async function() {
    [this.package, this.package2] = await Promise.all([
      factory.package({ maintainer: this.user._id, name: 'User app' }),
      factory.package(),
    ]);
  });

  it('blocks access when not logged in', async function() {
    await this.get(`${this.route}/${this.package.id}`, false).expect(401);
  });

  context('admin user', () => {
    it('sees any app', async function() {
      const res = await this.get(`${this.route}/${this.package.id}`).expect(200);

      expect(res.body.success).to.be.true;
      expect(res.body.data.id).to.equal(this.package.id);
      expect(res.body.data.maintainer).to.equal(this.user._id.toString());
    });

    it('404s on a bad id', async function() {
      await this.get(`${this.route}/foo`).expect(404);
    });
  });

  context('community user', () => {
    beforeEach(async function() {
      this.user.role = 'community';
      await this.user.save();
    });

    it('sees their own app', async function() {
      const res = await this.get(`${this.route}/${this.package.id}`).expect(200);

      expect(res.body.success).to.be.true;
      expect(res.body.data.id).to.equal(this.package.id);
      expect(res.body.data.maintainer).to.equal(this.user._id.toString());
    });

    it('can not see other apps', async function() {
      await this.get(`${this.route}/${this.package2.id}`).expect(404);
    });

    it('fails gracefully', async function() {
      const findStub = this.sandbox.stub(Package, 'findOneByFilters').rejects();

      const res = await this.get(`${this.route}/${this.package.id}`).expect(404);

      expect(res.body.success).to.be.false;
      expect(findStub).to.have.been.calledOnce;
    });
  });
});

describe('Manage POST', () => {
  before(function() {
    this.route = '/api/v3/manage/';
  });

  beforeEach(async function() {
    this.package = await factory.package({ maintainer: this.user._id, name: 'User app' });
  });

  it('blocks access when not logged in', async function() {
    await this.post(this.route, false).expect(401);
  });

  context('admin user', () => {
    it('succeeds with a com.ubuntu id', async function() {
      const res = await this.post(this.route)
        .send({ id: 'com.ubuntu.app', name: 'App Dev' })
        .expect(200);

      expect(res.body.success).to.be.true;
    });

    it('succeeds with a com.canonical id', async function() {
      const res = await this.post(this.route)
        .send({ id: 'com.canonical.app', name: 'App Dev' })
        .expect(200);

      expect(res.body.success).to.be.true;
    });

    it('succeeds with a ubports id', async function() {
      const res = await this.post(this.route)
        .send({ id: 'ubports.app', name: 'App Dev' })
        .expect(200);

      expect(res.body.success).to.be.true;
    });

    it('succeeds with a openstore id', async function() {
      const res = await this.post(this.route)
        .send({ id: 'OpenStore.app', name: 'App Dev' })
        .expect(200);

      expect(res.body.success).to.be.true;
    });
  });

  context('truested user', () => {
    beforeEach(async function() {
      this.user.role = 'trusted';
      await this.user.save();
    });

    it('succeeds with a com.ubuntu id', async function() {
      const res = await this.post(this.route)
        .send({ id: 'com.ubuntu.app', name: 'App Dev' })
        .expect(200);

      expect(res.body.success).to.be.true;
    });

    it('succeeds with a com.canonical id', async function() {
      const res = await this.post(this.route)
        .send({ id: 'com.canonical.app', name: 'App Dev' })
        .expect(200);

      expect(res.body.success).to.be.true;
    });

    it('succeeds with a ubports id', async function() {
      const res = await this.post(this.route)
        .send({ id: 'ubports.app', name: 'App Dev' })
        .expect(200);

      expect(res.body.success).to.be.true;
    });

    it('succeeds with a openstore id', async function() {
      const res = await this.post(this.route)
        .send({ id: 'OpenStore.app', name: 'App Dev' })
        .expect(200);

      expect(res.body.success).to.be.true;
    });
  });

  context('community user', () => {
    beforeEach(async function() {
      this.user.role = 'community';
      await this.user.save();
    });

    it('fails with no id', async function() {
      const res = await this.post(this.route).expect(400);

      expect(res.body.success).to.be.false;
      expect(res.body.message).to.equal(messages.NO_APP_NAME);
    });

    it('fails with no name', async function() {
      const res = await this.post(this.route)
        .send({ id: 'app.dev' })
        .expect(400);

      expect(res.body.success).to.be.false;
      expect(res.body.message).to.equal(messages.NO_APP_TITLE);
    });

    it('fails with spaces in the id', async function() {
      const res = await this.post(this.route)
        .send({ id: 'app dev', name: 'App Dev' })
        .expect(400);

      expect(res.body.success).to.be.false;
      expect(res.body.message).to.equal(messages.NO_SPACES_NAME);
    });

    it('fails with a duplicate id', async function() {
      const res = await this.post(this.route)
        .send({ id: this.package.id, name: 'App Dev' })
        .expect(400);

      expect(res.body.success).to.be.false;
      expect(res.body.message).to.equal(messages.DUPLICATE_PACKAGE);
    });

    it('fails with a com.ubuntu id', async function() {
      const res = await this.post(this.route)
        .send({ id: 'com.ubuntu.app', name: 'App Dev' })
        .expect(400);

      expect(res.body.success).to.be.false;
      expect(res.body.message).to.equal(messages.BAD_NAMESPACE);
    });

    it('fails with a com.canonical id', async function() {
      const res = await this.post(this.route)
        .send({ id: 'com.canonical.app', name: 'App Dev' })
        .expect(400);

      expect(res.body.success).to.be.false;
      expect(res.body.message).to.equal(messages.BAD_NAMESPACE);
    });

    it('fails with a ubports id', async function() {
      const res = await this.post(this.route)
        .send({ id: 'ubports.app', name: 'App Dev' })
        .expect(400);

      expect(res.body.success).to.be.false;
      expect(res.body.message).to.equal(messages.BAD_NAMESPACE);
    });

    it('fails with a openstore id', async function() {
      const res = await this.post(this.route)
        .send({ id: 'OpenStore.app', name: 'App Dev' })
        .expect(400);

      expect(res.body.success).to.be.false;
      expect(res.body.message).to.equal(messages.BAD_NAMESPACE);
    });

    it('succeeds with a com.ubuntu.developer id', async function() {
      const res = await this.post(this.route)
        .send({ id: 'com.ubuntu.developer.app', name: 'App Dev' })
        .expect(200);

      expect(res.body.success).to.be.true;
    });

    it('creates a new package', async function() {
      const res = await this.post(this.route)
        .send({ id: 'app.dev', name: 'App Dev' })
        .expect(200);

      expect(res.body.success).to.be.true;
      expect(res.body.data.id).to.equal('app.dev');
      expect(res.body.data.name).to.equal('App Dev');

      const pkg = await Package.findOneByFilters('app.dev');
      expect(pkg).to.exist;
      expect(pkg?.id).to.equal('app.dev');
      expect(pkg?.name).to.equal('App Dev');
      expect(pkg?.published).to.not.be.ok;
      expect(pkg?.maintainer).to.equal(this.user._id.toString());
      expect(pkg?.maintainer_name).to.equal(this.user.name);
    });

    it('fails gracefully', async function() {
      const findStub = this.sandbox.stub(Package, 'findOneByFilters').rejects();

      const res = await this.post(this.route)
        .send({ id: 'app.dev', name: 'App Dev' })
        .expect(500);

      expect(res.body.success).to.be.false;
      expect(findStub).to.have.been.calledOnce;
    });
  });
});

describe('Manage PUT', () => {
  before(function() {
    this.route = '/api/v3/manage/';

    this.screenshot1 = path.join(__dirname, 'fixtures/empty1.png');
    this.screenshot2 = path.join(__dirname, 'fixtures/empty2.png');
    this.notAScreenshot = path.join(__dirname, 'fixtures/empty.click');
  });

  beforeEach(async function() {
    this.removeStub = this.sandbox.stub(PackageSearch, 'remove');
    this.upsertStub = this.sandbox.stub(PackageSearch, 'upsert');

    [this.package, this.package2] = await Promise.all([
      factory.package({ maintainer: this.user._id, name: 'User app' }),
      factory.package(),
    ]);
  });

  it('blocks access when not logged in', async function() {
    await this.put(`${this.route}/${this.package.id}`, false).expect(401);
  });

  context('admin user', () => {
    it('allows changing admin only fields', async function() {
      const user2 = await factory.user();

      const res = await this.put(`${this.route}/${this.package.id}`)
        .send({ maintainer: user2._id, type_override: 'webapp', locked: true })
        .expect(200);

      expect(res.body.success).to.be.true;
      expect(res.body.data.maintainer).to.equal(user2._id.toString());
      expect(res.body.data.type_override).to.equal('webapp');
      expect(res.body.data.locked).to.be.true;
      expect(this.removeStub).to.have.been.calledOnce;

      const pkg = await Package.findOneByFilters(this.package.id);
      expect(pkg?.maintainer).to.equal(user2._id.toString());
    });

    it('can update any package', async function() {
      const res = await this.put(`${this.route}/${this.package2.id}`)
        .send({ name: 'Foo Bar' })
        .expect(200);

      expect(res.body.success).to.be.true;
      expect(res.body.data.name).to.equal('Foo Bar');
      expect(this.removeStub).to.have.been.calledOnce;

      const pkg = await Package.findOneByFilters(this.package2.id);
      expect(pkg?.name).to.equal('Foo Bar');
    });

    it('can update a locked package', async function() {
      this.package2.locked = true;
      await this.package2.save();

      const res = await this.put(`${this.route}/${this.package2.id}`)
        .send({ name: 'Foo Bar' })
        .expect(200);

      expect(res.body.success).to.be.true;
      expect(res.body.data.name).to.equal('Foo Bar');
      expect(this.removeStub).to.have.been.calledOnce;

      const pkg = await Package.findOneByFilters(this.package2.id);
      expect(pkg?.name).to.equal('Foo Bar');
    });
  });

  context('community user', () => {
    beforeEach(async function() {
      this.user.role = 'community';
      await this.user.save();
    });

    it('fails with a bad id', async function() {
      await this.put(`${this.route}/foo`).expect(404);
    });

    it('does not allow modifying another users package', async function() {
      await this.put(`${this.route}/${this.package2.id}`).expect(403);
    });

    it('does not allow publishing without revisions', async function() {
      const res = await this.put(`${this.route}/${this.package.id}`)
        .send({ published: true })
        .expect(400);

      expect(res.body.success).to.be.false;
      expect(res.body.message).to.equal(messages.NO_REVISIONS);
    });

    it('does not allow changing admin only fields', async function() {
      const res = await this.put(`${this.route}/${this.package.id}`)
        .send({ maintainer: 'foo', type_override: 'webapp', locked: true })
        .expect(200);

      expect(res.body.success).to.be.true;
      expect(res.body.data.maintainer).to.equal(this.user._id.toString());
      expect(res.body.data.type_override).to.equal('');
      expect(res.body.data.locked).to.be.false;
      expect(this.removeStub).to.have.been.calledOnce;
    });

    it('updates successfully', async function() {
      const res = await this.put(`${this.route}/${this.package.id}`)
        .send({ name: 'Foo Bar' })
        .expect(200);

      expect(res.body.success).to.be.true;
      expect(res.body.data.name).to.equal('Foo Bar');
      expect(this.removeStub).to.have.been.calledOnce;

      const pkg = await Package.findOneByFilters(this.package.id);
      expect(pkg?.name).to.equal('Foo Bar');
    });

    it('publishes the package', async function() {
      this.package.revisions.push({});
      await this.package.save();

      const res = await this.put(`${this.route}/${this.package.id}`)
        .send({ published: true })
        .expect(200);

      expect(res.body.success).to.be.true;
      expect(this.upsertStub).to.have.been.calledOnce;

      const pkg = await Package.findOneByFilters(this.package.id);
      expect(pkg?.published).to.be.true;
    });

    it('fails gracefully', async function() {
      const findStub = this.sandbox.stub(Package, 'findOneByFilters').rejects();

      const res = await this.put(`${this.route}/${this.package.id}`).expect(500);

      expect(res.body.success).to.be.false;
      expect(findStub).to.have.been.calledOnce;
    });

    it('cannot update a locked package', async function() {
      this.package.published = false;
      this.package.locked = true;
      await this.package.save();

      const res = await this.put(`${this.route}/${this.package.id}`)
        .send({ published: true, locked: false })
        .expect(403);

      expect(res.body.success).to.be.false;
      expect(res.body.message).to.equal(messages.APP_LOCKED);

      const pkg = await Package.findOneByFilters(this.package.id);
      expect(pkg?.published).to.be.false;
      expect(pkg?.locked).to.be.true;
    });

    it('adds screenshots up to the limit', async function() {
      const res = await this.put(`${this.route}/${this.package.id}`)
        .attach('screenshot_files', this.screenshot1)
        .attach('screenshot_files', this.screenshot2)
        .attach('screenshot_files', this.screenshot1)
        .attach('screenshot_files', this.screenshot2)
        .attach('screenshot_files', this.screenshot1)
        .attach('screenshot_files', this.screenshot2)
        .expect(200);

      expect(res.body.success).to.be.true;
      expect(res.body.data.screenshots).to.have.lengthOf(5);

      const pkg = await Package.findOneByFilters(this.package.id);
      expect(pkg?.screenshots).to.have.lengthOf(5);
    });

    it('rejects non-images uploaded as screenshots', async function() {
      const res = await this.put(`${this.route}/${this.package.id}`)
        .attach('screenshot_files', this.screenshot1)
        .attach('screenshot_files', this.notAScreenshot)
        .expect(200);

      expect(res.body.success).to.be.true;
      expect(res.body.data.screenshots).to.have.lengthOf(1);

      const pkg = await Package.findOneByFilters(this.package.id);
      expect(pkg?.screenshots).to.have.lengthOf(1);
    });

    it('removes screenshots', async function() {
      const res = await this.put(`${this.route}/${this.package.id}`)
        .attach('screenshot_files', this.screenshot1)
        .attach('screenshot_files', this.screenshot2)
        .expect(200);

      expect(res.body.success).to.be.true;
      expect(res.body.data.screenshots).to.have.lengthOf(2);

      const res2 = await this.put(`${this.route}/${this.package.id}`)
        .send({ screenshots: [] })
        .expect(200);

      expect(res2.body.success).to.be.true;
      expect(res2.body.data.screenshots).to.have.lengthOf(0);

      const pkg = await Package.findOneByFilters(this.package.id);
      expect(pkg?.screenshots).to.have.lengthOf(0);
    });

    it('reorders screenshots', async function() {
      const res = await this.put(`${this.route}/${this.package.id}`)
        .attach('screenshot_files', this.screenshot1)
        .attach('screenshot_files', this.screenshot2)
        .expect(200);

      expect(res.body.success).to.be.true;
      expect(res.body.data.screenshots).to.have.lengthOf(2);

      const res2 = await this.put(`${this.route}/${this.package.id}`)
        .send({ screenshots: [
          res.body.data.screenshots[1].replace('http://local.open-store.io/screenshots/', ''),
          res.body.data.screenshots[0].replace('http://local.open-store.io/screenshots/', ''),
        ] })
        .expect(200);

      expect(res2.body.success).to.be.true;
      expect(res2.body.data.screenshots).to.have.lengthOf(2);
      expect(res2.body.data.screenshots[0]).to.equal(res.body.data.screenshots[1]);
      expect(res2.body.data.screenshots[1]).to.equal(res.body.data.screenshots[0]);

      const pkg = await Package.findOneByFilters(this.package.id);
      expect(pkg?.screenshots).to.have.lengthOf(2);
      expect(pkg?.screenshots[0]).to.equal(res.body.data.screenshots[1].replace('http://local.open-store.io/screenshots/', ''));
      expect(pkg?.screenshots[1]).to.equal(res.body.data.screenshots[0].replace('http://local.open-store.io/screenshots/', ''));
    });

    // TODO test pkg.updateFromBody()
  });
});

describe('Manage DELETE', () => {
  before(function() {
    this.route = '/api/v3/manage/';
  });

  beforeEach(async function() {
    [this.package, this.package2] = await Promise.all([
      factory.package({ maintainer: this.user._id, name: 'User app' }),
      factory.package(),
    ]);
  });

  context('admin user', () => {
    it('can delete any package', async function() {
      await this.delete(`${this.route}/${this.package.id}`).expect(200);

      const pkg = await Package.findOneByFilters(this.package.id);
      expect(pkg).to.be.null;
    });
  });

  context('community user', () => {
    beforeEach(async function() {
      this.user.role = 'community';
      await this.user.save();
    });

    it('fails with a bad id', async function() {
      await this.delete(`${this.route}/foo`).expect(404);
    });

    it('does not allow modifying another users package', async function() {
      await this.delete(`${this.route}/${this.package2.id}`).expect(403);
    });

    it('does not allow deleting an app with revisions', async function() {
      this.package.revisions.push({});
      await this.package.save();

      await this.delete(`${this.route}/${this.package.id}`).expect(400);
    });

    it('deletes a package', async function() {
      await this.delete(`${this.route}/${this.package.id}`).expect(200);

      const pkg = await Package.findOneByFilters(this.package.id);
      expect(pkg).to.be.null;
    });

    it('fails gracefully', async function() {
      const findStub = this.sandbox.stub(Package, 'findOneByFilters').rejects();

      const res = await this.delete(`${this.route}/${this.package.id}`).expect(500);

      expect(res.body.success).to.be.false;
      expect(findStub).to.have.been.calledOnce;
    });
  });
});
