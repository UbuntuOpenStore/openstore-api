import path from 'path';
import factory from './factory';

import { expect } from './helper';
import PackageRepo from '../src/db/package/repo';
import { Architecture, Channel } from '../src/db/package/types';
import Lock from '../src/db/lock/model';
import LockRepo from '../src/db/lock/repo';
import * as reviewPackage from '../src/utils/review-package';
import * as clickParser from '../src/utils/click-parser-async';
import PackageSearch from '../src/db/package/search';

describe('Manage Revision POST', () => {
  beforeEach(async function() {
    [this.package, this.package2] = await Promise.all([
      factory.package({
        maintainer: this.user._id,
        name: 'OpenStore Test',
        id: 'openstore-test.openstore-team',
      }),
      factory.package(),
    ]);

    this.route = `/api/v3/manage/${this.package.id}/revision`;
    this.goodClick = path.join(__dirname, 'fixtures/good.click');
    this.good64Click = path.join(__dirname, 'fixtures/good64.click');
    this.emptyClick = path.join(__dirname, 'fixtures/empty.click');
    this.notAClick = path.join(__dirname, 'fixtures/notaclick.txt');

    this.lockAcquireSpy = this.sandbox.spy(LockRepo, 'acquire');
    this.lockReleaseSpy = this.sandbox.spy(LockRepo, 'release');
  });

  it('blocks access when not logged in', async function() {
    await this.post(this.route, false).expect(401);
  });

  context('admin user', () => {
    it('allows access to other packages', async function() {
      const parseStub = this.sandbox.stub(clickParser, 'parsePackage').resolves({
        name: this.package2.id,
        version: '1.0.0',
        architecture: 'armhf',
        apps: [],
      });

      const res = await this.post(`/api/v3/manage/${this.package2.id}/revision`)
        .attach('file', this.emptyClick)
        .field('channel', Channel.XENIAL)
        .expect(200);

      expect(res.body.success).to.be.true;
      expect(parseStub).to.have.been.calledOnce;
      expect(this.lockAcquireSpy).to.have.been.calledOnce;
      expect(this.lockReleaseSpy).to.have.been.calledOnce;
    });

    it('does not review', async function() {
      const reviewSpy = this.sandbox.spy(reviewPackage, 'review');
      const parseStub = this.sandbox.stub(clickParser, 'parsePackage').resolves({
        name: this.package.id,
        version: '1.0.0',
        architecture: 'armhf',
        apps: [],
      });

      const res = await this.post(this.route)
        .attach('file', this.emptyClick)
        .field('channel', Channel.XENIAL)
        .expect(200);

      expect(res.body.success).to.be.true;
      expect(reviewSpy).to.have.not.been.calledOnce;
      expect(parseStub).to.have.been.calledOnce;
      expect(this.lockAcquireSpy).to.have.been.calledOnce;
      expect(this.lockReleaseSpy).to.have.been.calledOnce;
    });
  });

  context('trusted user', () => {
    beforeEach(async function() {
      this.user.role = 'trusted';
      await this.user.save();
    });

    it('does not review', async function() {
      const reviewSpy = this.sandbox.spy(reviewPackage, 'review');
      const parseStub = this.sandbox.stub(clickParser, 'parsePackage').resolves({
        name: this.package.id,
        version: '1.0.0',
        architecture: 'armhf',
        apps: [],
      });

      const res = await this.post(this.route)
        .attach('file', this.emptyClick)
        .field('channel', Channel.XENIAL)
        .expect(200);

      expect(res.body.success).to.be.true;
      expect(reviewSpy).to.have.not.been.calledOnce;
      expect(parseStub).to.have.been.calledOnce;
      expect(this.lockAcquireSpy).to.have.been.calledOnce;
      expect(this.lockReleaseSpy).to.have.been.calledOnce;
    });
  });

  context('community user', () => {
    beforeEach(async function() {
      this.user.role = 'community';
      await this.user.save();
    });

    it('fails with no file', async function() {
      const res = await this.post(this.route)
        .expect(400);

      expect(res.body.message).to.equal('No file upload specified');
      expect(this.lockAcquireSpy).to.have.not.been.called;
      expect(this.lockReleaseSpy).to.have.not.been.called;
    });

    it('fails with invalid channel', async function() {
      const res = await this.post(this.route)
        .attach('file', this.emptyClick)
        .field('channel', 'vivid')
        .expect(400);

      expect(res.body.message).to.equal('The provided channel is not valid');
      expect(this.lockAcquireSpy).to.have.not.been.called;
      expect(this.lockReleaseSpy).to.have.not.been.called;
    });

    it('fails with bad id', async function() {
      const res = await this.post('/api/v3/manage/foo/revision')
        .attach('file', this.emptyClick)
        .field('channel', Channel.XENIAL)
        .expect(404);

      expect(res.body.message).to.equal('App not found');
      expect(this.lockAcquireSpy).to.have.been.calledOnce;
      expect(this.lockReleaseSpy).to.have.been.calledOnce;
    });

    it('does not allow access to other packages', async function() {
      await this.post(`/api/v3/manage/${this.package2.id}/revision`)
        .attach('file', this.emptyClick)
        .field('channel', Channel.XENIAL)
        .expect(403);

      expect(this.lockAcquireSpy).to.have.been.calledOnce;
      expect(this.lockReleaseSpy).to.have.been.calledOnce;
    });

    it('fails review', async function() {
      const reviewStub = this.sandbox.stub(reviewPackage, 'review').resolves("'unconfined' not allowed");

      const res = await this.post(this.route)
        .attach('file', this.emptyClick)
        .field('channel', Channel.XENIAL)
        .expect(400);

      expect(res.body.success).to.be.false;
      expect(res.body.message).to.equal("This app needs to be reviewed manually (Error: 'unconfined' not allowed)");
      expect(reviewStub).to.have.been.calledOnce;
      expect(this.lockAcquireSpy).to.have.been.calledOnce;
      expect(this.lockReleaseSpy).to.have.been.calledOnce;
    });

    it('fails review (general)', async function() {
      const reviewStub = this.sandbox.stub(reviewPackage, 'review').resolves(true);

      const res = await this.post(this.route)
        .attach('file', this.emptyClick)
        .field('channel', Channel.XENIAL)
        .expect(400);

      expect(res.body.success).to.be.false;
      expect(res.body.message).to.equal('This app needs to be reviewed manually, please check your app using the click-review command');
      expect(reviewStub).to.have.been.calledOnce;
      expect(this.lockAcquireSpy).to.have.been.calledOnce;
      expect(this.lockReleaseSpy).to.have.been.calledOnce;
    });

    it('fails if not a click', async function() {
      const res = await this.post(this.route)
        .attach('file', this.notAClick)
        .field('channel', Channel.XENIAL)
        .expect(400);

      expect(res.body.success).to.be.false;
      expect(res.body.message).to.equal('The file must be a click package');
      expect(this.lockAcquireSpy).to.have.been.calledOnce;
      expect(this.lockReleaseSpy).to.have.been.calledOnce;
    });

    it('fails with a different package id from file', async function() {
      const reviewStub = this.sandbox.stub(reviewPackage, 'review').resolves(false);
      const parseStub = this.sandbox.stub(clickParser, 'parsePackage').resolves({
        name: 'foo',
        version: '1.0.0',
        architecture: 'armhf',
      });

      const res = await this.post(this.route)
        .attach('file', this.emptyClick)
        .field('channel', Channel.XENIAL)
        .expect(400);

      expect(res.body.success).to.be.false;
      expect(res.body.message).to.equal('The uploaded package does not match the name of the package you are editing');
      expect(reviewStub).to.have.been.calledOnce;
      expect(parseStub).to.have.been.calledOnce;
      expect(this.lockAcquireSpy).to.have.been.calledOnce;
      expect(this.lockReleaseSpy).to.have.been.calledOnce;
    });

    it('fails with a malformed manifest', async function() {
      const reviewStub = this.sandbox.stub(reviewPackage, 'review').resolves(false);
      const parseStub = this.sandbox.stub(clickParser, 'parsePackage').resolves({});

      const res = await this.post(this.route)
        .attach('file', this.emptyClick)
        .field('channel', Channel.XENIAL)
        .expect(400);

      expect(res.body.success).to.be.false;
      expect(res.body.message).to.equal('Your package manifest is malformed');
      expect(reviewStub).to.have.been.calledOnce;
      expect(parseStub).to.have.been.calledOnce;
      expect(this.lockAcquireSpy).to.have.been.calledOnce;
      expect(this.lockReleaseSpy).to.have.been.calledOnce;
    });

    it('fails with an existing version of the same arch', async function() {
      this.package.newRevision('1.0.0', Channel.XENIAL, Architecture.ARMHF, 'ubuntu-sdk-16.04', 'url', 'shasum', 10);
      await this.package.save();

      const reviewStub = this.sandbox.stub(reviewPackage, 'review').resolves(false);
      const parseStub = this.sandbox.stub(clickParser, 'parsePackage').resolves({
        name: this.package.id,
        version: '1.0.0',
        architecture: Architecture.ARMHF,
        framework: 'ubuntu-sdk-16.04',
        apps: [],
      });

      const res = await this.post(this.route)
        .attach('file', this.emptyClick)
        .field('channel', Channel.XENIAL)
        .expect(400);

      expect(res.body.success).to.be.false;
      expect(res.body.message).to.equal('A revision already exists with this version and architecture');
      expect(reviewStub).to.have.been.calledOnce;
      expect(parseStub).to.have.been.calledOnce;
      expect(this.lockAcquireSpy).to.have.been.calledOnce;
      expect(this.lockReleaseSpy).to.have.been.calledOnce;
    });

    it('does not fail with an existing version of a different arch', async function() {
      this.package.newRevision('1.0.0', Channel.XENIAL, Architecture.ARM64, 'ubuntu-sdk-16.04', 'url', 'shasum', 10);
      this.package.architectures = [Architecture.ARM64];
      await this.package.save();

      const reviewStub = this.sandbox.stub(reviewPackage, 'review').resolves(false);
      const parseStub = this.sandbox.stub(clickParser, 'parsePackage').resolves({
        name: this.package.id,
        version: '1.0.0',
        architecture: Architecture.ARMHF,
        framework: 'ubuntu-sdk-16.04',
        apps: [],
      });

      const res = await this.post(this.route)
        .attach('file', this.emptyClick)
        .field('channel', Channel.XENIAL)
        .expect(200);

      const data = res.body.data;
      expect(res.body.success).to.be.true;
      expect(data.revisions).to.be.lengthOf(2);
      expect(data.revisions[1].revision).to.equal(2);
      expect(data.revisions[1].version).to.equal('1.0.0');
      expect(data.revisions[1].channel).to.equal(Channel.XENIAL);
      expect(data.revisions[1].architecture).to.equal(Architecture.ARMHF);
      expect(data.revisions[1].framework).to.equal('ubuntu-sdk-16.04');
      expect(data.architectures).to.be.lengthOf(2);
      expect(data.architectures).to.contain(Architecture.ARMHF);
      expect(data.architectures).to.contain(Architecture.ARM64);
      expect(reviewStub).to.have.been.calledOnce;
      expect(parseStub).to.have.been.calledOnce;
      expect(this.lockAcquireSpy).to.have.been.calledOnce;
      expect(this.lockReleaseSpy).to.have.been.calledOnce;
    });

    it('fails when uploading all with existing armhf', async function() {
      this.package.newRevision('1.0.0', Channel.XENIAL, Architecture.ARMHF, 'ubuntu-sdk-16.04', 'url', 'shasum', 10);
      await this.package.save();

      const reviewStub = this.sandbox.stub(reviewPackage, 'review').resolves(false);
      const parseStub = this.sandbox.stub(clickParser, 'parsePackage').resolves({
        name: this.package.id,
        version: '1.0.0',
        architecture: Architecture.ALL,
        framework: 'ubuntu-sdk-16.04',
        apps: [],
      });

      const res = await this.post(this.route)
        .attach('file', this.emptyClick)
        .field('channel', Channel.XENIAL)
        .expect(400);

      expect(res.body.success).to.be.false;
      expect(res.body.message).to.equal(
        'You cannot upload a click with the architecture "all" for the same version as an architecture specific click',
      );
      expect(reviewStub).to.have.been.calledOnce;
      expect(parseStub).to.have.been.calledOnce;
      expect(this.lockAcquireSpy).to.have.been.calledOnce;
      expect(this.lockReleaseSpy).to.have.been.calledOnce;
    });

    it('fails when uploading armhf with existing all', async function() {
      this.package.newRevision('1.0.0', Channel.XENIAL, Architecture.ALL, 'ubuntu-sdk-16.04', 'url', 'shasum', 10);
      await this.package.save();

      const reviewStub = this.sandbox.stub(reviewPackage, 'review').resolves(false);
      const parseStub = this.sandbox.stub(clickParser, 'parsePackage').resolves({
        name: this.package.id,
        version: '1.0.0',
        architecture: Architecture.ARMHF,
        framework: 'ubuntu-sdk-16.04',
        apps: [],
      });

      const res = await this.post(this.route)
        .attach('file', this.emptyClick)
        .field('channel', Channel.XENIAL)
        .expect(400);

      expect(res.body.success).to.be.false;
      expect(res.body.message).to.equal(
        'You cannot upload and architecture specific click for the same version as a click with the architecture "all"',
      );
      expect(reviewStub).to.have.been.calledOnce;
      expect(parseStub).to.have.been.calledOnce;
      expect(this.lockAcquireSpy).to.have.been.calledOnce;
      expect(this.lockReleaseSpy).to.have.been.calledOnce;
    });

    it('fails when the same version but different arch and framework', async function() {
      this.package.newRevision('1.0.0', Channel.XENIAL, Architecture.ARM64, 'ubuntu-sdk-16.04', 'url', 'shasum', 10);
      await this.package.save();

      const reviewStub = this.sandbox.stub(reviewPackage, 'review').resolves(false);
      const parseStub = this.sandbox.stub(clickParser, 'parsePackage').resolves({
        name: this.package.id,
        version: '1.0.0',
        architecture: Architecture.ARMHF,
        framework: 'ubuntu-sdk-15.04',
        apps: [],
      });

      const res = await this.post(this.route)
        .attach('file', this.emptyClick)
        .field('channel', Channel.XENIAL)
        .expect(400);

      expect(res.body.success).to.be.false;
      expect(res.body.message).to.equal('Framework does not match existing click of a different architecture');
      expect(reviewStub).to.have.been.calledOnce;
      expect(parseStub).to.have.been.calledOnce;
      expect(this.lockAcquireSpy).to.have.been.calledOnce;
      expect(this.lockReleaseSpy).to.have.been.calledOnce;
    });

    it('fails when the app is locked', async function() {
      this.package.locked = true;
      await this.package.save();

      const res = await this.post(this.route)
        .attach('file', this.emptyClick)
        .field('channel', Channel.XENIAL)
        .expect(403);

      expect(res.body.success).to.be.false;
      expect(res.body.message).to.equal('Sorry this app has been locked by an admin');
      expect(this.lockAcquireSpy).to.have.been.calledOnce;
      expect(this.lockReleaseSpy).to.have.been.calledOnce;
    });

    it('sanitizes and updates the changelog', async function() {
      this.package.changelog = 'old changelog';
      await this.package.save();

      const reviewStub = this.sandbox.stub(reviewPackage, 'review').resolves(false);
      const parseStub = this.sandbox.stub(clickParser, 'parsePackage').resolves({
        name: this.package.id,
        version: '1.0.0',
        architecture: 'armhf',
        apps: [],
      });

      const res = await this.post(this.route)
        .attach('file', this.emptyClick)
        .field('channel', Channel.XENIAL)
        .field('changelog', '<script></script> changelog update')
        .expect(200);

      expect(res.body.success).to.be.true;
      expect(reviewStub).to.have.been.calledOnce;
      expect(parseStub).to.have.been.calledOnce;
      expect(this.lockAcquireSpy).to.have.been.calledOnce;
      expect(this.lockReleaseSpy).to.have.been.calledOnce;

      const pkg = await PackageRepo.findOne(this.package.id);
      expect(pkg?.changelog).to.equal('changelog update\n\nold changelog');
    });

    it('successfully reviews/updates/saves a package and icon and updates elasticsearch', async function() {
      this.timeout(5000);

      this.package.published = true;
      this.package.newRevision('0.0.1', Channel.XENIAL, Architecture.ARMHF, 'ubuntu-sdk-16.04', 'url', 'shasum', 10);
      await this.package.save();

      const reviewStub = this.sandbox.stub(reviewPackage, 'review').resolves(false);
      const upsertStub = this.sandbox.stub(PackageSearch, 'upsert');

      const res = await this.post(this.route)
        .attach('file', this.goodClick)
        .field('channel', Channel.XENIAL)
        .expect(200);

      const data = res.body.data;

      expect(data.architectures).to.deep.equal([Architecture.ARMHF]);
      expect(data.author).to.equal('OpenStore Team');
      expect(data.channels).to.deep.equal([Channel.XENIAL]);
      expect(data.framework).to.equal('ubuntu-sdk-16.04');
      expect(data.icon).to.equal('http://local.open-store.io/icons/openstore-test.openstore-team/openstore-test.openstore-team-1.0.0.svg');
      expect(data.published).to.be.true;
      expect(data.manifest).to.be.ok;
      expect(data.tagline).to.equal('OpenStore test app');
      expect(data.version).to.equal('1.0.0');
      expect(data.types).to.deep.equal(['app']);
      expect(data.revisions).to.have.lengthOf(2);
      expect(data.revisions[1].revision).to.equal(2);
      expect(data.revisions[1].version).to.equal('1.0.0');
      expect(data.revisions[1].channel).to.equal(Channel.XENIAL);
      expect(data.revisions[1].architecture).to.equal(Architecture.ARMHF);
      expect(data.revisions[1].framework).to.equal('ubuntu-sdk-16.04');

      expect(reviewStub).to.have.been.calledOnce;
      expect(upsertStub).to.have.been.calledOnce;
      expect(this.lockAcquireSpy).to.have.been.calledOnce;
      expect(this.lockReleaseSpy).to.have.been.calledOnce;
    });

    it('fails gracefully', async function() {
      const findStub = this.sandbox.stub(PackageRepo, 'findOne').rejects();

      const res = await this.post(this.route)
        .attach('file', this.emptyClick)
        .field('channel', Channel.XENIAL)
        .expect(500);

      expect(res.body.success).to.be.false;
      expect(findStub).to.have.been.calledOnce;
      expect(this.lockAcquireSpy).to.have.been.calledOnce;
      expect(this.lockReleaseSpy).to.have.been.calledOnce;
    });

    it('sets the arch to "all" only when switching to a new version (from "arm64")', async function() {
      this.package.newRevision('1.0.0', Channel.XENIAL, Architecture.ARM64, 'ubuntu-sdk-16.04', 'url', 'shasum', 10);
      this.package.architectures = [Architecture.ARM64];
      await this.package.save();

      const reviewStub = this.sandbox.stub(reviewPackage, 'review').resolves(false);
      const parseStub = this.sandbox.stub(clickParser, 'parsePackage').resolves({
        name: this.package.id,
        version: '2.0.0',
        architecture: Architecture.ALL,
        framework: 'ubuntu-sdk-16.04',
        apps: [],
      });

      const res = await this.post(this.route)
        .attach('file', this.emptyClick)
        .field('channel', Channel.XENIAL)
        .expect(200);

      const data = res.body.data;
      expect(res.body.success).to.be.true;
      expect(data.revisions).to.be.lengthOf(2);
      expect(data.architectures).to.be.lengthOf(1);
      expect(data.architectures[0]).to.equal(Architecture.ALL);
      expect(data.downloads).to.be.lengthOf(1);
      expect(data.downloads[0].architecture).to.equal(Architecture.ALL);
      expect(reviewStub).to.have.been.calledOnce;
      expect(parseStub).to.have.been.calledOnce;
      expect(this.lockAcquireSpy).to.have.been.calledOnce;
      expect(this.lockReleaseSpy).to.have.been.calledOnce;
    });

    it('sets the arch to "armhf" only when switching to a new version (from "all")', async function() {
      this.package.newRevision('1.0.0', Channel.XENIAL, Architecture.ALL, 'ubuntu-sdk-16.04', 'url', 'shasum', 10);
      this.package.architectures = [Architecture.ALL];
      await this.package.save();

      const reviewStub = this.sandbox.stub(reviewPackage, 'review').resolves(false);
      const parseStub = this.sandbox.stub(clickParser, 'parsePackage').resolves({
        name: this.package.id,
        version: '2.0.0',
        architecture: Architecture.ARMHF,
        framework: 'ubuntu-sdk-16.04',
        apps: [],
      });

      const res = await this.post(this.route)
        .attach('file', this.emptyClick)
        .field('channel', Channel.XENIAL)
        .expect(200);

      const data = res.body.data;
      expect(res.body.success).to.be.true;
      expect(data.revisions).to.be.lengthOf(2);
      expect(data.architectures).to.be.lengthOf(1);
      expect(data.architectures[0]).to.equal(Architecture.ARMHF);
      expect(data.downloads).to.be.lengthOf(1);
      expect(data.downloads[0].architecture).to.equal(Architecture.ARMHF);
      expect(reviewStub).to.have.been.calledOnce;
      expect(parseStub).to.have.been.calledOnce;
      expect(this.lockAcquireSpy).to.have.been.calledOnce;
      expect(this.lockReleaseSpy).to.have.been.calledOnce;
    });

    // TODO test pkg.updateFromClick
  });

  context('locks', () => {
    it('waits for a lock', async function() {
      this.timeout(5000);

      const now = Date.now();
      const lock = new Lock({
        name: `revision-${this.package.id}`,
        expire: now + (1 * 1000), // 1 second in the future
        inserted: now,
      });
      await lock.save();

      const saveSpy = this.sandbox.spy(Lock.prototype, 'save');
      const parseStub = this.sandbox.stub(clickParser, 'parsePackage').resolves({
        name: this.package.id,
        version: '1.0.0',
        architecture: 'armhf',
        apps: [],
      });

      const res = await this.post(this.route)
        .attach('file', this.emptyClick)
        .field('channel', Channel.XENIAL)
        .field('changelog', '<script></script> changelog update')
        .expect(200);

      expect(res.body.success).to.be.true;
      expect(parseStub).to.have.been.calledOnce;
      expect(this.lockAcquireSpy).to.have.been.calledOnce;
      expect(this.lockReleaseSpy).to.have.been.calledOnce;

      // Should attempt to save the new lock multiple times
      expect(saveSpy.callCount).to.be.greaterThan(1);
    });

    it('does not clobber existing data', async function() {
      this.timeout(5000);

      const armhfRevision = this.post(this.route)
        .attach('file', this.goodClick)
        .field('channel', Channel.XENIAL)
        .expect(200);

      const arm64Revision = this.post(this.route)
        .attach('file', this.good64Click)
        .field('channel', Channel.XENIAL)
        .expect(200);

      const [arm64Res] = await Promise.all([arm64Revision, armhfRevision]);

      const data = arm64Res.body.data;
      expect(data.revisions).to.have.lengthOf(2);
      expect(data.revisions[0].architecture).to.equal(Architecture.ARMHF);
      expect(data.revisions[1].architecture).to.equal(Architecture.ARM64);

      expect(this.lockAcquireSpy).to.have.been.calledTwice;
      expect(this.lockReleaseSpy).to.have.been.calledTwice;
    });
  });
});