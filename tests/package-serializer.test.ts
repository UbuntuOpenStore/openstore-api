import factory from './factory';

import { expect } from './helper';
import { iconUrl, downloadUrl, serialize, serializeRatings } from '../src/db/package/serializer';
import { Ratings } from '../src/db/review/constants';
import { Architecture, Channel, DEFAULT_CHANNEL } from '../src/db/package/types';

describe('PackageSerializer', () => {
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
      framework: 'ubuntu-16.04',
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
      this.package.newRevision('1.0.0', Channel.XENIAL, Architecture.ARMHF, 'ubuntu-sdk-16.04', 'url', 'shasum', 10);
      expect(iconUrl(this.package)).to.equal('http://local.open-store.io/icons/app.id/app.id-1.0.0.png');
    });

    it('generates an icon url with no version info', function() {
      expect(iconUrl(this.package)).to.equal('http://local.open-store.io/icons/app.id/app.id-0.0.0.png');
    });
  });

  context('downloadUrl', () => {
    it('generates a download url without a version', function() {
      expect(
        downloadUrl(this.package, Channel.XENIAL, Architecture.ARMHF),
      ).to.equal('http://local.open-store.io/api/v3/apps/app.id/download/xenial/armhf');
    });

    it('generates a download url with a version', function() {
      expect(
        downloadUrl(this.package, Channel.XENIAL, Architecture.ARMHF, '1.0.0'),
      ).to.equal('http://local.open-store.io/api/v3/apps/app.id/download/xenial/armhf/1.0.0');
    });
  });

  context('serialize', () => {
    it('serializes slimly', function() {
      const serialized = serialize(this.package, true, Architecture.ARMHF, 4);

      expect(serialized).to.deep.equal({
        id: 'app.id',
        name: 'Best App Ever',
        icon: 'http://local.open-store.io/icons/app.id/app.id-0.0.0.png',
        channels: [DEFAULT_CHANNEL],
        architectures: [Architecture.ARMHF, Architecture.ARM64],
        author: 'Jill',
        category: 'Category',
        description: 'A good app',
        framework: 'ubuntu-16.04',
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
      this.package.newRevision('1.0.0', Channel.XENIAL, Architecture.ARMHF, 'ubuntu-sdk-16.04', 'url', 'shasum', 10);
      this.package.newRevision('1.0.0', Channel.XENIAL, Architecture.ARM64, 'ubuntu-sdk-16.04', 'url', 'shasum', 10);

      this.package.revisions[0].created_date = this.now;
      this.package.revisions[1].created_date = this.now;
      this.package.updated_date = this.now;

      const serialized = serialize(this.package, false, Architecture.ARMHF, 4);

      expect(serialized).to.deep.equal({
        id: 'app.id',
        name: 'Best App Ever',
        icon: 'http://local.open-store.io/icons/app.id/app.id-1.0.0.png',
        channels: [DEFAULT_CHANNEL],
        architecture: `${Architecture.ARMHF},${Architecture.ARM64}`,
        architectures: [Architecture.ARMHF, Architecture.ARM64],
        author: 'Jill',
        category: 'Category',
        description: 'A good app',
        framework: 'ubuntu-16.04',
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
            download_url: 'http://local.open-store.io/api/v3/apps/app.id/download/xenial/arm64',
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
            download_url: 'http://local.open-store.io/api/v3/apps/app.id/download/xenial/armhf',
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
