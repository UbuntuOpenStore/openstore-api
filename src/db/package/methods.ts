/* eslint-disable no-param-reassign */

import { type Schema } from 'mongoose';
import path from 'path';
import fs from 'fs/promises';

import { sanitize, type ClickParserData, config, moveFile, sha512Checksum } from 'utils';
import { type HydratedRatingCount } from 'db/rating_count/types';
import { v4 } from 'uuid';
import {
  EXISTING_VERSION,
  MALFORMED_MANIFEST,
  MISMATCHED_FRAMEWORK,
  MISMATCHED_PERMISSIONS,
  NO_ALL,
  NO_NON_ALL,
  WRONG_PACKAGE,
} from 'utils/error-messages';
import { UserError } from 'exceptions';
import * as clickParser from 'utils/click-parser-async';
import { isURL } from 'class-validator';
import { difference } from 'lodash';
import {
  type PackageModel,
  Architecture,
  type BodyUpdate,
  Channel,
  type SerializedRatings,
  type SerializedPackageSlim,
  type SerializedDownload,
  DEFAULT_CHANNEL,
  type SerializedPackage,
  type File,
  type ChannelArchitecture,
  type IPackage,
  type IPackageMethods,
  type HydratedPackage,
  type HydratedRevision,
} from './types';
import { User } from '../user';

/*
  The filesize is stored in kilobytes (from the click package
  https://gitlab.com/ubports/development/core/click/-/blob/main/click_package/build.py#L241
*/
function toBytes(filesizeKb: number) {
  return filesizeKb * 1024;
}

export function serializeRatings(ratingCounts: HydratedRatingCount[]) {
  const ratings = {
    THUMBS_UP: 0,
    THUMBS_DOWN: 0,
    HAPPY: 0,
    NEUTRAL: 0,
    BUGGY: 0,
  };

  if (Array.isArray(ratingCounts)) {
    // eslint-disable-next-line no-restricted-syntax
    for (const r of ratingCounts) {
      ratings[r.name] = r.count;
    }
  }

  return ratings;
}

