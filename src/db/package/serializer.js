const path = require('path');

const config = require('../../utils/config');
const Package = require('./model');
const { RATINGS } = require('../review/constants');

const DEFAULT_VERSION = '0.0.0';

function toBytes(filesize) {
  return filesize * 1024;
}

function iconUrl(pkg) {
  const ext = pkg.icon ? path.extname(pkg.icon) : '.png';
  let version = DEFAULT_VERSION;

  if (pkg.getLatestRevision) {
    const { revisionData } = pkg.getLatestRevision(Package.XENIAL);
    if (revisionData) {
      version = revisionData.version;
    }
  }

  if (version == DEFAULT_VERSION && pkg.version) {
    version = pkg.version;
  }

  return `${config.server.host}/api/v3/apps/${pkg.id}/icon/${version}${ext}`;
}

function downloadUrl(pkg, channel, arch) {
  return `${config.server.host}/api/v3/apps/${pkg.id}/download/${channel}/${arch}`;
}

/* eslint-disable no-restricted-syntax */
function serializeRatings(ratingCounts) {
  const ratings = {};
  if (Array.isArray(ratingCounts)) {
    for (const r of ratingCounts) {
      ratings[r.name] = r.count;
    }
  }

  for (const r of RATINGS) {
    if (!(r in ratings)) {
      ratings[r] = 0;
    }
  }
  return ratings;
}

function toSlimJson(pkg) {
  let json = {};
  if (pkg) {
    json = {
      architectures: pkg.architectures || [],
      author: pkg.author || '',
      name: pkg.name || '',
      id: pkg.id || '',
      category: pkg.category || '',
      channels: pkg.channels || [],
      description: pkg.description || '',
      framework: pkg.framework || '',
      icon: iconUrl(pkg),
      keywords: pkg.keywords || [],
      license: pkg.license || 'Proprietary',
      nsfw: !!pkg.nsfw,
      published_date: pkg.published_date || '',
      tagline: pkg.tagline || '',
      types: pkg.types || [],
      updated_date: pkg.updated_date || '',
      ratings: serializeRatings(pkg.rating_counts),
    };
  }

  return json;
}

function toJson(pkg, architecture = Package.ARMHF, apiVersion) {
  // Clean up languages that got screwed up by click-parser
  let languages = pkg.languages ? pkg.languages.sort() : [];
  languages = languages.map((language) => {
    let cleanLanguage = language;
    if (language.includes('/')) {
      const split = language.split('/');
      cleanLanguage = split[split.length - 1];
    }

    return cleanLanguage;
  });

  const { revisionData } = pkg.getLatestRevision(Package.XENIAL, architecture);
  let filesize = revisionData ? revisionData.filesize : pkg.filesize;
  if (!filesize) {
    filesize = 0;
  }

  let revisions = pkg.revisions || [];
  revisions = revisions.map((revision) => {
    const r = revision.toObject();
    delete r._id;
    return r;
  });

  const json = {
    architecture: pkg.architecture || '',
    architectures: pkg.architectures || [],
    author: pkg.author || '',
    category: pkg.category || '',
    changelog: pkg.changelog || '',
    channels: pkg.channels || [Package.XENIAL],
    description: pkg.description || '',
    downloads: [],
    framework: pkg.framework || '',
    icon: iconUrl(pkg),
    id: pkg.id || '',
    keywords: pkg.keywords || [],
    license: pkg.license || 'Proprietary',
    maintainer_name: pkg.maintainer_name || null,
    maintainer: pkg.maintainer || null,
    manifest: pkg.manifest || {},
    name: pkg.name || '',
    nsfw: !!pkg.nsfw,
    permissions: pkg.permissions || [],
    published_date: pkg.published_date || '',
    published: !!pkg.published,
    locked: !!pkg.locked,
    screenshots: pkg.screenshots || [],
    source: pkg.source || '',
    support_url: pkg.support_url || '',
    donate_url: pkg.donate_url || '',
    video_url: pkg.video_url || '',
    tagline: pkg.tagline || '',
    types: pkg.types || [],
    updated_date: pkg.updated_date || '',
    languages,
    revisions,
    totalDownloads: 0,
    latestDownloads: 0,
    version: revisionData ? revisionData.version : '',
    ratings: serializeRatings(pkg.rating_counts),
    type_override: pkg.type_override || '',
    calculated_rating: pkg.calculated_rating || 0,

    // TODO deprecate these
    revision: -1,
    download: null,
    download_sha512: '',
    filesize: toBytes(filesize), // Have the app get this from the download data
  };

  if (pkg.revisions) {
    const jsonDownloads = Package.CHANNELS.reduce((downloads, channel) => {
      return [...downloads, ...pkg.architectures.map((arch) => {
        if (!Package.ARCHITECTURES.includes(arch)) {
          return null; // Filter out unsupported arches like i386 (legacy apps)
        }

        const { revisionData: downloadRevisionData } = pkg.getLatestRevision(channel, arch, false);
        if (downloadRevisionData) {
          const download = {
            ...downloadRevisionData.toObject(),
            architecture: downloadRevisionData.architecture.includes(',') ? arch : downloadRevisionData.architecture,
            download_url: downloadUrl(pkg, channel, arch),
            filesize: toBytes(downloadRevisionData.filesize),
          };

          delete download._id;
          return download;
        }

        return null;
      })];
    }, []).filter((revision) => (!!revision || (revision && !revision.download_url)));

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
        download.architecture == architecture || download.architecture == Package.ALL
      ));
    }
    else {
      json.downloads = jsonDownloads;
    }

    json.downloads.forEach((download) => {
      json.latestDownloads += download.downloads;
    });

    pkg.revisions.forEach((revision) => {
      json.totalDownloads += revision.downloads;
    });
  }

  return json;
}

function serialize(pkgs, slim, architecture, apiVersion) {
  if (Array.isArray(pkgs)) {
    if (slim) {
      return pkgs.map(toSlimJson);
    }

    return pkgs.map((pkg) => toJson(pkg, architecture, apiVersion));
  }

  if (slim) {
    return toSlimJson(pkgs);
  }

  return toJson(pkgs, architecture, apiVersion);
}

exports.iconUrl = iconUrl;
exports.downloadUrl = downloadUrl;
exports.serialize = serialize;
exports.serializeRatings = serializeRatings;
