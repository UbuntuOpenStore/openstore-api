const path = require('path');
const {factory} = require('factory-girl');
const childProcess = require('child_process');

const {expect} = require('./helper');
const Package = require('../src/db/package/model');
const PackageRepo = require('../src/db/package/repo');
const upload = require('../src/utils/upload');
const reviewPackage = require('../src/utils/review-package');
const clickParser = require('../src/utils/click-parser-async');

describe('Manage Revision POST', function() {
    beforeEach(async function() {
        [this.package, this.package2] = await Promise.all([
            factory.create('package', {
                maintainer: this.user._id,
                name: 'OpenStore Test',
                id: 'openstore-test.openstore-team'
            }),
            factory.create('package'),
        ]);

        this.route = `/api/v3/manage/${this.package.id}/revision`;
        this.goodClick = path.join(__dirname, 'fixtures/good.click');
        this.emptyClick = path.join(__dirname, 'fixtures/empty.click');
        this.manualReviewClick = path.join(__dirname, 'fixtures/manual-review.click');
        this.notAClick = path.join(__dirname, 'fixtures/notaclick.txt');

        this.uploadPackageStub = this.sandbox.stub(upload, 'uploadPackage').resolves(['packageUrl', 'iconUrl']);
    });

    it('blocks access when not logged in', async function() {
        await this.post(this.route, false).expect(401);
    });

    context('admin user', function() {
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

            expect(res.body.success).to.be.true
            expect(parseStub).to.have.been.calledOnce;
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

            expect(res.body.success).to.be.true
            expect(reviewSpy).to.have.not.been.calledOnce;
            expect(parseStub).to.have.been.calledOnce;
        });
    });

    context('trusted user', function() {
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

            expect(res.body.success).to.be.true
            expect(reviewSpy).to.have.not.been.calledOnce;
            expect(parseStub).to.have.been.calledOnce;
        });
    });

    context('community user', function() {
        beforeEach(async function() {
            this.user.role = 'community';
            await this.user.save();
        });

        it('fails with no file', async function() {
            let res = await this.post(this.route)
                .expect(400);

            expect(res.body.message).to.equal('No file upload specified');
        });

        it('fails with invalid channel', async function() {
            let res = await this.post(this.route)
                .attach('file', this.emptyClick)
                .field('channel', 'vivid')
                .expect(400);

            expect(res.body.message).to.equal('The provided channel is not valid');
        });

        it('fails with bad id', async function() {
            let res = await this.post('/api/v3/manage/foo/revision')
                .attach('file', this.emptyClick)
                .field('channel', Package.XENIAL)
                .expect(404);

            expect(res.body.message).to.equal('App not found');
        });

        it('does not allow access to other packages', async function() {
            await this.post(`/api/v3/manage/${this.package2.id}/revision`)
                .attach('file', this.emptyClick)
                .field('channel', Package.XENIAL)
                .expect(403);
        });

        it('fails review', async function() {
            this.timeout(5000);

            let res = await this.post(this.route)
                .attach('file', this.manualReviewClick)
                .field('channel', Package.XENIAL)
                .expect(400);

            expect(res.body.success).to.be.false
            expect(res.body.message).to.equal("This app needs to be reviewed manually (Error:  'unconfined' not allowed)")
        });

        it('fails if not a click', async function() {
            let res = await this.post(this.route)
                .attach('file', this.notAClick)
                .field('channel', Package.XENIAL)
                .expect(400);

            expect(res.body.success).to.be.false
            expect(res.body.message).to.equal('The file must be a click package')
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

            expect(res.body.success).to.be.false
            expect(res.body.message).to.equal('The uploaded package does not match the name of the package you are editing');
            expect(reviewStub).to.have.been.calledOnce;
            expect(parseStub).to.have.been.calledOnce;
        });

        it('fails with a malformed manifest', async function() {
            let reviewStub = this.sandbox.stub(reviewPackage, 'review').resolves(false);
            let parseStub = this.sandbox.stub(clickParser, 'parse').resolves({});

            let res = await this.post(this.route)
                .attach('file', this.emptyClick)
                .field('channel', Package.XENIAL)
                .expect(400);

            expect(res.body.success).to.be.false
            expect(res.body.message).to.equal('Your package manifest is malformed');
            expect(reviewStub).to.have.been.calledOnce;
            expect(parseStub).to.have.been.calledOnce;
        });

        it('fails with an existing version', async function() {
            this.package.revisions.push({channel: Package.XENIAL, version: '1.0.0'});
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
                .expect(400);

            expect(res.body.success).to.be.false
            expect(res.body.message).to.equal('A revision already exists with this version');
            expect(reviewStub).to.have.been.calledOnce;
            expect(parseStub).to.have.been.calledOnce;
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

            expect(res.body.success).to.be.true
            expect(reviewStub).to.have.been.calledOnce;
            expect(parseStub).to.have.been.calledOnce;

            let package = await PackageRepo.findOne(this.package.id);
            expect(package.changelog).to.equal('changelog update\n\nold changelog');
        });

        it('successfully reviews/updates/saves a package and icon and updates elasticsearch', async function() {
            this.timeout(5000);

            // TODO check if updates icon
            // TODO check if updates elasticsearch
            // TODO check if removes old files

            let reviewSpy = this.sandbox.spy(reviewPackage, 'review');

            let res = await this.post(this.route)
                .attach('file', this.goodClick)
                .field('channel', Package.XENIAL)
                .expect(200);

            let data = res.body.data;

            expect(data.architectures).to.deep.equal(['all']);
            expect(data.author).to.equal('OpenStore Team');
            expect(data.channels).to.deep.equal([Package.XENIAL]);
            expect(data.filesize).to.be.ok;
            expect(data.framework).to.equal('ubuntu-sdk-16.04');
            expect(data.icon).to.equal('http://local.open-store.io/api/v3/apps/openstore-test.openstore-team/icon/1.0.0')
            expect(data.permissions).to.deep.equal(['networking']);
            expect(data.published).to.be.false;
            expect(data.manifest).to.be.ok;
            expect(data.tagline).to.equal('OpenStore test app');
            expect(data.version).to.equal('1.0.0');
            expect(data.types).to.deep.equal(['app']);
            expect(data.revisions).to.have.lengthOf(1)
            expect(data.revisions[0].revision).to.equal(1)
            expect(data.revisions[0].version).to.equal('1.0.0')
            expect(data.revisions[0].channel).to.equal(Package.XENIAL)

            expect(this.uploadPackageStub).to.have.been.calledOnce
            expect(reviewSpy).to.have.been.calledOnce
        });

        // TODO test pkg.updateFromClick
    });
});