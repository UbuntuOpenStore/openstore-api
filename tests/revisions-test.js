const {factory} = require('factory-girl');

const {expect} = require('./helper');
const Package = require('../src/db/package/model');
const PackageRepo = require('../src/db/package/repo');

describe('Revisions GET', () => {
    before(function () {
        this.route = '/api/v3/revisions';
        this.makeUrl = function ({version = '1.0.0', id = this.package.id, architecture = 'all', channel = 'xenial'} = {}) {
            return `${this.route}?apps=${id}@${version}&architecture=${architecture}&channel=${channel}`;
        };
    });

    beforeEach(async function () {
        this.package = await factory.create('package', {
            published: true,
            framework: 'ubuntu-sdk-16.04',
            architectures: [Package.ALL],
            revisions: [
                {
                    revision: 1,
                    version: '1.0.0',
                    channel: Package.XENIAL,
                    architecture: Package.ALL,
                    framework: 'ubuntu-sdk-16.04',
                    download_url: 'url',
                },
                {
                    revision: 2,
                    version: '1.0.1',
                    channel: Package.XENIAL,
                    architecture: Package.ALL,
                    framework: 'ubuntu-sdk-16.04',
                    download_url: 'url',
                },
                {
                    revision: 3,
                    version: '2.0.0',
                    channel: Package.XENIAL,
                    architecture: Package.ALL,
                    framework: 'ubuntu-sdk-16.04',
                    download_url: 'url',
                },
            ],
        });
    });

    it('returns latest update for an app', async function () {
        let {body} = await this.get(this.makeUrl()).expect(200);

        expect(body.success).to.be.true;
        expect(body.data).to.have.lengthOf(1);

        let data = body.data[0];
        expect(data.id).to.equal(this.package.id);
        expect(data.version).to.equal('1.0.0');
        expect(data.revision).to.equal(1);
        expect(data.latest_version).to.equal('2.0.0');
        expect(data.latest_revision).to.equal(3);
        expect(data.download_url).to.exist;
    });

    it('returns latest update for an app that is "all" when requesting a different arch', async function () {
        let { body } = await this.get(this.makeUrl({architecture: Package.ARMHF})).expect(200);

        expect(body.success).to.be.true;
        expect(body.data).to.have.lengthOf(1);

        let data = body.data[0];
        expect(data.id).to.equal(this.package.id);
        expect(data.version).to.equal('1.0.0');
        expect(data.revision).to.equal(1);
        expect(data.latest_version).to.equal('2.0.0');
        expect(data.latest_revision).to.equal(3);
        expect(data.download_url).to.exist;
    });

    it('returns latest update for a "sideloaded" app', async function () {
        let { body } = await this.get(this.makeUrl({version: '2.0.1'})).expect(200);

        expect(body.success).to.be.true;
        expect(body.data).to.have.lengthOf(1);

        let data = body.data[0];
        expect(data.id).to.equal(this.package.id);
        expect(data.version).to.equal('2.0.1');
        expect(data.revision).to.equal(0);
        expect(data.latest_version).to.equal('2.0.0');
        expect(data.latest_revision).to.equal(3);
        expect(data.download_url).to.exist;
    });

    it('returns nothing for an app that is not in the OpenStore', async function () {
        let { body } = await this.get(this.makeUrl({ id: 'foo.bar' })).expect(200);

        expect(body.success).to.be.true;
        expect(body.data).to.have.lengthOf(0);
    });

    it('returns nothing when the latest revision does not have a download_url', async function () {
        this.package.revisions.forEach((revision) => {
            revision.download_url = null;
        });
        await this.package.save();

        let { body } = await this.get(this.makeUrl()).expect(200);

        expect(body.success).to.be.true;
        expect(body.data).to.have.lengthOf(0);
    });

    it('returns nothing for a different arch', async function () {
        this.package.revisions.forEach((revision) => {
            revision.architecture = Package.ARM64;
        });
        this.package.architectures = [Package.ARM64];
        await this.package.save();

        let { body } = await this.get(this.makeUrl({architecture: Package.ARMHF})).expect(200);

        expect(body.success).to.be.true;
        expect(body.data).to.have.lengthOf(0);
    });

    it('returns the correct arch', async function () {
        this.package.revisions.forEach((revision) => {
            revision.architecture = Package.ARM64;
        });
        this.package.revisions.push({
            revision: 4,
            version: '2.0.0',
            channel: Package.XENIAL,
            architecture: Package.ARMHF,
            framework: 'ubuntu-sdk-16.04',
            download_url: 'url',
        });
        this.package.architectures = [Package.ARM64, Package.ARMHF];
        await this.package.save();

        let { body } = await this.get(this.makeUrl({version: '2.0.0', architecture: Package.ARMHF})).expect(200);

        expect(body.success).to.be.true;
        expect(body.data).to.have.lengthOf(1);

        let data = body.data[0];
        expect(data.id).to.equal(this.package.id);
        expect(data.version).to.equal('2.0.0');
        expect(data.revision).to.equal(4);
        expect(data.latest_version).to.equal('2.0.0');
        expect(data.latest_revision).to.equal(4);
        expect(data.download_url).to.exist;
    });

    it('defaults to XENIAL for the channel', async function () {
        let { body } = await this.get(this.makeUrl({ channel: 'foo' })).expect(200);

        expect(body.success).to.be.true;
        expect(body.data).to.have.lengthOf(1);

        let data = body.data[0];
        expect(data.id).to.equal(this.package.id);
        expect(data.version).to.equal('1.0.0');
        expect(data.revision).to.equal(1);
        expect(data.latest_version).to.equal('2.0.0');
        expect(data.latest_revision).to.equal(3);
        expect(data.download_url).to.exist;
    });

    it('fails gracefully', async function () {
        let findStub = this.sandbox.stub(PackageRepo, 'find').rejects();

        let res = await this.get(this.makeUrl()).expect(500);

        expect(res.body.success).to.be.false;
        expect(findStub).to.have.been.calledOnce;
    });

    it('gets the channel from the version', async function () {
        let url = `${this.route}?apps=${this.package.id}@1.0.0@${Package.XENIAL}&architecture=${Package.ARMHF}`;
        let { body } = await this.get(url).expect(200);

        expect(body.success).to.be.true;
        expect(body.data).to.have.lengthOf(1);

        let data = body.data[0];
        expect(data.id).to.equal(this.package.id);
        expect(data.version).to.equal('1.0.0');
        expect(data.revision).to.equal(1);
        expect(data.latest_version).to.equal('2.0.0');
        expect(data.latest_revision).to.equal(3);
        expect(data.download_url).to.exist;
    });

    it('defaults to using armhf', async function () {
        this.package.revisions.forEach((revision) => {
            revision.architecture = Package.ARM64;
        });
        this.package.architectures = [Package.ARM64];
        await this.package.save();

        let { body } = await this.get(this.makeUrl({ architecture: 'foo' })).expect(200);

        expect(body.success).to.be.true;
        expect(body.data).to.have.lengthOf(0);
    });
});
