import factory from './factory';

import { expect } from './helper';
import Package from '../src/db/package/model';
import PackageRepo from '../src/db/package/repo';
import categoryIcons from '../src/api/json/category_icons.json';

describe('Categories API', () => {
  before(function() {
    this.route = '/api/v3/categories/';
  });

  beforeEach(async() => {
    await Promise.all([
      factory.package({ published: true, category: 'Utilities', channels: [Package.DEFAULT_CHANNEL] }),
      factory.package({ published: true, category: 'Utilities', channels: [Package.DEFAULT_CHANNEL] }),
      factory.package({ published: true, category: 'Games', channels: [Package.DEFAULT_CHANNEL] }),
    ]);
  });

  it('returns only categories that have apps in them', async function() {
    const res = await this.get(this.route, false).expect(200);

    expect(res.body.success).to.be.true;
    expect(res.body.data).to.have.lengthOf(2);
    expect(res.body.data[0].category).to.equal('Games');
    expect(res.body.data[0].count).to.equal(1);
    expect(res.body.data[1].category).to.equal('Utilities');
    expect(res.body.data[1].count).to.equal(2);
  });

  it('returns all categories', async function() {
    const res = await this.get(`${this.route}?all=true`, false).expect(200);

    expect(res.body.success).to.be.true;
    expect(res.body.data).to.have.lengthOf(Object.keys(categoryIcons).length);
  });

  it('throws a nice error', async function() {
    const categoryStatsStub = this.sandbox.stub(PackageRepo, 'categoryStats').rejects();

    const res = await this.get(this.route, false).expect(500);
    expect(res.body.success).to.be.false;
    expect(categoryStatsStub).to.have.been.calledOnce;
  });

  it('handles invalid channels', async function() {
    const res = await this.get(`${this.route}?channel=invalid`, false).expect(200);

    expect(res.body.success).to.be.true;
    expect(res.body.data).to.have.lengthOf(2);
  });

  it('handles languages channels', async function() {
    const res = await this.get(`${this.route}?lang=de`, false).expect(200);

    expect(res.body.success).to.be.true;
    expect(res.body.data).to.have.lengthOf(2);
  });
});
