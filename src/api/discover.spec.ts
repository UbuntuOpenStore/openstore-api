import { Package } from 'db/package';
import { RatingCount } from 'db/rating_count';
import { Architecture, Channel, ChannelArchitecture, PackageType } from 'db/package/types';
import factory from 'tests/factory';
import { expect } from 'tests/helper';
import discoverJSON from './json/discover_apps.json';

describe('Discover API', () => {
  before(function () {
    this.route = '/api/v3/discover/';
  });

  beforeEach(async function () {
    [this.package] = await Promise.all([
      factory.package({
        published: true,
        id: discoverJSON.highlights[0].id,
        architectures: [Architecture.ALL],
        channels: [Channel.XENIAL],
        channel_architectures: [ChannelArchitecture.XENIAL_ALL],
        published_date: (new Date()).toISOString(),
        types: [PackageType.APP],
      }),
      factory.package({
        published: true,
        id: discoverJSON.categories[1].ids[0],
        architectures: [Architecture.ALL],
        channels: [Channel.XENIAL],
        channel_architectures: [ChannelArchitecture.XENIAL_ALL],
        published_date: '2021-01-01T13:35:16.095Z',
        updated_date: '2021-01-01T13:35:16.095Z',
        types: [PackageType.APP],
      }),
      factory.package({
        published: true,
        id: discoverJSON.categories[1].ids[1],
        architectures: [Architecture.ALL],
        channels: [Channel.XENIAL],
        channel_architectures: [ChannelArchitecture.XENIAL_ALL],
        published_date: '2021-01-01T13:35:16.095Z',
        updated_date: '2021-01-01T13:35:16.095Z',
        types: [PackageType.APP],
      }),
      factory.package({
        published: true,
        id: discoverJSON.categories[1].ids[2],
        architectures: [Architecture.ALL],
        channels: [Channel.XENIAL],
        channel_architectures: [ChannelArchitecture.XENIAL_ALL],
        published_date: (new Date()).toISOString(),
        types: [PackageType.APP],
      }),
    ]);
  });

  it('returns a nice error', async function () {
    const findStub = this.sandbox.stub(Package, 'findByFilters').rejects();

    const res = await this.get(this.route, false).expect(500);
    expect(res.body.success).to.be.false;
    expect(findStub).to.have.been.called;
  });

  it('returns data', async function () {
    const getCountsByIdsSpy = this.sandbox.spy(RatingCount, 'getCountsByIds');

    const res = await this.get(this.route, false).expect(200);

    expect(res.body.success).to.be.true;
    expect(res.body.data.highlight).to.not.be.undefined;
    expect(res.body.data.highlights.length).to.be.greaterThan(0);
    expect(res.body.data.categories.length).to.be.greaterThan(0);

    expect(getCountsByIdsSpy).to.not.have.been.called;

    // Cache hit
    const res2 = await this.get(this.route, false).expect(200);

    expect(res2.body.success).to.be.true;
    expect(res2.body.data.highlight).to.not.be.undefined;
    expect(res2.body.data.highlights.length).to.be.greaterThan(0);
    expect(res2.body.data.categories.length).to.be.greaterThan(0);

    // Verify that ratings get refreshed on a cache hit
    expect(getCountsByIdsSpy).to.have.been.calledOnce;
  });
});
