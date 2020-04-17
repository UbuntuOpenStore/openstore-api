const path = require('path');
const {factory} = require('factory-girl');

const {expect} = require('./helper');
const Package = require('../src/db/package/model');
const PackageRepo = require('../src/db/package/repo');
const Lock = require('../src/db/lock/model');
const LockRepo = require('../src/db/lock/repo');
const reviewPackage = require('../src/utils/review-package');
const clickParser = require('../src/utils/click-parser-async');
const PackageSearch = require('../src/db/package/search');

describe('Manage Revision POST', () => {
    beforeEach(async function() {
        [this.package, this.package2] = await Promise.all([
            /* eslint-disable no-underscore-dangle */
            factory.create('package', {
                maintainer: this.user._id,
                name: 'OpenStore Test',
                id: 'openstore-test.openstore-team',
            }),
            factory.create('package'),
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
            let parseStub = this.sandbox.stub(clickParser, 'parse').resolves({
                name: this.package2.id,
                version: '1.0.0',
                architecture: 'armhf',
                apps: [],
            });

            let res = await this.post(`/api/v3/manage/${this.package2.id}/revision`)
                .attach('file', this.emptyClick)
                .field('channel', Package.XENIAL)
                .expect(200);

            expect(res.body.success).to.be.true;
            expect(parseStub).to.have.been.calledOnce;
            expect(this.lockAcquireSpy).to.have.been.calledOnce;
            expect(this.lockReleaseSpy).to.have.been.calledOnce;
        });

        it('does not review', async function() {
            let reviewSpy = this.sandbox.spy(reviewPackage, 'review');
            let parseStub = this.sandbox.stub(clickParser, 'parse').resolves({
                name: this.package.id,
                version: '1.0.0',
                architecture: 'armhf',
                apps: [],
            });

            let res = await this.post(this.route)
                .attach('file', this.emptyClick)
                .field('channel', Package.XENIAL)
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
            let reviewSpy = this.sandbox.spy(reviewPackage, 'review');
            let parseStub = this.sandbox.stub(clickParser, 'parse').resolves({
                name: this.package.id,
                version: '1.0.0',
                architecture: 'armhf',
                apps: [],
            });

            let res = await this.post(this.route)
                .attach('file', this.emptyClick)
                .field('channel', Package.XENIAL)
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
            let res = await this.post(this.route)
                .expect(400);

            expect(res.body.message).to.equal('No file upload specified');
            expect(this.lockAcquireSpy).to.have.not.been.called;
            expect(this.lockReleaseSpy).to.have.not.been.called;
        });

        it('fails with invalid channel', async function() {
            let res = await this.post(this.route)
                .attach('file', this.emptyClick)
                .field('channel', 'vivid')
                .expect(400);

            expect(res.body.message).to.equal('The provided channel is not valid');
            expect(this.lockAcquireSpy).to.have.not.been.called;
            expect(this.lockReleaseSpy).to.have.not.been.called;
        });

        it('fails with bad id', async function() {
            let res = await this.post('/api/v3/manage/foo/revision')
                .attach('file', this.emptyClick)
                .field('channel', Package.XENIAL)
                .expect(404);

            expect(res.body.message).to.equal('App not found');
            expect(this.lockAcquireSpy).to.have.been.calledOnce;
            expect(this.lockReleaseSpy).to.have.been.calledOnce;
        });

        it('does not allow access to other packages', async function() {
            await this.post(`/api/v3/manage/${this.package2.id}/revision`)
                .attach('file', this.emptyClick)
                .field('channel', Package.XENIAL)
                .expect(403);

            expect(this.lockAcquireSpy).to.have.been.calledOnce;
            expect(this.lockReleaseSpy).to.have.been.calledOnce;
        });

        it('fails review', async function() {
            let reviewStub = this.sandbox.stub(reviewPackage, 'review').resolves("'unconfined' not allowed");

            let res = await this.post(this.route)
                .attach('file', this.emptyClick)
                .field('channel', Package.XENIAL)
                .expect(400);

            expect(res.body.success).to.be.false;
            expect(res.body.message).to.equal("This app needs to be reviewed manually (Error: 'unconfined' not allowed)");
            expect(reviewStub).to.have.been.calledOnce;
            expect(this.lockAcquireSpy).to.have.been.calledOnce;
            expect(this.lockReleaseSpy).to.have.been.calledOnce;
        });

        it('fails if not a click', async function() {
            let res = await this.post(this.route)
                .attach('file', this.notAClick)
                .field('channel', Package.XENIAL)
                .expect(400);

            expect(res.body.success).to.be.false;
            expect(res.body.message).to.equal('The file must be a click package');
            expect(this.lockAcquireSpy).to.have.been.calledOnce;
            expect(this.lockReleaseSpy).to.have.been.calledOnce;
        });

        it('fails with a different package id from file', async function() {
            let reviewStub = this.sandbox.stub(reviewPackage, 'review').resolves(false);
            let parseStub = this.sandbox.stub(clickParser, 'parse').resolves({
                name: 'foo',
                version: '1.0.0',
                architecture: 'armhf',
            });

            let res = await this.post(this.route)
                .attach('file', this.emptyClick)
                .field('channel', Package.XENIAL)
                .expect(400);

            expect(res.body.success).to.be.false;
            expect(res.body.message).to.equal('The uploaded package does not match the name of the package you are editing');
            expect(reviewStub).to.have.been.calledOnce;
            expect(parseStub).to.have.been.calledOnce;
            expect(this.lockAcquireSpy).to.have.been.calledOnce;
            expect(this.lockReleaseSpy).to.have.been.calledOnce;
        });

        it('fails with a malformed manifest', async function() {
            let reviewStub = this.sandbox.stub(reviewPackage, 'review').resolves(false);
            let parseStub = this.sandbox.stub(clickParser, 'parse').resolves({});

            let res = await this.post(this.route)
                .attach('file', this.emptyClick)
                .field('channel', Package.XENIAL)
                .expect(400);

            expect(res.body.success).to.be.false;
            expect(res.body.message).to.equal('Your package manifest is malformed');
            expect(reviewStub).to.have.been.calledOnce;
            expect(parseStub).to.have.been.calledOnce;
            expect(this.lockAcquireSpy).to.have.been.calledOnce;
            expect(this.lockReleaseSpy).to.have.been.calledOnce;
        });

        it('fails with an existing version of the same arch', async function() {
            this.package.newRevision('1.0.0', Package.XENIAL, Package.ARMHF, 'ubuntu-sdk-16.04', 'url', 'shasum', 10);
            await this.package.save();

            let reviewStub = this.sandbox.stub(reviewPackage, 'review').resolves(false);
            let parseStub = this.sandbox.stub(clickParser, 'parse').resolves({
                name: this.package.id,
                version: '1.0.0',
                architecture: Package.ARMHF,
                framework: 'ubuntu-sdk-16.04',
                apps: [],
            });

            let res = await this.post(this.route)
                .attach('file', this.emptyClick)
                .field('channel', Package.XENIAL)
                .expect(400);

            expect(res.body.success).to.be.false;
            expect(res.body.message).to.equal('A revision already exists with this version and architecture');
            expect(reviewStub).to.have.been.calledOnce;
            expect(parseStub).to.have.been.calledOnce;
            expect(this.lockAcquireSpy).to.have.been.calledOnce;
            expect(this.lockReleaseSpy).to.have.been.calledOnce;
        });

        it('does not fail with an existing version of a different arch', async function () {
            this.package.newRevision('1.0.0', Package.XENIAL, Package.ARM64, 'ubuntu-sdk-16.04', 'url', 'shasum', 10);
            this.package.architectures = [Package.ARM64];
            await this.package.save();

            let reviewStub = this.sandbox.stub(reviewPackage, 'review').resolves(false);
            let parseStub = this.sandbox.stub(clickParser, 'parse').resolves({
                name: this.package.id,
                version: '1.0.0',
                architecture: Package.ARMHF,
                framework: 'ubuntu-sdk-16.04',
                apps: [],
            });

            let res = await this.post(this.route)
                .attach('file', this.emptyClick)
                .field('channel', Package.XENIAL)
                .expect(200);

            let data = res.body.data;
            expect(res.body.success).to.be.true;
            expect(data.revisions).to.be.lengthOf(2);
            expect(data.revisions[1].revision).to.equal(2);
            expect(data.revisions[1].version).to.equal('1.0.0');
            expect(data.revisions[1].channel).to.equal(Package.XENIAL);
            expect(data.revisions[1].architecture).to.equal(Package.ARMHF);
            expect(data.revisions[1].framework).to.equal('ubuntu-sdk-16.04');
            expect(data.architectures).to.be.lengthOf(2);
            expect(data.architectures).to.contain(Package.ARMHF);
            expect(data.architectures).to.contain(Package.ARM64);
            expect(reviewStub).to.have.been.calledOnce;
            expect(parseStub).to.have.been.calledOnce;
            expect(this.lockAcquireSpy).to.have.been.calledOnce;
            expect(this.lockReleaseSpy).to.have.been.calledOnce;
        });

        it('fails when uploading all with existing armhf', async function () {
            this.package.newRevision('1.0.0', Package.XENIAL, Package.ARMHF, 'ubuntu-sdk-16.04', 'url', 'shasum', 10);
            await this.package.save();

            let reviewStub = this.sandbox.stub(reviewPackage, 'review').resolves(false);
            let parseStub = this.sandbox.stub(clickParser, 'parse').resolves({
                name: this.package.id,
                version: '1.0.0',
                architecture: Package.ALL,
                framework: 'ubuntu-sdk-16.04',
                apps: [],
            });

            let res = await this.post(this.route)
                .attach('file', this.emptyClick)
                .field('channel', Package.XENIAL)
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

        it('fails when uploading armhf with existing all', async function () {
            this.package.newRevision('1.0.0', Package.XENIAL, Package.ALL, 'ubuntu-sdk-16.04', 'url', 'shasum', 10);
            await this.package.save();

            let reviewStub = this.sandbox.stub(reviewPackage, 'review').resolves(false);
            let parseStub = this.sandbox.stub(clickParser, 'parse').resolves({
                name: this.package.id,
                version: '1.0.0',
                architecture: Package.ARMHF,
                framework: 'ubuntu-sdk-16.04',
                apps: [],
            });

            let res = await this.post(this.route)
                .attach('file', this.emptyClick)
                .field('channel', Package.XENIAL)
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

        it('fails when the same version but different arch and framework', async function () {
            this.package.newRevision('1.0.0', Package.XENIAL, Package.ARM64, 'ubuntu-sdk-16.04', 'url', 'shasum', 10);
            await this.package.save();

            let reviewStub = this.sandbox.stub(reviewPackage, 'review').resolves(false);
            let parseStub = this.sandbox.stub(clickParser, 'parse').resolves({
                name: this.package.id,
                version: '1.0.0',
                architecture: Package.ARMHF,
                framework: 'ubuntu-sdk-15.04',
                apps: [],
            });

            let res = await this.post(this.route)
                .attach('file', this.emptyClick)
                .field('channel', Package.XENIAL)
                .expect(400);

            expect(res.body.success).to.be.false;
            expect(res.body.message).to.equal('Framework does not match existing click of a different architecture');
            expect(reviewStub).to.have.been.calledOnce;
            expect(parseStub).to.have.been.calledOnce;
            expect(this.lockAcquireSpy).to.have.been.calledOnce;
            expect(this.lockReleaseSpy).to.have.been.calledOnce;
        });

        it('sanitizes and updates the changelog', async function() {
            this.package.changelog = 'old changelog';
            await this.package.save();

            let reviewStub = this.sandbox.stub(reviewPackage, 'review').resolves(false);
            let parseStub = this.sandbox.stub(clickParser, 'parse').resolves({
                name: this.package.id,
                version: '1.0.0',
                architecture: 'armhf',
                apps: [],
            });

            let res = await this.post(this.route)
                .attach('file', this.emptyClick)
                .field('channel', Package.XENIAL)
                .field('changelog', '<script></script> changelog update')
                .expect(200);

            expect(res.body.success).to.be.true;
            expect(reviewStub).to.have.been.calledOnce;
            expect(parseStub).to.have.been.calledOnce;
            expect(this.lockAcquireSpy).to.have.been.calledOnce;
            expect(this.lockReleaseSpy).to.have.been.calledOnce;

            let pkg = await PackageRepo.findOne(this.package.id);
            expect(pkg.changelog).to.equal('changelog update\n\nold changelog');
        });

        it('successfully reviews/updates/saves a package and icon and updates elasticsearch', async function() {
            this.timeout(5000);

            this.package.published = true;
            this.package.newRevision('0.0.1', Package.XENIAL, Package.ARMHF, 'ubuntu-sdk-16.04', 'url', 'shasum', 10);
            await this.package.save();

            let reviewStub = this.sandbox.stub(reviewPackage, 'review').resolves(false);
            let upsertStub = this.sandbox.stub(PackageSearch, 'upsert');

            let res = await this.post(this.route)
                .attach('file', this.goodClick)
                .field('channel', Package.XENIAL)
                .expect(200);

            let data = res.body.data;

            expect(data.architectures).to.deep.equal([Package.ARMHF]);
            expect(data.author).to.equal('OpenStore Team');
            expect(data.channels).to.deep.equal([Package.XENIAL]);
            expect(data.framework).to.equal('ubuntu-sdk-16.04');
            expect(data.icon).to.equal('http://local.open-store.io/api/v3/apps/openstore-test.openstore-team/icon/1.0.0.svg');
            expect(data.permissions).to.deep.equal(['networking']);
            expect(data.published).to.be.true;
            expect(data.manifest).to.be.ok;
            expect(data.tagline).to.equal('OpenStore test app');
            expect(data.version).to.equal('1.0.0');
            expect(data.types).to.deep.equal(['app']);
            expect(data.revisions).to.have.lengthOf(2);
            expect(data.revisions[1].revision).to.equal(2);
            expect(data.revisions[1].version).to.equal('1.0.0');
            expect(data.revisions[1].channel).to.equal(Package.XENIAL);
            expect(data.revisions[1].architecture).to.equal(Package.ARMHF);
            expect(data.revisions[1].framework).to.equal('ubuntu-sdk-16.04');

            expect(reviewStub).to.have.been.calledOnce;
            expect(upsertStub).to.have.been.calledOnce;
            expect(this.lockAcquireSpy).to.have.been.calledOnce;
            expect(this.lockReleaseSpy).to.have.been.calledOnce;
        });

        it('fails gracefully', async function() {
            let findStub = this.sandbox.stub(PackageRepo, 'findOne').rejects();

            let res = await this.post(this.route)
                .attach('file', this.emptyClick)
                .field('channel', Package.XENIAL)
                .expect(500);

            expect(res.body.success).to.be.false;
            expect(findStub).to.have.been.calledOnce;
            expect(this.lockAcquireSpy).to.have.been.calledOnce;
            expect(this.lockReleaseSpy).to.have.been.calledOnce;
        });

        it('sets the arch to "all" only when switching to a new version (from "arm64")', async function () {
            this.package.newRevision('1.0.0', Package.XENIAL, Package.ARM64, 'ubuntu-sdk-16.04', 'url', 'shasum', 10);
            this.package.architectures = [Package.ARM64];
            await this.package.save();

            let reviewStub = this.sandbox.stub(reviewPackage, 'review').resolves(false);
            let parseStub = this.sandbox.stub(clickParser, 'parse').resolves({
                name: this.package.id,
                version: '2.0.0',
                architecture: Package.ALL,
                framework: 'ubuntu-sdk-16.04',
                apps: [],
            });

            let res = await this.post(this.route)
                .attach('file', this.emptyClick)
                .field('channel', Package.XENIAL)
                .expect(200);

            let data = res.body.data;
            expect(res.body.success).to.be.true;
            expect(data.revisions).to.be.lengthOf(2);
            expect(data.architectures).to.be.lengthOf(1);
            expect(data.architectures[0]).to.equal(Package.ALL);
            expect(data.downloads).to.be.lengthOf(1);
            expect(data.downloads[0].architecture).to.equal(Package.ALL);
            expect(reviewStub).to.have.been.calledOnce;
            expect(parseStub).to.have.been.calledOnce;
            expect(this.lockAcquireSpy).to.have.been.calledOnce;
            expect(this.lockReleaseSpy).to.have.been.calledOnce;
        });

        it('sets the arch to "armhf" only when switching to a new version (from "all")', async function () {
            this.package.newRevision('1.0.0', Package.XENIAL, Package.ALL, 'ubuntu-sdk-16.04', 'url', 'shasum', 10);
            this.package.architectures = [Package.ALL];
            await this.package.save();

            let reviewStub = this.sandbox.stub(reviewPackage, 'review').resolves(false);
            let parseStub = this.sandbox.stub(clickParser, 'parse').resolves({
                name: this.package.id,
                version: '2.0.0',
                architecture: Package.ARMHF,
                framework: 'ubuntu-sdk-16.04',
                apps: [],
            });

            let res = await this.post(this.route)
                .attach('file', this.emptyClick)
                .field('channel', Package.XENIAL)
                .expect(200);

            let data = res.body.data;
            expect(res.body.success).to.be.true;
            expect(data.revisions).to.be.lengthOf(2);
            expect(data.architectures).to.be.lengthOf(1);
            expect(data.architectures[0]).to.equal(Package.ARMHF);
            expect(data.downloads).to.be.lengthOf(1);
            expect(data.downloads[0].architecture).to.equal(Package.ARMHF);
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

            let now = Date.now();
            let lock = new Lock({
                name: `revision-${this.package.id}`,
                expire: now + (1 * 1000), // 1 second in the future
                inserted: now,
            });
            await lock.save();

            let saveSpy = this.sandbox.spy(Lock.prototype, 'save');
            let parseStub = this.sandbox.stub(clickParser, 'parse').resolves({
                name: this.package.id,
                version: '1.0.0',
                architecture: 'armhf',
                apps: [],
            });

            let res = await this.post(this.route)
                .attach('file', this.emptyClick)
                .field('channel', Package.XENIAL)
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

            let armhfRevision = this.post(this.route)
                .attach('file', this.goodClick)
                .field('channel', Package.XENIAL)
                .expect(200);

            let arm64Revision = this.post(this.route)
                .attach('file', this.good64Click)
                .field('channel', Package.XENIAL)
                .expect(200);

            let [arm64Res] = await Promise.all([arm64Revision, armhfRevision]);

            let data = arm64Res.body.data;
            expect(data.revisions).to.have.lengthOf(2);
            expect(data.revisions[0].architecture).to.equal(Package.ARMHF);
            expect(data.revisions[1].architecture).to.equal(Package.ARM64);

            expect(this.lockAcquireSpy).to.have.been.calledTwice;
            expect(this.lockReleaseSpy).to.have.been.calledTwice;
        });
    });
});
