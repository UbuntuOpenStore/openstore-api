import factory from './factory';

import { expect } from './helper';
import PackageRepo from '../src/db/package/repo';
import RatingCountRepo from '../src/db/rating_count/repo';
import discoverJSON from '../src/api/json/discover_apps.json';
import { Architecture, DEFAULT_CHANNEL } from '../src/db/package/types';

describe('Discover API', () => {
  before(function() {
    this.route = '/api/v3/discover/';
  });

  beforeEach(async function() {
    [this.package] = await Promise.all([
      factory.package({
        published: true,
        id: discoverJSON.highlights[0].id,
        architectures: [Architecture.ALL],
        channels: [DEFAULT_CHANNEL],
        published_date: (new Date()).toISOString(),
        types: ['app'],
      }),
      factory.package({
        published: true,
        id: discoverJSON.categories[1].ids[0],
        architectures: [Architecture.ALL],
        channels: [DEFAULT_CHANNEL],
        published_date: '2021-01-01T13:35:16.095Z',
        updated_date: '2021-01-01T13:35:16.095Z',
        types: ['app'],
      }),
      factory.package({
        published: true,
        id: discoverJSON.categories[1].ids[1],
        architectures: [Architecture.ALL],
        channels: [DEFAULT_CHANNEL],
        published_date: '2021-01-01T13:35:16.095Z',
        updated_date: '2021-01-01T13:35:16.095Z',
        types: ['app'],
      }),
      factory.package({
        published: true,
        id: discoverJSON.categories[1].ids[2],
        architectures: [Architecture.ALL],
        channels: [DEFAULT_CHANNEL],
        published_date: (new Date()).toISOString(),
        types: ['app'],
      }),
    ]);
  });

  it('returns a nice error', async function() {
    const findStub = this.sandbox.stub(PackageRepo, 'find').rejects();

    const res = await this.get(this.route, false).expect(500);
    expect(res.body.success).to.be.false;
    expect(findStub).to.have.been.called;
  });

  it('returns data', async function() {
    const findByIdsSpy = this.sandbox.spy(RatingCountRepo, 'findByIds');

    const res = await this.get(this.route, false).expect(200);

    expect(res.body.success).to.be.true;
    expect(res.body.data.highlight).to.not.be.undefined;
    expect(res.body.data.highlights.length).to.be.greaterThan(0);
    expect(res.body.data.categories.length).to.be.greaterThan(0);

    expect(findByIdsSpy).to.not.have.been.called;

    // Cache hit
    const res2 = await this.get(this.route, false).expect(200);

    expect(res2.body.success).to.be.true;
    expect(res2.body.data.highlight).to.not.be.undefined;
    expect(res2.body.data.highlights.length).to.be.greaterThan(0);
    expect(res2.body.data.categories.length).to.be.greaterThan(0);

    expect(findByIdsSpy).to.have.been.calledOnce;
  });
});