export function setupMethods(packageSchema: Schema<IPackage, PackageModel, IPackageMethods>) {
  packageSchema.method<HydratedPackage>('getLatestRevision', function (
    channel: Channel,
    arch: Architecture,
    detectAll = true,
    frameworks?: string[],
    version?: string,
  ) {
    let architecture = arch;
    if (this.architectures.includes(Architecture.ALL) && detectAll) {
      architecture = Architecture.ALL;
    }

    let revisionData: HydratedRevision | null = null;
    let revisionIndex = -1;
    this.revisions.forEach((data, index) => {
      let archCheck = data.architecture === architecture;
      if (data.architecture && data.architecture.includes(',')) {
        // Handle multi arch clicks
        archCheck = data.architecture.includes(architecture);
      }

      if (
        (!revisionData || revisionData.revision < data.revision) &&
        data.channel === channel &&
        (!arch || archCheck) &&
        (!frameworks || frameworks.length === 0 || frameworks.includes(data.framework)) &&
        (!version || version === data.version)
      ) {
        revisionData = data;
        revisionIndex = index;
      }
    });

    return { revisionData, revisionIndex };
  });

  packageSchema.method<HydratedPackage>('updateFromClick', function (data: ClickParserData) {
    const manifest = {
      architecture: data.architecture,
      changelog: data.changelog,
      description: data.description,
      framework: data.framework,
      // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
      hooks: {} as { [key: string]: any },
      maintainer: data.maintainer,
      name: data.name,
      title: data.title,
      version: data.version,
    };

    let qmlImports: { module: string; version: string }[] = [];
    data.apps.forEach((app) => {
      const hook: { [key: string]: any } = {};

      if (Object.keys(app.apparmor).length > 0) {
        hook.apparmor = app.apparmor;
      }

      if (Object.keys(app.desktop).length > 0) {
        hook.desktop = app.desktop;
      }

      if (Object.keys(app.contentHub).length > 0) {
        hook['content-hub'] = app.contentHub;
      }

      if (Object.keys(app.urlDispatcher).length > 0) {
        hook.urls = app.urlDispatcher;
      }

      if (Object.keys(app.accountService).length > 0) {
        hook['account-application'] = app.accountService;
      }

      if (Object.keys(app.accountApplication).length > 0) {
        hook['account-service'] = app.accountApplication;
      }

      if (Object.keys(app.pushHelper).length > 0) {
        hook['push-helper'] = app.pushHelper;
      }

      if (Object.keys(app.webappProperties).length > 0) {
        hook['webapp-properties'] = app.webappProperties;
      }

      if (Object.keys(app.scopeIni).length > 0) {
        hook.scope = {};

        Object.keys(app.scopeIni).forEach((key) => {
          // Remove any ini properties with a `.` as mongo will reject them
          hook.scope[key.replace(/\./g, '__')] = app.scopeIni[key];
        });
      }

      // Mongo will reject this if there are any `.`s
      manifest.hooks[app.name.replace(/\./g, '__')] = hook;

      qmlImports = qmlImports.concat(app.qmlImports);
    });

    this.architecture = data.architecture;
    // this.author = data.maintainer; < No longer updating the author from the click because that can be faked
    this.id = data.name;
    this.manifest = manifest;
    this.types = this.type_override ? [this.type_override] : data.types;
    this.languages = data.languages;
    this.qml_imports = qmlImports;

    // Don't overwrite the these if they already exists
    this.name = this.name ? this.name : data.title;
    this.description = this.description ? this.description : sanitize(data.description);
    this.tagline = this.tagline ? this.tagline : sanitize(data.description);
  });

  packageSchema.method<HydratedPackage>('updateFromBody', async function (body: BodyUpdate) {
    if (body.locked !== undefined) {
      this.locked = (body.locked === 'true' || body.locked === true);
    }

    if (body.published !== undefined) {
      this.published = (body.published === 'true' || body.published === true);
    }

    if (!this.published_date && this.published) {
      this.published_date = (new Date()).toISOString();
      this.updated_date = (new Date()).toISOString();
    }

    this.name = body.name ? body.name : this.name;
    this.category = body.category ?? this.category;
    this.license = body.license ?? this.license;
    this.changelog = sanitize(body.changelog ?? this.changelog ?? '');
    this.description = sanitize(body.description ?? this.description ?? '');
    this.tagline = sanitize(body.tagline ?? this.tagline ?? '');

    this.source = (isURL(body.source ?? '') || body.source === '') ? body.source : (this.source ?? '');
    this.support_url = (isURL(body.support_url ?? '') || body.support_url === '') ? body.support_url : (this.support_url ?? '');
    this.donate_url = (isURL(body.donate_url ?? '') || body.donate_url === '') ? body.donate_url : (this.donate_url ?? '');
    this.translation_url = (isURL(body.translation_url ?? '') || body.translation_url === '')
      ? body.translation_url
      : (this.translation_url ?? '');

    if ((body.video_url && isURL(body.video_url)) || body.video_url === '') {
      // TODO support regular urls and transform them into embedded urls
      if (
        body.video_url.indexOf('https://www.youtube.com/embed/') === 0 ||
        body.video_url.indexOf('https://odysee.com/$/embed/') === 0
      ) {
        this.video_url = body.video_url;
      }
      else {
        this.video_url = '';
      }
    }

    let updatedScreenshots: string[] = [];
    if (body.screenshots) {
      if (Array.isArray(body.screenshots)) {
        updatedScreenshots = body.screenshots;
      }
      else {
        updatedScreenshots = JSON.parse(body.screenshots);
      }
    }

    const regex = new RegExp(`${config.server.host}/screenshots/`, 'g');
    updatedScreenshots = updatedScreenshots.map((screenshot) => {
      return screenshot.replace(regex, '');
    });

    // Unlink the screenshot file if it gets removed
    // eslint-disable-next-line no-restricted-syntax
    for (const screenshot of this.screenshots) {
      const filename = screenshot.replace(regex, '');
      if (!updatedScreenshots.includes(filename)) {
        await fs.unlink(`${config.image_dir}/${filename}`);
      }
    }
    this.screenshots = updatedScreenshots;

    let keywords = body.keywords ?? [];
    if (!Array.isArray(keywords)) {
      keywords = keywords.split(',');
    }

    this.keywords = keywords.map((keyword) => keyword.trim());

    if (body.nsfw !== undefined) {
      this.nsfw = body.nsfw;
    }

    if (body.type_override !== undefined) {
      this.type_override = body.type_override;

      if (body.type_override) {
        this.types = [body.type_override];
      }
    }

    if (body.maintainer !== undefined) {
      this.maintainer = body.maintainer;
    }

    if (this.maintainer) {
      const user = await User.findById(this.maintainer);
      if (user) {
        this.maintainer_name = user.name ? user.name : user.username;
        this.author = this.maintainer_name;
      }
    }
  });

  packageSchema.method<HydratedPackage>('createNextRevision', function (
    version: string,
    channel: Channel,
    architecture: Architecture,
    framework: string,
    url: string,
    downloadSha512: string,
    installedSize: number,
    downloadSize: number,
    permissions: string[] = [],
  ) {
    this.revisions.push({
      revision: this.next_revision,
      version,
      downloads: 0,
      channel,
      download_url: url,
      download_sha512: downloadSha512,
      architecture,
      framework,
      filesize: installedSize,
      downloadSize,
      created_date: (new Date()).toISOString(),
      permissions,
    });

    this.updated_date = (new Date()).toISOString();
  });

  packageSchema.method<HydratedPackage>('getClickFilePath', function (channel: Channel, arch: Architecture, version: string) {
    return path.join(config.data_dir, `${this.id as string}-${channel}-${arch}-${version}.click`);
  });

  packageSchema.method<HydratedPackage>('getIconFilePath', function (ext: string) {
    return path.join(config.icon_dir, `${this.id as string}${ext}`);
  });

  packageSchema.method<HydratedPackage>('getDownloadUrl', function (channel: Channel, arch: Architecture, version?: string) {
    let url: string = `${config.server.host}/api/v3/apps/${this.id as string}/download/${channel}/${arch}`;
    if (version) {
      url = `${url}/${version}`;
    }

    return url;
  });

  /* eslint-disable no-restricted-syntax */
  packageSchema.method<HydratedPackage>('serializeRatings', function (): SerializedRatings {
    return serializeRatings(this.rating_counts);
  });

  packageSchema.method<HydratedPackage>('serializeSlim', function (): SerializedPackageSlim {
    /*
      Data used by the app:
      - https://gitlab.com/theopenstore/openstore-app/-/blob/master/src/models/searchmodel.cpp#L158-163
      - id
      - name
      - tagline
      - icon
      - types
      - ratings

      Data used by the web:
      - https://gitlab.com/theopenstore/openstore-web/-/blob/master/src/views/Browse.vue
      - icon
      - name
      - ratings
      - id
      - nsfw
      - tagline
      - types
    */

    return {
      architectures: this.architectures || [],
      publisher: this.author || '',
      name: this.name || '',
      id: this.id || '',
      category: this.category || '',
      channels: this.channels || [],
      description: this.description || '',
      icon: this.icon_url,
      keywords: this.keywords || [],
      license: this.license || 'Proprietary',
      nsfw: !!this.nsfw,
      published_date: this.published_date || '',
      tagline: this.tagline || '',
      types: this.types || [],
      updated_date: this.updated_date || '',
      ratings: this.serializeRatings(),

      // Deprecated, remove in the next major version
      framework: '',
      author: this.author || '',
    };
  });

  /*
    Fields used by the app:
    - https://gitlab.com/theopenstore/openstore-app/-/blob/master/src/package.cpp#L112-188
    Fields used by the web:
    - https://gitlab.com/theopenstore/openstore-web/-/blob/master/src/views/ManagePackage.vue
    - https://gitlab.com/theopenstore/openstore-web/-/blob/master/src/views/Package.vue
  */
  packageSchema.method<HydratedPackage>('serialize', function (
    architecture: Architecture = Architecture.ARMHF,
    channel: Channel = DEFAULT_CHANNEL,
    frameworks: string[] = [],
    apiVersion = 4,
  ): SerializedPackage {
    // Clean up languages that got screwed up by click-parser
    let languages = this.languages ? this.languages.sort() : [];
    languages = languages.map((language) => {
      let cleanLanguage = language;
      if (language.includes('/')) {
        const split = language.split('/');
        cleanLanguage = split[split.length - 1];
      }

      return cleanLanguage;
    });

    let defaultChannel = channel;
    if (!this.channels.includes(defaultChannel) && this.channels.length > 0) {
      defaultChannel = this.channels[0];
    }

    const { revisionData } = this.getLatestRevision(defaultChannel, this.architectures.includes(architecture) ? architecture : undefined);
    const installedSize = revisionData ? toBytes(revisionData.filesize) : 0;

    const revisions = (this.revisions || []).map((rData) => {
      const revision = {
        ...rData.toObject(),
        _id: undefined,
        download_url: rData.download_url ? this.getDownloadUrl(rData.channel, rData.architecture, rData.version) : null,
        installedSize: toBytes(rData.filesize),
        downloadSize: rData.downloadSize ?? 0,

        // TODO deprecate
        filesize: toBytes(rData.filesize),
      };

      delete revision._id;
      return revision;
    });

    const json = {
      architectures: this.architectures || [],
      category: this.category || '',
      changelog: this.changelog || '',
      channels: this.channels || [DEFAULT_CHANNEL],
      channel_architectures: this.channel_architectures || [],
      device_compatibilities: this.device_compatibilities || [],
      description: this.description || '',
      downloads: [] as SerializedDownload[],
      icon: this.icon_url,
      id: this.id || '',
      keywords: this.keywords || [],
      license: this.license || 'Proprietary',
      maintainer_name: this.maintainer_name || null,
      maintainer: this.maintainer || null,
      manifest: this.manifest || {},
      name: this.name || '',
      nsfw: !!this.nsfw,
      published_date: this.published_date || '',
      published: !!this.published,
      locked: !!this.locked,
      screenshots: this.screenshots.map((file) => {
        return `${config.server.host}/screenshots/${file}`;
      }),
      source: this.source || '',
      support_url: this.support_url || '',
      donate_url: this.donate_url || '',
      video_url: this.video_url || '',
      translation_url: this.translation_url || '',
      tagline: this.tagline || '',
      types: this.types || [],
      updated_date: this.updated_date || '',
      languages,
      revisions,
      totalDownloads: 0,
      latestDownloads: 0,
      version: revisionData ? revisionData.version : '',
      ratings: this.serializeRatings(),
      type_override: this.type_override || '',
      calculated_rating: this.calculated_rating || 0,
      publisher: this.author || '',
      review_exceptions: this.review_exceptions ?? [],

      // Deprecated, remove in the next major version
      author: this.author || '',
      architecture: '',
      framework: '',
      revision: -1,
      download: null,
      download_sha512: '',
      filesize: installedSize,
      permissions: [],
    };

    if (this.revisions) {
      const jsonDownloads = Object.values(Channel)
        .reduce<(SerializedDownload | null)[]>((downloads: (SerializedDownload | null)[], channel: Channel) => {
        return [...downloads, ...this.architectures.map((arch) => {
          if (!Object.values(Architecture).includes(arch)) {
            return null; // Filter out unsupported arches like i386 (legacy apps)
          }

          const { revisionData: downloadRevisionData } = this.getLatestRevision(channel, arch, false, frameworks);

          if (downloadRevisionData) {
            const download = {
              ...downloadRevisionData.toObject(),
              _id: undefined,
              architecture: downloadRevisionData.architecture.includes(',') ? arch : downloadRevisionData.architecture,
              download_url: this.getDownloadUrl(channel, arch, downloadRevisionData.version),
              installedSize: toBytes(downloadRevisionData.filesize),
              downloadSize: downloadRevisionData.downloadSize ?? 0,

              // TODO deprecate
              filesize: toBytes(downloadRevisionData.filesize),
            };

            delete download._id;
            return download;
          }

          return null;
        })];
      }, []).filter((revision) => (revision?.download_url)) as SerializedDownload[];

      jsonDownloads.sort((a, b) => {
        // Sort xenial to the bottom
        if (a.channel !== b.channel) {
          if (b.channel === Channel.XENIAL) {
            return -1;
          }

          return 1;
        }

        // TODO is this hack still needed?
        // Make sure the current architecture is last to not break old versions of the app
        if (a.architecture === architecture) {
          return 1;
        }
        if (b.architecture === architecture) {
          return -1;
        }

        return 0;
      });

      if (apiVersion === 3) {
        json.downloads = jsonDownloads.filter((download) => (
          download.architecture === architecture || download.architecture === Architecture.ALL
        ));
      }
      else {
        json.downloads = jsonDownloads;
      }

      jsonDownloads.filter((download) => (
        download.channel === channel
      )).forEach((download) => {
        json.latestDownloads += download.downloads;
      });

      this.revisions.forEach((revision) => {
        json.totalDownloads += revision.downloads;
      });
    }

    return json;
  });

  packageSchema.method<HydratedPackage>('updateScreenshotFiles', async function (screenshotFiles: File[]) {
    // Clear out the uploaded files that are over the limit
    let screenshotLimit = 5 - this.screenshots.length;
    if (screenshotFiles.length < screenshotLimit) {
      screenshotLimit = screenshotFiles.length;
    }

    if (screenshotFiles.length > screenshotLimit) {
      for (let i = screenshotLimit; i < screenshotFiles.length; i++) {
        await fs.unlink(screenshotFiles[i].path);
      }
    }

    for (let i = 0; i < screenshotLimit; i++) {
      const file = screenshotFiles[i];

      const ext = path.extname(file.originalname);
      if (!['.png', '.jpg', '.jpeg'].includes(ext)) {
        // Reject anything not an image we support
        await fs.unlink(file.path);
      }
      else {
        const id = v4();
        const filename = `${this.id as string}-screenshot-${id}${ext}`;

        await moveFile(
          screenshotFiles[i].path,
          `${config.image_dir}/${filename}`,
        );

        this.screenshots.push(filename);
      }
    }
  });

  packageSchema.method<HydratedPackage>('createRevisionFromClick', async function (filePath: string, channel: Channel, changelog?: string) {
    const parseData = await clickParser.parseClickPackage(filePath, true);
    const { version, architecture } = parseData;
    if (!parseData.name || !version || !architecture) {
      throw new UserError(MALFORMED_MANIFEST);
    }

    if (parseData.name !== this.id) {
      throw new UserError(WRONG_PACKAGE);
    }

    if (this.revisions) {
      // Check for existing revisions (for this channel) with the same version string

      const matches = this.revisions.find((revision) => {
        return (
          revision.version === version &&
          revision.channel === channel &&
          revision.architecture === architecture
        );
      });

      if (matches) {
        throw new UserError(EXISTING_VERSION);
      }

      const currentRevisions = this.revisions.filter((rev) => rev.version === version && rev.channel === channel);
      if (currentRevisions.length > 0) {
        const currentArches = currentRevisions.map((rev) => rev.architecture);
        if (architecture === Architecture.ALL && !currentArches.includes(Architecture.ALL)) {
          throw new UserError(NO_ALL);
        }
        if (architecture !== Architecture.ALL && currentArches.includes(Architecture.ALL)) {
          throw new UserError(NO_NON_ALL);
        }

        if (parseData.framework !== currentRevisions[0].framework) {
          throw new UserError(MISMATCHED_FRAMEWORK);
        }

        const permissions = currentRevisions[0].permissions ?? [];
        if (permissions.length > 0 && difference(parseData.permissions, permissions).length > 0) {
          throw new UserError(MISMATCHED_PERMISSIONS);
        }
      }
    }

    // Only update the data from the parsed click if it's for the default channel or if it's the first one
    const data = (channel === DEFAULT_CHANNEL || this.revisions.length === 0) ? parseData : null;
    const downloadSha512 = await sha512Checksum(filePath);
    const downloadSize = (await fs.stat(filePath)).size;

    if (data) {
      this.updateFromClick(data);
    }

    const localFilePath = this.getClickFilePath(channel, architecture, version);
    await fs.copyFile(filePath, localFilePath);
    await fs.unlink(filePath);

    this.createNextRevision(
      version,
      channel,
      architecture,
      parseData.framework,
      localFilePath,
      downloadSha512,
      parseData.installedSize,
      downloadSize,
      parseData.permissions,
    );

    if (parseData.icon) {
      const ext = path.extname(parseData.icon).toLowerCase();
      if (['.png', '.jpg', '.jpeg', '.svg'].includes(ext)) {
        const localIconPath = this.getIconFilePath(ext);
        await fs.copyFile(parseData.icon, localIconPath);

        this.icon = localIconPath;
      }

      await fs.unlink(parseData.icon);
    }

    if (changelog) {
      const updatedChangelog = this.changelog ? `${changelog.trim()}\n\n${this.changelog}` : changelog.trim();
      this.changelog = sanitize(updatedChangelog);
    }

    if (!this.channels.includes(channel)) {
      this.channels.push(channel);
    }

    if (this.architectures.includes(Architecture.ALL) && architecture !== Architecture.ALL) {
      this.architectures = [architecture];
    }
    else if (!this.architectures.includes(Architecture.ALL) && architecture === Architecture.ALL) {
      this.architectures = [Architecture.ALL];
    }
    else if (!this.architectures.includes(architecture)) {
      this.architectures.push(architecture);
    }
  });

  packageSchema.method<HydratedPackage>('updateCalculatedProperties', async function () {
    this.channel_architectures = this.channels.flatMap((channel) => {
      return this.architectures.map((arch) => {
        const { revisionData } = this.getLatestRevision(channel, arch, false);

        return revisionData ? `${channel}:${arch}` : undefined;
      });
    }).filter(Boolean) as ChannelArchitecture[];

    const deviceCompatibilities = new Set<string>();
    this.revisions.forEach((revision) => {
      // Only include clicks where the file is still present
      if (revision.download_url) {
        deviceCompatibilities.add(`${revision.channel}:${revision.architecture}:${revision.framework}`);
      }
    });

    this.device_compatibilities = Array.from(deviceCompatibilities);
  });
}
