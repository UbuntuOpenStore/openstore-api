import { Schema, model } from 'mongoose';
import path from 'path';
import fs from 'fs';

import { sanitize } from 'utils/helpers';
import config from 'utils/config';
import { ClickParserData } from 'utils/types';
import UserRepo from '../user/repo';
import { RevisionDoc, RevisionModel, PackageDoc, PackageModel, Architecture, Channel, BodyUpdate } from './types';

const revisionSchema = new Schema<RevisionDoc, RevisionModel>({
  revision: Number,
  version: String, // Unique among revisions with this arch
  downloads: Number,
  channel: String,
  download_url: String, // The path to the local click file
  download_sha512: String,
  architecture: String,
  framework: String,
  filesize: Number,
  created_date: String,
});

const packageSchema = new Schema<PackageDoc, PackageModel>({
  id: { type: String, index: true },

  // Presentation
  name: String,
  tagline: String,
  description: String,
  changelog: String,
  screenshots: [String],

  // Discovery
  category: String,
  keywords: [String],
  nsfw: Boolean,

  // Info
  license: String,
  source: String,
  support_url: String,
  donate_url: String,
  video_url: String,
  maintainer: String,
  maintainer_name: String,
  framework: String, // TODO deprecate

  // Metadata
  author: String,
  version: String, // TODO deprecate
  manifest: {}, // TODO deprecate
  types: [String],
  type_override: String,
  languages: [String],
  architectures: [String],
  locked: Boolean,
  qml_imports: [],

  // Publication metadata
  published: Boolean,
  published_date: String,
  updated_date: String,

  // Revisions
  revisions: [revisionSchema],
  channels: [String],

  icon: String, // Path to a local icon file

  // Number of ratings in each category
  rating_counts: [{ type: Schema.Types.ObjectId, ref: 'RatingCount' }],
  calculated_rating: Number,
}, { usePushEach: true });

packageSchema.virtual('architecture').get(function(this: PackageDoc) {
  return this.architectures.join(',');
});

packageSchema.virtual('next_revision').get(function(this: PackageDoc) {
  let revision = 0;
  const revisions = this.revisions.map((data) => data.revision);

  if (revisions.length > 0) {
    revision = Math.max(...revisions);
  }

  return revision + 1;
});

packageSchema.index(
  {
    name: 'text',
    description: 'text',
    keywords: 'text',
    author: 'text',
  },
  {
    weights: {
      name: 10,
      description: 5,
      keywords: 3,
      author: 1,
    },
    name: 'searchIndex',
  },
);

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
  this.screenshots.forEach((screenshot) => {
    const filename = screenshot.replace(regex, '');
    if (updatedScreenshots.indexOf(filename) == -1) {
      fs.unlinkSync(`${config.image_dir}/${filename}`);
    }
  });
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
    const user = await UserRepo.findOne(this.maintainer);
    if (user) {
      this.maintainer_name = user.name ? user.name : user.username;
    }
  }
};

packageSchema.methods.newRevision = function(version, channel, architecture, framework, url, downloadSha512, filesize) {
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

export default model<PackageDoc, PackageModel>('Package', packageSchema);
