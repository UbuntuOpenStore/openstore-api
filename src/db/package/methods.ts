/* eslint-disable no-param-reassign */

import { Schema } from 'mongoose';
import path from 'path';
import fs from 'fs/promises';

import { sanitize, ClickParserData, config, moveFile, sha512Checksum } from 'utils';
import { RatingCountDoc } from 'db/rating_count/types';
import { v4 } from 'uuid';
import { EXISTING_VERSION, MALFORMED_MANIFEST, MISMATCHED_FRAMEWORK, NO_ALL, NO_NON_ALL, WRONG_PACKAGE } from 'utils/error-messages';
import { UserError } from 'exceptions';
import * as clickParser from 'utils/click-parser-async';
import {
  RevisionDoc,
  PackageDoc,
  PackageModel,
  Architecture,
  BodyUpdate,
  Channel,
  SerializedRatings,
  SerializedPackageSlim,
  SerializedDownload,
  DEFAULT_CHANNEL,
  SerializedPackage,
  File,
} from './types';
import { User } from '../user';

function toBytes(filesize: number) {
  return filesize * 1024;
}

export function serializeRatings(ratingCounts: RatingCountDoc[]) {
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

export function setupMethods(packageSchema: Schema<PackageDoc, PackageModel>) {
  packageSchema.methods.getLatestRevision = function(channel, arch, detectAll = true, frameworks = null, version = null) {
    let architecture = arch;
    if (this.architectures.includes(Architecture.ALL) && detectAll) {
      architecture = Architecture.ALL;
    }

    let revisionData: RevisionDoc | null = null;
    let revisionIndex = -1;
    this.revisions.forEach((data, index) => {
      let archCheck = data.architecture == architecture;
      if (data.architecture && data.architecture.includes(',')) {
        // Handle multi arch clicks
        archCheck = data.architecture.includes(architecture);
      }

      if (
        (!revisionData || revisionData.revision < data.revision) &&
        data.channel == channel &&
        (!arch || archCheck) &&
        (!frameworks || frameworks.includes(data.framework)) &&
        (!version || version == data.version)
      ) {
        revisionData = data;
        revisionIndex = index;
      }
    });

    return { revisionData, revisionIndex };
  };

  packageSchema.methods.updateFromClick = function(data: ClickParserData) {
    const manifest = {
      architecture: data.architecture,
      changelog: data.changelog,
      description: data.description,
      framework: data.framework,
      hooks: <{ [key: string]: any }>{},
      maintainer: data.maintainer,
      name: data.name,
      title: data.title,
      version: data.version,
    };

    let qmlImports: { module: string; version: string; }[] = [];
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
    this.author = data.maintainer;
    this.id = data.name;
    this.manifest = manifest;
    this.types = this.type_override ? [this.type_override] : data.types;
    this.version = data.version;
    this.languages = data.languages;
    this.framework = data.framework;
    this.qml_imports = qmlImports;

    // Don't overwrite the these if they already exists
    this.name = this.name ? this.name : data.title;
    this.description = this.description ? this.description : sanitize(data.description);
    this.tagline = this.tagline ? this.tagline : sanitize(data.description);
  };

  packageSchema.methods.updateFromBody = async function(body: BodyUpdate) {
    if (body.name) {
      this.name = body.name;
    }

    if (body.published !== undefined) {
      this.published = (body.published == 'true' || body.published === true);
    }

    if (!this.published_date && this.published) {
      this.published_date = (new Date()).toISOString();
      this.updated_date = (new Date()).toISOString();
    }

    if (body.locked !== undefined) {
      this.locked = (body.locked == 'true' || body.locked === true);
    }

    if (body.category || body.category === '') {
      this.category = body.category;
    }

    if (body.changelog || body.changelog === '') {
      this.changelog = body.changelog;
    }

    if (body.description || body.description === '') {
      this.description = body.description;
    }

    if (body.license || body.license === '') {
      this.license = body.license;
    }

    if (body.source || body.source === '') {
      if (body.source.indexOf('https://') === 0 || body.source.indexOf('http://') === 0) {
        this.source = body.source;
      }
      else {
        this.source = '';
      }
    }

    if ((body.support_url || body.support_url === '')) {
      if (body.support_url.indexOf('https://') === 0 || body.support_url.indexOf('http://') === 0) {
        this.support_url = body.support_url;
      }
      else {
        this.support_url = '';
      }
    }

    if (body.donate_url || body.donate_url === '') {
      if (body.donate_url.indexOf('https://') === 0 || body.donate_url.indexOf('http://') === 0) {
        this.donate_url = body.donate_url;
      }
      else {
        this.donate_url = '';
      }
    }

    if (body.video_url || body.video_url === '') {
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

    if (body.tagline || body.tagline === '') {
      this.tagline = body.tagline;
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
      if (updatedScreenshots.indexOf(filename) == -1) {
        await fs.unlink(`${config.image_dir}/${filename}`);
      }
    }
    this.screenshots = updatedScreenshots;

    if (body.keywords) {
      let keywords = body.keywords;
      if (!Array.isArray(keywords)) {
        keywords = keywords.split(',');
      }

      this.keywords = keywords.map((keyword) => keyword.trim());
    }
    else {
      this.keywords = [];
    }

    if (body.nsfw !== undefined) {
      this.nsfw = body.nsfw;
    }

    this.description = this.description ? this.description : '';
    this.changelog = this.changelog ? this.changelog : '';
    this.tagline = this.tagline ? this.tagline : '';

    this.description = sanitize(this.description);
    this.changelog = sanitize(this.changelog);
    this.tagline = sanitize(this.tagline);

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
      }
    }
  };

  packageSchema.methods.createNextRevision = function(version, channel, architecture, framework, url, downloadSha512, filesize) {
    this.revisions.push({
      revision: this.next_revision,
      version,
      downloads: 0,
      channel,
      download_url: url,
      download_sha512: downloadSha512,
      architecture,
      framework,
      filesize,
      created_date: (new Date()).toISOString(),
    } as RevisionDoc);

    this.updated_date = (new Date()).toISOString();
  };

  packageSchema.methods.getClickFilePath = function(channel, arch, version) {
    return path.join(config.data_dir, `${this.id}-${channel}-${arch}-${version}.click`);
  };

  packageSchema.methods.getIconFilePath = function(ext) {
    return path.join(config.icon_dir, `${this.id}${ext}`);
  };

  packageSchema.methods.getDownloadUrl = function(channel: Channel, arch: Architecture, version?: string) {
    let url = `${config.server.host}/api/v3/apps/${this.id}/download/${channel}/${arch}`;
    if (version) {
      url = `${url}/${version}`;
    }

    return url;
  };

  /* eslint-disable no-restricted-syntax */
  packageSchema.methods.serializeRatings = function(): SerializedRatings {
    return serializeRatings(this.rating_counts);
  };

  packageSchema.methods.serializeSlim = function(): SerializedPackageSlim {
    return {
      architectures: this.architectures || [],
      author: this.author || '',
      name: this.name || '',
      id: this.id || '',
      category: this.category || '',
      channels: this.channels || [],
      description: this.description || '',
      framework: this.framework || '',
      icon: this.icon_url,
      keywords: this.keywords || [],
      license: this.license || 'Proprietary',
      nsfw: !!this.nsfw,
      published_date: this.published_date || '',
      tagline: this.tagline || '',
      types: this.types || [],
      updated_date: this.updated_date || '',
      ratings: this.serializeRatings(),
    };
  };

  packageSchema.methods.serialize = function(architecture: Architecture = Architecture.ARMHF, apiVersion = 4): SerializedPackage {
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

    let defaultChannel = DEFAULT_CHANNEL;
    if (!this.channels.includes(defaultChannel) && this.channels.length > 0) {
      defaultChannel = this.channels[0];
    }

    const { revisionData } = this.getLatestRevision(defaultChannel, this.architectures.includes(architecture) ? architecture : undefined);
    const filesize = revisionData ? revisionData.filesize : 0;

    const revisions = (this.revisions || []).map((rData) => {
      const revision = {
        ...rData.toObject(),
        download_url: rData.download_url ? this.getDownloadUrl(rData.channel, rData.architecture, rData.version) : null,
        filesize: toBytes(rData.filesize),
      };

      delete revision._id;
      return revision;
    });

    const json = {
      architecture: this.architecture || '',
      architectures: this.architectures || [],
      author: this.author || '',
      category: this.category || '',
      changelog: this.changelog || '',
      channels: this.channels || [DEFAULT_CHANNEL],
      description: this.description || '',
      downloads: <SerializedDownload[]>[],
      framework: this.framework || '',
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

      // TODO deprecate these
      revision: -1,
      download: null,
      download_sha512: '',
      filesize: toBytes(filesize), // Have the app get this from the download data
      permissions: [],
    };

    if (this.revisions) {
      const jsonDownloads = Object.values(Channel)
        .reduce<(SerializedDownload | null)[]>((downloads: (SerializedDownload | null)[], channel: Channel) => {
          return [...downloads, ...this.architectures.map((arch) => {
            if (!Object.values(Architecture).includes(arch)) {
              return null; // Filter out unsupported arches like i386 (legacy apps)
            }

            const { revisionData: downloadRevisionData } = this.getLatestRevision(channel, arch, false);

            if (downloadRevisionData) {
              const download = {
                ...downloadRevisionData.toObject(),
                architecture: downloadRevisionData.architecture.includes(',') ? arch : downloadRevisionData.architecture,
                download_url: this.getDownloadUrl(channel, arch),
                filesize: toBytes(downloadRevisionData.filesize),
              };

              delete download._id;
              return download;
            }

            return null;
          })];
        }, []).filter((revision) => (revision?.download_url)) as SerializedDownload[];

      // Make sure the current architecture is last to not break old versions of the app
      jsonDownloads.sort((a, b) => {
        if (a.architecture == architecture) {
          return 1;
        }
        if (b.architecture == architecture) {
          return -1;
        }

        return 0;
      });

      if (apiVersion == 3) {
        json.downloads = jsonDownloads.filter((download) => (
          download.architecture == architecture || download.architecture == Architecture.ALL
        ));
      }
      else {
        json.downloads = jsonDownloads;
      }

      json.downloads.forEach((download) => {
        json.latestDownloads += download.downloads;
      });

      this.revisions.forEach((revision) => {
        json.totalDownloads += revision.downloads;
      });
    }

    return json;
  };

  packageSchema.methods.updateScreenshotFiles = async function(screenshotFiles: File[]) {
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
      if (['.png', '.jpg', '.jpeg'].indexOf(ext) == -1) {
        // Reject anything not an image we support
        await fs.unlink(file.path);
      }
      else {
        const id = v4();
        const filename = `${this.id}-screenshot-${id}${ext}`;

        await moveFile(
          screenshotFiles[i].path,
          `${config.image_dir}/${filename}`,
        );

        this.screenshots.push(filename);
      }
    }
  };

  packageSchema.methods.createRevisionFromClick = async function(filePath: string, channel: Channel, changelog?: string) {
    const parseData = await clickParser.parseClickPackage(filePath, true);
    const { version, architecture } = parseData;
    if (!parseData.name || !version || !architecture) {
      throw new UserError(MALFORMED_MANIFEST);
    }

    if (parseData.name != this.id) {
      throw new UserError(WRONG_PACKAGE);
    }

    if (this.revisions) {
      // Check for existing revisions (for this channel) with the same version string

      const matches = this.revisions.find((revision) => {
        return (
          revision.version == version &&
          revision.channel == channel &&
          revision.architecture == architecture
        );
      });

      if (matches) {
        throw new UserError(EXISTING_VERSION);
      }

      const currentRevisions = this.revisions.filter((rev) => rev.version === version);
      if (currentRevisions.length > 0) {
        const currentArches = currentRevisions.map((rev) => rev.architecture);
        if (architecture == Architecture.ALL && !currentArches.includes(Architecture.ALL)) {
          throw new UserError(NO_ALL);
        }
        if (architecture != Architecture.ALL && currentArches.includes(Architecture.ALL)) {
          throw new UserError(NO_NON_ALL);
        }

        if (parseData.framework != currentRevisions[0].framework) {
          throw new UserError(MISMATCHED_FRAMEWORK);
        }

        // TODO check if permissions are the same with the current list of permissions
      }
    }

    // Only update the data from the parsed click if it's for the default channel or if it's the first one
    const data = (channel == DEFAULT_CHANNEL || this.revisions.length === 0) ? parseData : null;
    const downloadSha512 = await sha512Checksum(filePath);

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
    );

    const updateIcon = (channel == DEFAULT_CHANNEL || !this.icon);
    if (updateIcon && parseData.icon) {
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

    if (this.architectures.includes(Architecture.ALL) && architecture != Architecture.ALL) {
      this.architectures = [architecture];
    }
    else if (!this.architectures.includes(Architecture.ALL) && architecture == Architecture.ALL) {
      this.architectures = [Architecture.ALL];
    }
    else if (!this.architectures.includes(architecture)) {
      this.architectures.push(architecture);
    }
  };
}
