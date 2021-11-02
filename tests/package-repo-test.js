const { expect } = require('./helper');
const PackageRepo = require('../src/db/package/repo');

describe('PackageRepo', () => {
  context('parseRequestFilters', () => {
    it('parses a request', () => {
      const parsed = PackageRepo.parseRequestFilters({
        query: {
          types: 'app',
          type: 'app',
          architecture: 'ALL',
          limit: '100',
          skip: '20',
          sort: '-published_date',
          apps: 'foo.bar',
          frameworks: 'ubuntu-16.04',
          category: 'Category',
          author: 'Author',
          search: 'term',
          channel: 'Xenial',
          nsfw: 'false',
        },
      });

      expect(parsed).to.deep.equal({
        types: ['app'],
        architectures: ['all'],
        limit: 100,
        skip: 20,
        sort: '-published_date',
        ids: ['foo.bar'],
        frameworks: ['ubuntu-16.04'],
        category: 'Category',
        author: 'Author',
        search: 'term',
        channel: 'xenial',
        nsfw: [null, false],
      });
    });

    it('handles types and type and webapp+', () => {
      expect(PackageRepo.parseRequestFilters({
        query: { type: 'app', types: 'webapp' },
      })).to.deep.include({
        types: ['webapp', 'app', 'webapp+'],
      });
    });

    it('adds arch all when the arch is not all', () => {
      expect(PackageRepo.parseRequestFilters({
        query: { architecture: 'armhf' },
      })).to.deep.include({
        architectures: ['armhf', 'all'],
      });
    });
  });

  context('parseFilters', () => {
    it('parses filters', () => {
      const parsed = PackageRepo.parseFilters({
        types: ['app', 'webapp'],
        ids: ['foo.bar'],
        frameworks: ['ubuntu-16.04'],
        architectures: ['armhf', 'all'],
        category: 'Category',
        author: 'Author',
        channel: 'xenial',
        search: 'term',
        nsfw: [true],
        maintainer: 'foobar',
        published: true,
      });

      expect(parsed).to.deep.equal({
        types: { $in: ['app', 'webapp'] },
        id: { $in: ['foo.bar'] },
        framework: { $in: ['ubuntu-16.04'] },
        architectures: { $in: ['armhf', 'all'] },
        category: 'Category',
        author: 'Author',
        channels: 'xenial',
        $text: { $search: 'term' },
        nsfw: { $in: [true] },
        maintainer: 'foobar',
        published: true,
      });
    });

    it('parses filters, ignoring missing elements', () => {
      const parsed = PackageRepo.parseFilters({
        frameworks: [],
        search: 'term',
      });

      expect(parsed).to.deep.equal({
        $text: { $search: 'term' },
      });
    });
  });
});
