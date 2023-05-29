import { Package } from 'db/package';
import { Architecture, Channel, HydratedRevision } from 'db/package/types';
import factory from 'tests/factory';
import { expect } from 'tests/helper';

describe('Revisions GET', () => {
  before(function() {
    this.route = '/api/v3/revisions';
    this.makeUrl = function({ version = '1.0.0', id = this.package.id, architecture = 'all', channel = 'xenial' } = {}) {
      return `${this.route}?apps=${id}@${version}&architecture=${architecture}&channel=${channel}`;
    };
  });

  beforeEach(async function() {
    this.package = await factory.package({
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
    const { body } = await this.get(this.makeUrl({ architecture: Architecture.ARMHF })).expect(200);

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
    this.package.revisions = this.package.revisions.map((revision: HydratedRevision) => {
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
    this.package.revisions = this.package.revisions.map((revision: HydratedRevision) => {
      return {
        ...revision.toObject(),
        architecture: Architecture.ARM64,
      };
    });
    this.package.architectures = [Architecture.ARM64];
    await this.package.save();

    const { body } = await this.get(this.makeUrl({ architecture: Architecture.ARMHF })).expect(200);

    expect(body.success).to.be.true;
    expect(body.data).to.have.lengthOf(0);
  });

  it('returns the correct arch', async function() {
    this.package.revisions = this.package.revisions.map((revision: HydratedRevision) => {
      return {
        ...revision.toObject(),
        architecture: Architecture.ARM64,
      };
    });
    this.package.revisions.push({
      revision: 4,
      version: '2.0.0',
      channel: Channel.XENIAL,
      architecture: Architecture.ARMHF,
      framework: 'ubuntu-sdk-16.04',
      download_url: 'url',
    });
    this.package.architectures = [Architecture.ARM64, Architecture.ARMHF];
    await this.package.save();

    const { body } = await this.get(this.makeUrl({ version: '2.0.0', architecture: Architecture.ARMHF })).expect(200);

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

  it('fails if the channel is missing or invalid', async function() {
    await this.get(this.makeUrl({ channel: 'foo', architecture: Architecture.ARMHF })).expect(400);
    await this.get(this.makeUrl({ channel: '', architecture: Architecture.ARMHF })).expect(400);
  });

  it('fails gracefully', async function() {
    const findStub = this.sandbox.stub(Package, 'findByFilters').rejects();

    const res = await this.get(this.makeUrl()).expect(500);

    expect(res.body.success).to.be.false;
    expect(findStub).to.have.been.calledOnce;
  });

  it('gets the channel from the version', async function() {
    const url = `${this.route}?apps=${this.package.id}@1.0.0@${Channel.XENIAL}&channel=${Channel.FOCAL}&architecture=${Architecture.ARMHF}`;
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

  it('fails if arch is not specified or is invalid', async function() {
    this.package.revisions = this.package.revisions.forEach((revision: HydratedRevision) => {
      return {
        ...revision,
        architecture: Architecture.ARM64,
      };
    });
    this.package.architectures = [Architecture.ARM64];
    await this.package.save();

    await this.get(this.makeUrl({ channel: Channel.FOCAL, architecture: 'foo' })).expect(400);
    await this.get(this.makeUrl({ channel: Channel.FOCAL, architecture: '' })).expect(400);
  });

  it('returns the most recent for the given frameworks', async function() {
    this.package.revisions[0].framework = 'ubuntu-sdk-15.04';
    this.package.revisions[1].framework = 'ubuntu-sdk-15.04';
    await this.package.save();

    const { body } = await this.get(`${this.makeUrl()}&frameworks=ubuntu-sdk-15.04`).expect(200);

    expect(body.success).to.be.true;
    expect(body.data).to.have.lengthOf(1);
    expect(body.data[0].latest_revision).to.equal(2);

    const { body: body2 } = await this.get(`${this.makeUrl()}&frameworks=ubuntu-sdk-15.04,ubuntu-sdk-16.04`).expect(200);

    expect(body2.success).to.be.true;
    expect(body2.data).to.have.lengthOf(1);
    expect(body2.data[0].latest_revision).to.equal(3);
  });

  it('returns nothing when the updates are different than the given framework', async function() {
    const { body } = await this.get(`${this.makeUrl()}&frameworks=ubuntu-sdk-15.04`).expect(200);

    expect(body.success).to.be.true;
    expect(body.data).to.have.lengthOf(0);
  });
});
