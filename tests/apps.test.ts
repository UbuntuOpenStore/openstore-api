import { DEFAULT_CHANNEL } from 'db/package/types';
import factory from './factory';

import { expect } from './helper';
import { Package } from '../src/db/package';
import * as messages from '../src/api/error-messages';

describe('Apps API', () => {
  before(function() {
    this.route = '/api/v3/apps/';
  });

  beforeEach(async function() {
    const [package1, package2, package3] = await Promise.all([
      factory.package({
        id: 'app1',
        name: 'App1',
        author: 'John',
        published: true,
        category: 'Utilities',
        channels: [DEFAULT_CHANNEL],
      }),
      factory.package({
        id: 'app2',
        name: 'App2',
        author: 'Jane',
        published: true,
        category: 'Games',
        channels: [DEFAULT_CHANNEL],
      }),
      factory.package({
        id: 'app3',
        name: 'App3',
        author: 'Joe',
        published: false,
        category: 'Games',
        channels: [DEFAULT_CHANNEL],
      }),
    ]);

    this.package1 = package1;
    this.package2 = package2;
    this.package3 = package3;
  });

  context('GET one app', () => {
    it('gets an app successfully', async function() {
      const res = await this.get(`${this.route}${this.package1.id}`, false).expect(200);

      expect(res.body.success).to.be.true;
      expect(res.body.data.id).to.equal(this.package1.id);
    });

    it('throws a 404', async function() {
      const res = await this.get(`${this.route}foobar`, false).expect(404);

      expect(res.body.success).to.be.false;
    });

    it('throws a 404 for an unpublished app', async function() {
      const res = await this.get(`${this.route}${this.package3.id}`, false).expect(404);

      expect(res.body.success).to.be.false;
    });

    it('fails gracefully', async function() {
      const findOneStub = this.sandbox.stub(Package, 'findOneByFilters').rejects();

      const res = await this.get(`${this.route}${this.package1.id}`, false).expect(500);

      expect(res.body.success).to.be.false;
      expect(findOneStub).to.have.been.calledOnce;
    });
  });

  context('GET all apps', () => {
    it('returns successfully', async function() {
      const res = await this.get(this.route, false).expect(200);

      expect(res.body.success).to.be.true;
      expect(res.body.data.packages).to.have.lengthOf(2);
      expect(res.body.data.count).to.equal(2);
    });

    // TODO it seems that populating the data during the test doesn't work properly
    /*
    it('searches for apps', async function() {
      await PackageSearch.bulk([
        this.package1,
        this.package2,
      ]);

      const res = await this.get(`${this.route}?search=${this.package1.name}`, false).expect(200);

      expect(res.body.success).to.be.true;
      expect(res.body.data.packages).to.have.lengthOf(1);
      expect(res.body.data.count).to.equal(1);
      expect(res.body.data.packages[0].id).to.equal(this.package1.id);
    });
    */

    it('searches by author', async function() {
      const res = await this.get(`${this.route}?search=author:${this.package2.author}`, false).expect(200);

      expect(res.body.success).to.be.true;
      expect(res.body.data.packages).to.have.lengthOf(1);
      expect(res.body.data.count).to.equal(1);
      expect(res.body.data.packages[0].id).to.equal(this.package2.id);
    });

    it('fails gracefully', async function() {
      const findStub = this.sandbox.stub(Package, 'findByFilters').rejects();

      const res = await this.get(this.route, false).expect(500);

      expect(res.body.success).to.be.false;
      expect(findStub).to.have.been.calledOnce;
    });
  });

  context('GET app download', () => {
    beforeEach(async function() {
      this.package4 = await factory.package({
        id: 'app4',
        published: true,
        category: 'Utilities',
        channels: [DEFAULT_CHANNEL],
        revisions: [
          {
            revision: 1,
            version: '1',
            downloads: 10,
            channel: DEFAULT_CHANNEL,
            download_url: `${__dirname}/fixtures/empty.click`,
            architecture: 'armhf',
            framework: 'ubuntu-sdk-16.04',
            filesize: 100,
          },
          {
            revision: 2,
            version: '2',
            downloads: 10,
            channel: DEFAULT_CHANNEL,
            download_url: `${__dirname}/fixtures/empty.click`,
            architecture: 'armhf',
            framework: 'ubuntu-sdk-16.04',
            filesize: 100,
          },
        ],
      });
    });

    it('returns successfully', async function() {
      await this.get(`${this.route}${this.package4.id}/download/${DEFAULT_CHANNEL}/armhf`, false).expect(200);
    });

    it('throws a 404', async function() {
      const res = await this.get(`${this.route}somepackage/download/${DEFAULT_CHANNEL}/armhf`, false).expect(404);

      expect(res.body.success).to.be.false;
      expect(res.body.message).to.equal(messages.APP_NOT_FOUND);
    });

    it('throws for an invalid channel', async function() {
      const res = await this.get(`${this.route}${this.package4.id}/download/invalid/armhf`, false).expect(400);

      expect(res.body.success).to.be.false;
      expect(res.body.message).to.equal(messages.INVALID_CHANNEL);
    });

    it('throws for an invalid arch', async function() {
      const res = await this.get(`${this.route}${this.package4.id}/download/${DEFAULT_CHANNEL}/invalid`, false).expect(400);

      expect(res.body.success).to.be.false;
      expect(res.body.message).to.equal(messages.INVALID_ARCH);
    });

    it('throws for a download not found for unknown version', async function() {
      const res = await this.get(`${this.route}${this.package4.id}/download/${DEFAULT_CHANNEL}/armhf/3`, false).expect(404);

      expect(res.body.success).to.be.false;
      expect(res.body.message).to.equal(messages.DOWNLOAD_NOT_FOUND_FOR_CHANNEL);
    });

    it('fails gracefully', async function() {
      const findStub = this.sandbox.stub(Package, 'findOneByFilters').rejects();

      const res = await this.get(`${this.route}${this.package4.id}/download/${DEFAULT_CHANNEL}/armhf`, false).expect(500);

      expect(res.body.success).to.be.false;
      expect(findStub).to.have.been.calledOnce;
    });

    it('gets the download by version', async function() {
      await this.get(`${this.route}${this.package4.id}/download/${DEFAULT_CHANNEL}/armhf/2`, false).expect(200);
    });
  });
});
