import { expect } from './helper';
import PackageRepo from '../src/db/package/repo';
import { Architecture, Channel, PackageType } from '../src/db/package/types';

describe('PackageRepo', () => {
  context('parseRequestFilters', () => {
    it('parses a request', () => {
      const parsed = PackageRepo.parseRequestFilters({
        query: {
          types: PackageType.APP,
          type: PackageType.APP,
          architecture: Architecture.ALL,
          limit: '100',
          skip: '20',
          sort: '-published_date',
          apps: 'foo.bar',
          frameworks: 'ubuntu-16.04',
          category: 'Category',
          author: 'Author',
          search: 'term',
          channel: Channel.XENIAL,
          nsfw: 'false',
        },
      } as any);

      expect(parsed).to.deep.equal({
        types: [PackageType.APP],
        architectures: [Architecture.ALL],
        limit: 100,
        skip: 20,
        sort: '-published_date',
        ids: ['foo.bar'],
        frameworks: ['ubuntu-16.04'],
        category: 'Category',
        author: 'Author',
        search: 'term',
        channel: Channel.XENIAL,
        nsfw: [null, false],
      });
    });

    it('handles types and type and webapp+', () => {
      expect(PackageRepo.parseRequestFilters({
        query: { type: PackageType.APP, types: PackageType.WEBAPP },
      } as any)).to.deep.include({
        types: [PackageType.WEBAPP, PackageType.APP, PackageType.WEBAPP_PLUS],
      });
    });

    it('adds arch all when the arch is not all', () => {
      expect(PackageRepo.parseRequestFilters({
        query: { architecture: Architecture.ARMHF },
      } as any)).to.deep.include({
        architectures: [Architecture.ARMHF, Architecture.ALL],
      });
    });
  });

  context('parseFilters', () => {
    it('parses filters', () => {
      const parsed = PackageRepo.parseFilters({
        types: [PackageType.APP, PackageType.WEBAPP],
        ids: ['foo.bar'],
        frameworks: ['ubuntu-16.04'],
        architectures: [Architecture.ARMHF, Architecture.ALL],
        category: 'Category',
        author: 'Author',
        channel: Channel.XENIAL,
        search: 'term',
        nsfw: [true],
        maintainer: 'foobar',
        published: true,
      });

      expect(parsed).to.deep.equal({
        types: { $in: [PackageType.APP, PackageType.WEBAPP] },
        id: { $in: ['foo.bar'] },
        framework: { $in: ['ubuntu-16.04'] },
        architectures: { $in: [Architecture.ARMHF, Architecture.ALL] },
        category: 'Category',
        author: 'Author',
        channels: Channel.XENIAL,
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
