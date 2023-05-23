import path from 'path';
import { Package } from 'db/package';
import { Architecture, Channel } from 'db/package/types';
import { Lock } from 'db/lock';
import * as reviewPackage from 'utils/review-package';
import * as clickParser from 'utils/click-parser-async';
import { packageSearchInstance } from 'db/package/search';
import * as messages from 'utils/error-messages';
import { expect } from 'tests/helper';
import factory from 'tests/factory';

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
    this.goodClick = path.join(__dirname, '../tests/fixtures/good.click');
    this.good64Click = path.join(__dirname, '../tests/fixtures/good64.click');
    this.emptyClick = path.join(__dirname, '../tests/fixtures/empty.click');
    this.notAClick = path.join(__dirname, '../tests/fixtures/notaclick.txt');

    this.lockAcquireSpy = this.sandbox.spy(Lock, 'acquire');
    this.lockReleaseSpy = this.sandbox.spy(Lock, 'release');
  });

  it('blocks access when not logged in', async function() {
    await this.post(this.route, false).expect(401);
  });

  context('admin user', () => {
    it('allows access to other packages', async function() {
      const reviewStub = this.sandbox.stub(reviewPackage, 'clickReview').resolves(GOOD_REVIEW);
      const parseStub = this.sandbox.stub(clickParser, 'parseClickPackage').resolves({
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
      expect(reviewStub).to.have.been.calledOnce;
      expect(this.lockAcquireSpy).to.have.been.calledOnce;
      expect(this.lockReleaseSpy).to.have.been.calledOnce;
    });

    it('does not fail for manual review', async function() {
      const reviewStub = this.sandbox.stub(reviewPackage, 'clickReview').resolves(MANUAL_REVIEW);
      const parseStub = this.sandbox.stub(clickParser, 'parseClickPackage').resolves({
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
      expect(reviewStub).to.have.been.calledOnce;
      expect(parseStub).to.have.been.calledOnce;
      expect(this.lockAcquireSpy).to.have.been.calledOnce;
      expect(this.lockReleaseSpy).to.have.been.calledOnce;
    });

    it('skips review if configured', async function() {
      this.package.skip_review = true;
      await this.package.save();

      const reviewSpy = this.sandbox.spy(reviewPackage, 'clickReview');
      const parseStub = this.sandbox.stub(clickParser, 'parseClickPackage').resolves({
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
      expect(reviewSpy).not.to.have.been.calledOnce;
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

    it('does not fail for manual review', async function() {
      const reviewStub = this.sandbox.stub(reviewPackage, 'clickReview').resolves(MANUAL_REVIEW);
      const parseStub = this.sandbox.stub(clickParser, 'parseClickPackage').resolves({
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
      expect(reviewStub).to.have.been.calledOnce;
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

      expect(res.body.message).to.equal(messages.NO_FILE);
      expect(this.lockAcquireSpy).to.have.not.been.called;
      expect(this.lockReleaseSpy).to.have.not.been.called;
    });

    it('fails with invalid channel', async function() {
      const res = await this.post(this.route)
        .attach('file', this.emptyClick)
        .field('channel', 'vivid')
        .expect(400);

      expect(res.body.message).to.equal(messages.INVALID_CHANNEL);
      expect(this.lockAcquireSpy).to.have.not.been.called;
      expect(this.lockReleaseSpy).to.have.not.been.called;
    });

    it('fails with bad id', async function() {
      const res = await this.post('/api/v3/manage/foo/revision')
        .attach('file', this.emptyClick)
        .field('channel', Channel.XENIAL)
        .expect(404);

      expect(res.body.message).to.equal(messages.APP_NOT_FOUND);
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

    it('needs manual review', async function() {
      const reviewStub = this.sandbox.stub(reviewPackage, 'clickReview').resolves(MANUAL_REVIEW);

      const res = await this.post(this.route)
        .attach('file', this.emptyClick)
        .field('channel', Channel.XENIAL)
        .expect(400);

      expect(res.body.success).to.be.false;
      expect(res.body.message).to.equal(messages.NEEDS_MANUAL_REVIEW);
      expect(res.body.data?.reasons).to.have.lengthOf(MANUAL_REVIEW.manualReviewMessages.length);
      expect(res.body.data?.reasons[0]).to.equal(MANUAL_REVIEW.manualReviewMessages[0]);
      expect(reviewStub).to.have.been.calledOnce;
      expect(this.lockAcquireSpy).to.have.been.calledOnce;
      expect(this.lockReleaseSpy).to.have.been.calledOnce;
    });

    it('fail review because of other errors', async function() {
      const reviewStub = this.sandbox.stub(reviewPackage, 'clickReview').resolves(ERROR_REVIEW);

      const res = await this.post(this.route)
        .attach('file', this.emptyClick)
        .field('channel', Channel.XENIAL)
        .expect(400);

      expect(res.body.success).to.be.false;
      expect(res.body.message).to.equal(messages.CLICK_REVIEW_ERROR);
      expect(res.body.data?.reasons).to.have.lengthOf(ERROR_REVIEW.errorMessages.length);
      expect(res.body.data?.reasons[0]).to.equal(ERROR_REVIEW.errorMessages[0]);
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
      expect(res.body.message).to.equal(messages.BAD_FILE);
      expect(this.lockAcquireSpy).to.have.been.calledOnce;
      expect(this.lockReleaseSpy).to.have.been.calledOnce;
    });

    it('fails with a different package id from file', async function() {
      const reviewStub = this.sandbox.stub(reviewPackage, 'clickReview').resolves(GOOD_REVIEW);
      const parseStub = this.sandbox.stub(clickParser, 'parseClickPackage').resolves({
        name: 'foo',
        version: '1.0.0',
        architecture: 'armhf',
      });

      const res = await this.post(this.route)
        .attach('file', this.emptyClick)
        .field('channel', Channel.XENIAL)
        .expect(400);

      expect(res.body.success).to.be.false;
      expect(res.body.message).to.equal(messages.WRONG_PACKAGE);
      expect(reviewStub).to.have.been.calledOnce;
      expect(parseStub).to.have.been.calledOnce;
      expect(this.lockAcquireSpy).to.have.been.calledOnce;
      expect(this.lockReleaseSpy).to.have.been.calledOnce;
    });

    it('fails with a malformed manifest', async function() {
      const reviewStub = this.sandbox.stub(reviewPackage, 'clickReview').resolves(GOOD_REVIEW);
      const parseStub = this.sandbox.stub(clickParser, 'parseClickPackage').resolves({});

      const res = await this.post(this.route)
        .attach('file', this.emptyClick)
        .field('channel', Channel.XENIAL)
        .expect(400);

      expect(res.body.success).to.be.false;
      expect(res.body.message).to.equal(messages.MALFORMED_MANIFEST);
      expect(reviewStub).to.have.been.calledOnce;
      expect(parseStub).to.have.been.calledOnce;
      expect(this.lockAcquireSpy).to.have.been.calledOnce;
      expect(this.lockReleaseSpy).to.have.been.calledOnce;
    });

    it('fails with an existing version of the same arch', async function() {
      this.package.createNextRevision('1.0.0', Channel.XENIAL, Architecture.ARMHF, 'ubuntu-sdk-16.04', 'url', 'shasum', 10, 8);
      await this.package.save();

      const reviewStub = this.sandbox.stub(reviewPackage, 'clickReview').resolves(GOOD_REVIEW);
      const parseStub = this.sandbox.stub(clickParser, 'parseClickPackage').resolves({
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
      expect(res.body.message).to.equal(messages.EXISTING_VERSION);
      expect(reviewStub).to.have.been.calledOnce;
      expect(parseStub).to.have.been.calledOnce;
      expect(this.lockAcquireSpy).to.have.been.calledOnce;
      expect(this.lockReleaseSpy).to.have.been.calledOnce;
    });

    it('does not fail with an existing version of a different arch', async function() {
      this.package.createNextRevision('1.0.0', Channel.XENIAL, Architecture.ARM64, 'ubuntu-sdk-16.04', 'url', 'shasum', 10, 8);
      this.package.architectures = [Architecture.ARM64];
      await this.package.save();

      const reviewStub = this.sandbox.stub(reviewPackage, 'clickReview').resolves(GOOD_REVIEW);
      const parseStub = this.sandbox.stub(clickParser, 'parseClickPackage').resolves({
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
      this.package.createNextRevision('1.0.0', Channel.XENIAL, Architecture.ARMHF, 'ubuntu-sdk-16.04', 'url', 'shasum', 10, 8);
      await this.package.save();

      const reviewStub = this.sandbox.stub(reviewPackage, 'clickReview').resolves(GOOD_REVIEW);
      const parseStub = this.sandbox.stub(clickParser, 'parseClickPackage').resolves({
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
      this.package.createNextRevision('1.0.0', Channel.XENIAL, Architecture.ALL, 'ubuntu-sdk-16.04', 'url', 'shasum', 10, 8);
      await this.package.save();

      const reviewStub = this.sandbox.stub(reviewPackage, 'clickReview').resolves(GOOD_REVIEW);
      const parseStub = this.sandbox.stub(clickParser, 'parseClickPackage').resolves({
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
      this.package.createNextRevision('1.0.0', Channel.XENIAL, Architecture.ARM64, 'ubuntu-sdk-16.04', 'url', 'shasum', 10, 8);
      await this.package.save();

      const reviewStub = this.sandbox.stub(reviewPackage, 'clickReview').resolves(GOOD_REVIEW);
      const parseStub = this.sandbox.stub(clickParser, 'parseClickPackage').resolves({
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
      expect(res.body.message).to.equal(messages.MISMATCHED_FRAMEWORK);
      expect(reviewStub).to.have.been.calledOnce;
      expect(parseStub).to.have.been.calledOnce;
      expect(this.lockAcquireSpy).to.have.been.calledOnce;
      expect(this.lockReleaseSpy).to.have.been.calledOnce;
    });

    it('fails when the same version but different arch and permissions', async function() {
      this.package.createNextRevision(
        '1.0.0',
        Channel.XENIAL,
        Architecture.ARM64,
        'ubuntu-sdk-16.04',
        'url',
        'shasum',
        10,
        8,
        ['permission1', 'permission2'],
      );
      await this.package.save();

      const reviewStub = this.sandbox.stub(reviewPackage, 'clickReview').resolves(GOOD_REVIEW);
      const parseStub = this.sandbox.stub(clickParser, 'parseClickPackage').resolves({
        name: this.package.id,
        version: '1.0.0',
        architecture: Architecture.ARMHF,
        framework: 'ubuntu-sdk-16.04',
        apps: [],
        permissions: ['permission1', 'permission3'],
      });

      const res = await this.post(this.route)
        .attach('file', this.emptyClick)
        .field('channel', Channel.XENIAL)
        .expect(400);

      expect(res.body.success).to.be.false;
      expect(res.body.message).to.equal(messages.MISMATCHED_PERMISSIONS);
      expect(reviewStub).to.have.been.calledOnce;
      expect(parseStub).to.have.been.calledOnce;
      expect(this.lockAcquireSpy).to.have.been.calledOnce;
      expect(this.lockReleaseSpy).to.have.been.calledOnce;
    });

    it('passes when the same version but different framework and channel', async function() {
      this.package.createNextRevision(
        '1.0.0',
        Channel.XENIAL,
        Architecture.ARM64,
        'ubuntu-sdk-16.04',
        'url',
        'shasum',
        10,
        8,
        ['permission1', 'permission2'],
      );
      await this.package.save();

      const reviewStub = this.sandbox.stub(reviewPackage, 'clickReview').resolves(GOOD_REVIEW);
      const parseStub = this.sandbox.stub(clickParser, 'parseClickPackage').resolves({
        name: this.package.id,
        version: '1.0.0',
        architecture: Architecture.ARM64,
        framework: 'ubuntu-sdk-20.04',
        apps: [],
        permissions: ['permission1', 'permission2'],
      });

      const res = await this.post(this.route)
        .attach('file', this.emptyClick)
        .field('channel', Channel.FOCAL)
        .expect(200);

      expect(res.body.success).to.be.true;
      expect(reviewStub).to.have.been.calledOnce;
      expect(parseStub).to.have.been.calledOnce;
      expect(this.lockAcquireSpy).to.have.been.calledOnce;
      expect(this.lockReleaseSpy).to.have.been.calledOnce;
    });

    it('passes when the same version but different framework and channel (existing version does not have permissions)', async function() {
      this.package.createNextRevision(
        '1.0.0',
        Channel.XENIAL,
        Architecture.ARM64,
        'ubuntu-sdk-16.04',
        'url',
        'shasum',
        10,
        8,
        [],
      );
      await this.package.save();

      const reviewStub = this.sandbox.stub(reviewPackage, 'clickReview').resolves(GOOD_REVIEW);
      const parseStub = this.sandbox.stub(clickParser, 'parseClickPackage').resolves({
        name: this.package.id,
        version: '1.0.0',
        architecture: Architecture.ARM64,
        framework: 'ubuntu-sdk-20.04',
        apps: [],
        permissions: ['permission1', 'permission2'],
      });

      const res = await this.post(this.route)
        .attach('file', this.emptyClick)
        .field('channel', Channel.FOCAL)
        .expect(200);

      expect(res.body.success).to.be.true;
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
      expect(res.body.message).to.equal(messages.APP_LOCKED);
      expect(this.lockAcquireSpy).to.have.been.calledOnce;
      expect(this.lockReleaseSpy).to.have.been.calledOnce;
    });

    it('sanitizes and updates the changelog', async function() {
      this.package.changelog = 'old changelog';
      await this.package.save();

      const reviewStub = this.sandbox.stub(reviewPackage, 'clickReview').resolves(GOOD_REVIEW);
      const parseStub = this.sandbox.stub(clickParser, 'parseClickPackage').resolves({
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

      const pkg = await Package.findOneByFilters(this.package.id);
      expect(pkg?.changelog).to.equal('changelog update\n\nold changelog');
    });

    it('successfully reviews/updates/saves a package and icon and updates elasticsearch', async function() {
      this.timeout(5000);

      this.package.published = true;
      this.package.createNextRevision('0.0.1', Channel.XENIAL, Architecture.ARMHF, 'ubuntu-sdk-16.04', 'url', 'shasum', 10, 8);
      await this.package.save();

      const reviewStub = this.sandbox.stub(reviewPackage, 'clickReview').resolves(GOOD_REVIEW);
      const upsertStub = this.sandbox.stub(packageSearchInstance, 'upsert');

      const res = await this.post(this.route)
        .attach('file', this.goodClick)
        .field('channel', Channel.XENIAL)
        .expect(200);

      const data = res.body.data;

      expect(data.architectures).to.deep.equal([Architecture.ARMHF]);
      expect(data.author).not.to.equal('OpenStore Team'); // The click no longer updates the author name
      expect(data.channels).to.deep.equal([Channel.XENIAL]);
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
      const findStub = this.sandbox.stub(Package, 'findOneByFilters').rejects();

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
      this.package.createNextRevision('1.0.0', Channel.XENIAL, Architecture.ARM64, 'ubuntu-sdk-16.04', 'url', 'shasum', 10, 8);
      this.package.architectures = [Architecture.ARM64];
      await this.package.save();

      const reviewStub = this.sandbox.stub(reviewPackage, 'clickReview').resolves(GOOD_REVIEW);
      const parseStub = this.sandbox.stub(clickParser, 'parseClickPackage').resolves({
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
      this.package.createNextRevision('1.0.0', Channel.XENIAL, Architecture.ALL, 'ubuntu-sdk-16.04', 'url', 'shasum', 10, 8);
      this.package.architectures = [Architecture.ALL];
      await this.package.save();

      const reviewStub = this.sandbox.stub(reviewPackage, 'clickReview').resolves(GOOD_REVIEW);
      const parseStub = this.sandbox.stub(clickParser, 'parseClickPackage').resolves({
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

    it('does not skip review for a non-admin user', async function() {
      this.package.skip_review = true;
      this.package.save();

      const reviewStub = this.sandbox.stub(reviewPackage, 'clickReview').resolves(GOOD_REVIEW);
      const parseStub = this.sandbox.stub(clickParser, 'parseClickPackage').resolves({
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
      expect(reviewStub).to.have.been.calledOnce;
      expect(parseStub).to.have.been.calledOnce;
      expect(this.lockAcquireSpy).to.have.been.calledOnce;
      expect(this.lockReleaseSpy).to.have.been.calledOnce;
    });
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
      const reviewStub = this.sandbox.stub(reviewPackage, 'clickReview').resolves(GOOD_REVIEW);
      const parseStub = this.sandbox.stub(clickParser, 'parseClickPackage').resolves({
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
      expect(reviewStub).to.have.been.calledOnce;
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
