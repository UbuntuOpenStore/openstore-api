const { factory } = require('factory-girl');

const { expect } = require('./helper');
const Package = require('../src/db/package/model');
const PackageRepo = require('../src/db/package/repo');

describe('Revisions GET', () => {
  before(function() {
    this.route = '/api/v3/revisions';
    this.makeUrl = function({ version = '1.0.0', id = this.package.id, architecture = 'all', channel = 'xenial' } = {}) {
      return `${this.route}?apps=${id}@${version}&architecture=${architecture}&channel=${channel}`;
    };
  });

  beforeEach(async function() {
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

  it('returns latest update for an app', async function() {
    const { body } = await this.get(this.makeUrl()).expect(200);

    expect(body.success).to.be.true;
    expect(body.data).to.have.lengthOf(1);

    const data = body.data[0];
    expect(data.id).to.equal(this.package.id);
    expect(data.version).to.equal('1.0.0');
    expect(data.revision).to.equal(1);
    expect(data.latest_version).to.equal('2.0.0');
    expect(data.latest_revision).to.equal(3);
    expect(data.download_url).to.exist;
  });

  it('returns latest update for an app that is "all" when requesting a different arch', async function() {
    const { body } = await this.get(this.makeUrl({ architecture: Package.ARMHF })).expect(200);

    expect(body.success).to.be.true;
    expect(body.data).to.have.lengthOf(1);

    const data = body.data[0];
    expect(data.id).to.equal(this.package.id);
    expect(data.version).to.equal('1.0.0');
    expect(data.revision).to.equal(1);
    expect(data.latest_version).to.equal('2.0.0');
    expect(data.latest_revision).to.equal(3);
    expect(data.download_url).to.exist;
  });

  it('returns latest update for a "sideloaded" app', async function() {
    const { body } = await this.get(this.makeUrl({ version: '2.0.1' })).expect(200);

    expect(body.success).to.be.true;
    expect(body.data).to.have.lengthOf(1);

    const data = body.data[0];
    expect(data.id).to.equal(this.package.id);
    expect(data.version).to.equal('2.0.1');
    expect(data.revision).to.equal(0);
    expect(data.latest_version).to.equal('2.0.0');
    expect(data.latest_revision).to.equal(3);
    expect(data.download_url).to.exist;
  });

  it('returns nothing for an app that is not in the OpenStore', async function() {
    const { body } = await this.get(this.makeUrl({ id: 'foo.bar' })).expect(200);

    expect(body.success).to.be.true;
    expect(body.data).to.have.lengthOf(0);
  });

  it('returns nothing when the latest revision does not have a download_url', async function() {
    this.package.revisions = this.package.revisions.map((revision) => {
      return {
        ...revision.toObject(),
        download_url: null,
      };
    });
    await this.package.save();

    const { body } = await this.get(this.makeUrl()).expect(200);

    expect(body.success).to.be.true;
    expect(body.data).to.have.lengthOf(0);
  });

  it('returns nothing for a different arch', async function() {
    this.package.revisions = this.package.revisions.map((revision) => {
      return {
        ...revision.toObject(),
        architecture: Package.ARM64,
      };
    });
    this.package.architectures = [Package.ARM64];
    await this.package.save();

    const { body } = await this.get(this.makeUrl({ architecture: Package.ARMHF })).expect(200);

    expect(body.success).to.be.true;
    expect(body.data).to.have.lengthOf(0);
  });

  it('returns the correct arch', async function() {
    this.package.revisions = this.package.revisions.map((revision) => {
      return {
        ...revision.toObject(),
        architecture: Package.ARM64,
      };
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

    const { body } = await this.get(this.makeUrl({ version: '2.0.0', architecture: Package.ARMHF })).expect(200);

    expect(body.success).to.be.true;
    expect(body.data).to.have.lengthOf(1);

    const data = body.data[0];
    expect(data.id).to.equal(this.package.id);
    expect(data.version).to.equal('2.0.0');
    expect(data.revision).to.equal(4);
    expect(data.latest_version).to.equal('2.0.0');
    expect(data.latest_revision).to.equal(4);
    expect(data.download_url).to.exist;
  });

  it('defaults to XENIAL for the channel', async function() {
    const { body } = await this.get(this.makeUrl({ channel: 'foo' })).expect(200);

    expect(body.success).to.be.true;
    expect(body.data).to.have.lengthOf(1);

    const data = body.data[0];
    expect(data.id).to.equal(this.package.id);
    expect(data.version).to.equal('1.0.0');
    expect(data.revision).to.equal(1);
    expect(data.latest_version).to.equal('2.0.0');
    expect(data.latest_revision).to.equal(3);
    expect(data.download_url).to.exist;
  });

  it('fails gracefully', async function() {
    const findStub = this.sandbox.stub(PackageRepo, 'find').rejects();

    const res = await this.get(this.makeUrl()).expect(500);

    expect(res.body.success).to.be.false;
    expect(findStub).to.have.been.calledOnce;
  });

  it('gets the channel from the version', async function() {
    const url = `${this.route}?apps=${this.package.id}@1.0.0@${Package.XENIAL}&architecture=${Package.ARMHF}`;
    const { body } = await this.get(url).expect(200);

    expect(body.success).to.be.true;
    expect(body.data).to.have.lengthOf(1);

    const data = body.data[0];
    expect(data.id).to.equal(this.package.id);
    expect(data.version).to.equal('1.0.0');
    expect(data.revision).to.equal(1);
    expect(data.latest_version).to.equal('2.0.0');
    expect(data.latest_revision).to.equal(3);
    expect(data.download_url).to.exist;
  });

  it('defaults to using armhf', async function() {
    this.package.revisions = this.package.revisions.forEach((revision) => {
      return {
        ...revision,
        architecture: Package.ARM64,
      };
    });
    this.package.architectures = [Package.ARM64];
    await this.package.save();

    const { body } = await this.get(this.makeUrl({ architecture: 'foo' })).expect(200);

    expect(body.success).to.be.true;
    expect(body.data).to.have.lengthOf(0);
  });

  /*
    // TODO revive these when the support returns

    it('returns the most recent for the given frameworks', async function() {
        this.package.revisions[0].framework = 'ubuntu-sdk-15.04';
        this.package.revisions[1].framework = 'ubuntu-sdk-15.04';
        await this.package.save();

        let { body } = await this.get(`${this.makeUrl()}&frameworks=ubuntu-sdk-15.04`).expect(200);

        expect(body.success).to.be.true;
        expect(body.data).to.have.lengthOf(1);
        expect(body.data[0].latest_revision).to.equal(2);

        let { body: body2 } = await this.get(`${this.makeUrl()}&frameworks=ubuntu-sdk-15.04,ubuntu-sdk-16.04`).expect(200);

        expect(body2.success).to.be.true;
        expect(body2.data).to.have.lengthOf(1);
        expect(body2.data[0].latest_revision).to.equal(3);
    });

    it('returns nothing when the updates are different than the given framework', async function() {
        let { body } = await this.get(`${this.makeUrl()}&frameworks=ubuntu-sdk-15.04`).expect(200);

        expect(body.success).to.be.true;
        expect(body.data).to.have.lengthOf(0);
    });
    */
});
