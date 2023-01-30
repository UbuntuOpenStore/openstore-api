import factory from './factory';

import { expect } from './helper';
import { Package } from '../src/db/package';
import { Architecture, Channel, PackageType, DEFAULT_CHANNEL, ChannelArchitecture } from '../src/db/package/types';
import { Ratings } from '../src/db/review';
import { serializeRatings } from '../src/db/package/methods';
import { UserError } from '../src/exceptions';

describe('Package', () => {
  context('parseRequestFilters', () => {
    it('parses a request', () => {
      const parsed = Package.parseRequestFilters({
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
      expect(Package.parseRequestFilters({
        query: { type: PackageType.APP, types: PackageType.WEBAPP },
      } as any)).to.deep.include({
        types: [PackageType.WEBAPP, PackageType.APP, PackageType.WEBAPP_PLUS],
      });
    });

    it('adds arch all when the arch is not all', () => {
      expect(Package.parseRequestFilters({
        query: { architecture: Architecture.ARMHF, channel: Channel.FOCAL },
      } as any)).to.deep.include({
        architectures: [Architecture.ARMHF, Architecture.ALL],
      });
    });

    it('throws an error when arch is not specified but channel is', () => {
      expect(() => Package.parseRequestFilters({
        query: { channel: Channel.FOCAL },
      } as any)).to.throw(UserError);
    });

    it('throws an error when channel is not specified but arch is', () => {
      expect(() => Package.parseRequestFilters({
        query: { architecture: Architecture.ARMHF },
      } as any)).to.throw(UserError);
    });
  });

  context('parseFilters', () => {
    it('parses filters, with arch/channel/frameworks specified', () => {
      const parsed = Package.parseFilters({
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
        device_compatibilities: { $in: [
          `${Channel.XENIAL}:${Architecture.ARMHF}:ubuntu-16.04`,
          `${Channel.XENIAL}:${Architecture.ALL}:ubuntu-16.04`,
        ] },
        category: 'Category',
        author: 'Author',
        $text: { $search: 'term' },
        nsfw: { $in: [true] },
        maintainer: 'foobar',
        published: true,
      });
    });

    it('parses filters, with arch/channel specified', () => {
      const parsed = Package.parseFilters({
        architectures: [Architecture.ARMHF, Architecture.ALL],
        channel: Channel.XENIAL,
      });

      expect(parsed).to.deep.equal({
        channel_architectures: { $in: [ChannelArchitecture.XENIAL_ARMHF, ChannelArchitecture.XENIAL_ALL] },
      });
    });
  });

  context('serialization', () => {
    beforeEach(async function() {
      this.now = (new Date()).toISOString();

      this.package = await factory.package({
        id: 'app.id',
        name: 'Best App Ever',
        channels: [DEFAULT_CHANNEL],
        architectures: [Architecture.ARMHF, Architecture.ARM64],
        author: 'Jill',
        category: 'Category',
        description: 'A good app',
        keywords: ['best', 'good'],
        license: 'GNU LGPL v3',
        nsfw: false,
        published_date: this.now,
        tagline: 'such wow',
        types: ['app'],
        updated_date: this.now,
        changelog: 'some changes',
        donate_url: 'https://example.com/donate',
        languages: ['en_US'],
        maintainer: 'jill.id',
        maintainer_name: 'Jill',
        source: 'https://example.com/source',
        support_url: 'https://example.com/support',
        video_url: 'https://example.com/video',
      });
    });

    context('iconUrl', () => {
      it('generates an icon url', function() {
        this.package.createNextRevision('1.0.0', Channel.XENIAL, Architecture.ARMHF, 'ubuntu-sdk-16.04', 'url', 'shasum', 10);
        expect(this.package.icon_url).to.equal('http://local.open-store.io/icons/app.id/app.id-1.0.0.png');
      });

      it('generates an icon url with no version info', function() {
        expect(this.package.icon_url).to.equal('http://local.open-store.io/icons/app.id/app.id-0.0.0.png');
      });
    });

    context('downloadUrl', () => {
      it('generates a download url without a version', function() {
        expect(
          this.package.getDownloadUrl(Channel.XENIAL, Architecture.ARMHF),
        ).to.equal('http://local.open-store.io/api/v3/apps/app.id/download/xenial/armhf');
      });

      it('generates a download url with a version', function() {
        expect(
          this.package.getDownloadUrl(Channel.XENIAL, Architecture.ARMHF, '1.0.0'),
        ).to.equal('http://local.open-store.io/api/v3/apps/app.id/download/xenial/armhf/1.0.0');
      });
    });

    context('serialize', () => {
      it('serializes slimly', function() {
        const serialized = this.package.serializeSlim();

        expect(serialized).to.deep.equal({
          id: 'app.id',
          name: 'Best App Ever',
          icon: 'http://local.open-store.io/icons/app.id/app.id-0.0.0.png',
          channels: [DEFAULT_CHANNEL],
          architectures: [Architecture.ARMHF, Architecture.ARM64],
          author: 'Jill',
          category: 'Category',
          description: 'A good app',
          framework: '',
          keywords: ['best', 'good'],
          license: 'GNU LGPL v3',
          nsfw: false,
          published_date: this.now,
          tagline: 'such wow',
          types: ['app'],
          updated_date: this.now,
          ratings: {
            BUGGY: 0,
            HAPPY: 0,
            NEUTRAL: 0,
            THUMBS_DOWN: 0,
            THUMBS_UP: 0,
          },
        });
      });

      it('serializes fully', function() {
        this.package.channel_architectures = [ChannelArchitecture.XENIAL_ARMHF, ChannelArchitecture.XENIAL_ARM64];
        this.package.device_compatibilities = [
          `${ChannelArchitecture.XENIAL_ARMHF}:ubuntu-sdk-16.04`,
          `${ChannelArchitecture.XENIAL_ARM64}:ubuntu-sdk-16.04`,
        ];
        this.package.createNextRevision('1.0.0', Channel.XENIAL, Architecture.ARMHF, 'ubuntu-sdk-16.04', 'url', 'shasum', 10);
        this.package.createNextRevision('1.0.0', Channel.XENIAL, Architecture.ARM64, 'ubuntu-sdk-16.04', 'url', 'shasum', 10);

        this.package.revisions[0].created_date = this.now;
        this.package.revisions[1].created_date = this.now;
        this.package.updated_date = this.now;

        const serialized = this.package.serialize(Architecture.ARMHF, [], 4);

        expect(serialized).to.deep.equal({
          id: 'app.id',
          name: 'Best App Ever',
          icon: 'http://local.open-store.io/icons/app.id/app.id-1.0.0.png',
          channels: [DEFAULT_CHANNEL],
          architecture: `${Architecture.ARMHF},${Architecture.ARM64}`,
          architectures: [Architecture.ARMHF, Architecture.ARM64],
          channel_architectures: [ChannelArchitecture.XENIAL_ARMHF, ChannelArchitecture.XENIAL_ARM64],
          device_compatibilities: [
            `${ChannelArchitecture.XENIAL_ARMHF}:ubuntu-sdk-16.04`,
            `${ChannelArchitecture.XENIAL_ARM64}:ubuntu-sdk-16.04`,
          ],
          author: 'Jill',
          category: 'Category',
          description: 'A good app',
          framework: 'ubuntu-sdk-16.04',
          keywords: ['best', 'good'],
          license: 'GNU LGPL v3',
          nsfw: false,
          published_date: this.now,
          tagline: 'such wow',
          types: ['app'],
          updated_date: this.now,
          calculated_rating: 0,
          ratings: {
            BUGGY: 0,
            HAPPY: 0,
            NEUTRAL: 0,
            THUMBS_DOWN: 0,
            THUMBS_UP: 0,
          },
          changelog: 'some changes',
          donate_url: 'https://example.com/donate',
          downloads: [
            {
              architecture: Architecture.ARM64,
              channel: Channel.XENIAL,
              created_date: this.now,
              download_sha512: 'shasum',
              download_url: 'http://local.open-store.io/api/v3/apps/app.id/download/xenial/arm64/1.0.0',
              downloads: 0,
              filesize: 10240,
              framework: 'ubuntu-sdk-16.04',
              revision: 2,
              version: '1.0.0',
            },
            {
              architecture: Architecture.ARMHF,
              channel: Channel.XENIAL,
              created_date: this.now,
              download_sha512: 'shasum',
              download_url: 'http://local.open-store.io/api/v3/apps/app.id/download/xenial/armhf/1.0.0',
              downloads: 0,
              filesize: 10240,
              framework: 'ubuntu-sdk-16.04',
              revision: 1,
              version: '1.0.0',
            },
          ],
          filesize: 10240,
          languages: ['en_US'],
          latestDownloads: 0,
          locked: false,
          maintainer: 'jill.id',
          maintainer_name: 'Jill',
          manifest: {},
          published: false,
          screenshots: [],
          source: 'https://example.com/source',
          support_url: 'https://example.com/support',
          video_url: 'https://example.com/video',
          totalDownloads: 0,
          type_override: '',
          revision: -1,
          permissions: [],
          version: '1.0.0',
          download: null,
          download_sha512: '',
          revisions: [
            {
              architecture: Architecture.ARMHF,
              channel: Channel.XENIAL,
              created_date: this.now,
              download_sha512: 'shasum',
              download_url: 'http://local.open-store.io/api/v3/apps/app.id/download/xenial/armhf/1.0.0',
              downloads: 0,
              filesize: 10240,
              framework: 'ubuntu-sdk-16.04',
              revision: 1,
              version: '1.0.0',
            },
            {
              architecture: Architecture.ARM64,
              channel: Channel.XENIAL,
              created_date: this.now,
              download_sha512: 'shasum',
              download_url: 'http://local.open-store.io/api/v3/apps/app.id/download/xenial/arm64/1.0.0',
              downloads: 0,
              filesize: 10240,
              framework: 'ubuntu-sdk-16.04',
              revision: 2,
              version: '1.0.0',
            },
          ],
        });
      });
    });

    context('serializeRatings', () => {
      it('formats ratings', () => {
        expect(serializeRatings([
          { name: Ratings.THUMBS_UP, count: 10 } as any,
          { name: Ratings.THUMBS_DOWN, count: 10 } as any,
        ])).to.deep.equal({
          THUMBS_UP: 10,
          THUMBS_DOWN: 10,
          HAPPY: 0,
          NEUTRAL: 0,
          BUGGY: 0,
        });
      });
    });
  });
});
