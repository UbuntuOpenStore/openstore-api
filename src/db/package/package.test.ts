import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import { Ratings } from 'db/review';
import { UserError } from 'exceptions';
import { Package } from '.';
import { Architecture, Channel, PackageType, DEFAULT_CHANNEL, ChannelArchitecture } from './types';
import { serializeRatings } from './methods';
import { type TestPackage } from 'tests/factory';

describe('Package', () => {
  describe('parseRequestFilters', () => {
    test('parses a request', () => {
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
          channel: Channel.FOCAL,
          nsfw: 'false',
        },
      } as any);

      assert.deepEqual(parsed, {
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
        channel: Channel.FOCAL,
        nsfw: [null, false],
      });
    });

    test('handles types and type', () => {
      assert.deepEqual(Package.parseRequestFilters({
        query: { type: PackageType.APP, types: PackageType.WEBAPP },
      } as any).types, [PackageType.WEBAPP, PackageType.APP]);
    });

    test('adds arch all when the arch is not all', () => {
      assert.deepEqual(Package.parseRequestFilters({
        query: { architecture: Architecture.ARMHF, channel: Channel.FOCAL },
      } as any).architectures, [Architecture.ARMHF, Architecture.ALL]);
    });

    test('does not throw an error when arch is not specified but channel is', () => {
      assert.equal(Package.parseRequestFilters({
        query: { channel: Channel.FOCAL },
      } as any).channel, Channel.FOCAL);
    });

    test('throws an error when channel is not specified but arch is', () => {
      assert.throws(() => Package.parseRequestFilters({
        query: { architecture: Architecture.ARMHF },
      } as any), UserError);
    });
  });

  describe('parseFilters', () => {
    test('parses filters, with arch/channel/frameworks specified', () => {
      const parsed = Package.parseFilters({
        types: [PackageType.APP, PackageType.WEBAPP],
        ids: ['foo.bar'],
        frameworks: ['ubuntu-16.04'],
        architectures: [Architecture.ARMHF, Architecture.ALL],
        category: 'Category',
        author: 'Author',
        channel: Channel.FOCAL,
        search: 'term',
        nsfw: [true],
        maintainer: 'foobar',
        published: true,
      });

      assert.deepEqual(parsed, {
        types: { $in: [PackageType.APP, PackageType.WEBAPP] },
        id: { $in: ['foo.bar'] },
        device_compatibilities: {
          $in: [
          `${Channel.FOCAL}:${Architecture.ARMHF}:ubuntu-16.04`,
          `${Channel.FOCAL}:${Architecture.ALL}:ubuntu-16.04`,
          ],
        },
        category: 'Category',
        author: 'Author',
        $text: { $search: 'term' },
        nsfw: { $in: [true] },
        maintainer: 'foobar',
        published: true,
      });
    });

    test('parses filters, with arch/channel specified', () => {
      const parsed = Package.parseFilters({
        architectures: [Architecture.ARMHF, Architecture.ALL],
        channel: Channel.FOCAL,
      });

      assert.deepEqual(parsed, {
        channel_architectures: { $in: [ChannelArchitecture.FOCAL_ARMHF, ChannelArchitecture.FOCAL_ALL] },
      });
    });
  });

  describe('serialization', () => {
    const now = (new Date()).toISOString();
    let package1: TestPackage;

    beforeEach(() => {
      package1 = new Package({
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
        published_date: now,
        tagline: 'such wow',
        types: [PackageType.APP],
        updated_date: now,
        changelog: 'some changes',
        donate_url: 'https://example.com/donate',
        languages: ['en_US'],
        maintainer: 'jill.id',
        maintainer_name: 'Jill',
        source: 'https://example.com/source',
        support_url: 'https://example.com/support',
        video_url: 'https://example.com/video',
        translation_url: 'https://example.com/translations',
      });
    });

    describe('iconUrl', () => {
      test('generates an icon url', () => {
        package1.createNextRevision('1.0.0', Channel.FOCAL, Architecture.ARMHF, 'ubuntu-sdk-16.04', 'url', 'shasum', 10, 8);
        assert.equal(package1.icon_url, 'http://local.open-store.io/icons/app.id/app.id-1.0.0.png');
      });

      test('generates an icon url with no version info', () => {
        assert.equal(package1.icon_url, 'http://local.open-store.io/icons/app.id/app.id-0.0.0.png');
      });
    });

    describe('downloadUrl', () => {
      test('generates a download url without a version', () => {
        assert.equal(
          package1.getDownloadUrl(Channel.FOCAL, Architecture.ARMHF),
          'http://local.open-store.io/api/v3/apps/app.id/download/focal/armhf',
        );
      });

      test('generates a download url with a version', () => {
        assert.equal(
          package1.getDownloadUrl(Channel.FOCAL, Architecture.ARMHF, '1.0.0'),
          'http://local.open-store.io/api/v3/apps/app.id/download/focal/armhf/1.0.0',
        );
      });
    });

    describe('serialize', () => {
      test('serializes slimly', () => {
        const serialized = package1.serializeSlim();

        assert.deepEqual(serialized, {
          id: 'app.id',
          name: 'Best App Ever',
          icon: 'http://local.open-store.io/icons/app.id/app.id-0.0.0.png',
          channels: [DEFAULT_CHANNEL],
          architectures: [Architecture.ARMHF, Architecture.ARM64],
          author: 'Jill',
          publisher: 'Jill',
          category: 'Category',
          description: 'A good app',
          framework: '',
          keywords: ['best', 'good'],
          license: 'GNU LGPL v3',
          nsfw: false,
          published_date: now,
          tagline: 'such wow',
          types: ['app'],
          updated_date: now,
          ratings: {
            BUGGY: 0,
            HAPPY: 0,
            NEUTRAL: 0,
            THUMBS_DOWN: 0,
            THUMBS_UP: 0,
          },
        });
      });

      test('serializes fully', () => {
        package1.channel_architectures = [ChannelArchitecture.FOCAL_ARMHF, ChannelArchitecture.FOCAL_ARM64];
        package1.device_compatibilities = [
          `${ChannelArchitecture.FOCAL_ARMHF}:ubuntu-sdk-16.04`,
          `${ChannelArchitecture.FOCAL_ARM64}:ubuntu-sdk-16.04`,
        ];
        package1.createNextRevision('1.0.0', Channel.FOCAL, Architecture.ARMHF, 'ubuntu-sdk-16.04', 'url', 'shasum', 10, 8);
        package1.createNextRevision('1.0.0', Channel.FOCAL, Architecture.ARM64, 'ubuntu-sdk-16.04', 'url', 'shasum', 10, 8);

        package1.revisions[0].created_date = now;
        package1.revisions[1].created_date = now;
        package1.updated_date = now;

        const serialized = package1.serialize(Architecture.ARMHF, DEFAULT_CHANNEL, [], 4);

        assert.deepEqual(serialized, {
          id: 'app.id',
          name: 'Best App Ever',
          icon: 'http://local.open-store.io/icons/app.id/app.id-1.0.0.png',
          channels: [DEFAULT_CHANNEL],
          architecture: '',
          architectures: [Architecture.ARMHF, Architecture.ARM64],
          channel_architectures: [ChannelArchitecture.FOCAL_ARMHF, ChannelArchitecture.FOCAL_ARM64],
          device_compatibilities: [
            `${ChannelArchitecture.FOCAL_ARMHF}:ubuntu-sdk-16.04`,
            `${ChannelArchitecture.FOCAL_ARM64}:ubuntu-sdk-16.04`,
          ],
          author: 'Jill',
          publisher: 'Jill',
          category: 'Category',
          description: 'A good app',
          framework: '',
          keywords: ['best', 'good'],
          license: 'GNU LGPL v3',
          nsfw: false,
          published_date: now,
          tagline: 'such wow',
          types: ['app'],
          updated_date: now,
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
          review_exceptions: [],
          downloads: [
            {
              architecture: Architecture.ARM64,
              channel: Channel.FOCAL,
              created_date: now,
              download_sha512: 'shasum',
              download_url: 'http://local.open-store.io/api/v3/apps/app.id/download/focal/arm64/1.0.0',
              downloads: 0,
              downloadSize: 8,
              installedSize: 10240,
              filesize: 10240,
              framework: 'ubuntu-sdk-16.04',
              revision: 2,
              version: '1.0.0',
              permissions: [],
            },
            {
              architecture: Architecture.ARMHF,
              channel: Channel.FOCAL,
              created_date: now,
              download_sha512: 'shasum',
              download_url: 'http://local.open-store.io/api/v3/apps/app.id/download/focal/armhf/1.0.0',
              downloads: 0,
              downloadSize: 8,
              installedSize: 10240,
              filesize: 10240,
              framework: 'ubuntu-sdk-16.04',
              revision: 1,
              version: '1.0.0',
              permissions: [],
            },
          ],
          filesize: 10240,
          languages: ['en_US'],
          latestDownloads: 0,
          locked: false,
          maintainer: 'jill.id',
          maintainer_name: 'Jill',
          manifest: { hooks: {} },
          published: false,
          screenshots: [],
          source: 'https://example.com/source',
          support_url: 'https://example.com/support',
          video_url: 'https://example.com/video',
          translation_url: 'https://example.com/translations',
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
              channel: Channel.FOCAL,
              created_date: now,
              download_sha512: 'shasum',
              download_url: 'http://local.open-store.io/api/v3/apps/app.id/download/focal/armhf/1.0.0',
              downloads: 0,
              downloadSize: 8,
              installedSize: 10240,
              filesize: 10240,
              framework: 'ubuntu-sdk-16.04',
              revision: 1,
              version: '1.0.0',
              permissions: [],
            },
            {
              architecture: Architecture.ARM64,
              channel: Channel.FOCAL,
              created_date: now,
              download_sha512: 'shasum',
              download_url: 'http://local.open-store.io/api/v3/apps/app.id/download/focal/arm64/1.0.0',
              downloads: 0,
              downloadSize: 8,
              installedSize: 10240,
              filesize: 10240,
              framework: 'ubuntu-sdk-16.04',
              revision: 2,
              version: '1.0.0',
              permissions: [],
            },
          ],
        });
      });
    });

    describe('serializeRatings', () => {
      test('formats ratings', () => {
        assert.deepEqual(serializeRatings([
          { name: Ratings.THUMBS_UP, count: 10 } as any,
          { name: Ratings.THUMBS_DOWN, count: 10 } as any,
        ]), {
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
