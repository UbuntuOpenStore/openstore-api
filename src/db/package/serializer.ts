import path from 'path';

import config from 'utils/config';
import { Architecture, Channel, DEFAULT_CHANNEL, PackageDoc, SerializedDownload } from './types';
import { RatingCountDoc } from '../rating_count/types';

const DEFAULT_VERSION = '0.0.0';

function toBytes(filesize: number) {
  return filesize * 1024;
}

export function iconUrl(pkg: PackageDoc) {
  const ext = pkg.icon ? path.extname(pkg.icon) : '.png';
  let version = DEFAULT_VERSION;

  if (pkg.getLatestRevision) {
    let channel = DEFAULT_CHANNEL;
    if (!pkg.channels.includes(channel) && pkg.channels.length > 0) {
      channel = pkg.channels[0];
    }

    const { revisionData } = pkg.getLatestRevision(channel);
    if (revisionData) {
      version = revisionData.version;
    }
  }

  if (version == DEFAULT_VERSION && pkg.version) {
    version = pkg.version;
  }

  return `${config.server.host}/icons/${pkg.id}/${pkg.id}-${version}${ext}`;
}

function screenshotUrls(pkg: PackageDoc) {
  return pkg.screenshots.map((file) => {
    return `${config.server.host}/screenshots/${file}`;
  });
}

export function downloadUrl(pkg: PackageDoc, channel: Channel, arch: Architecture, version?: string) {
  let url = `${config.server.host}/api/v3/apps/${pkg.id}/download/${channel}/${arch}`;
  if (version) {
    url = `${url}/${version}`;
  }

  return url;
}

/* eslint-disable no-restricted-syntax */
export function serializeRatings(ratingCounts: RatingCountDoc[]) {
  const ratings = {
    THUMBS_UP: 0,
    THUMBS_DOWN: 0,
    HAPPY: 0,
    NEUTRAL: 0,
    BUGGY: 0,
  };

  if (Array.isArray(ratingCounts)) {
    for (const r of ratingCounts) {
      ratings[r.name] = r.count;
    }
  }

  return ratings;
}

function toSlimJson(pkg: PackageDoc) {
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

function toJson(pkg: PackageDoc, architecture: Architecture = Architecture.ARMHF, apiVersion = 4) {
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

  let defaultChannel = DEFAULT_CHANNEL;
  if (!pkg.channels.includes(defaultChannel) && pkg.channels.length > 0) {
    defaultChannel = pkg.channels[0];
  }

  const { revisionData } = pkg.getLatestRevision(defaultChannel, pkg.architectures.includes(architecture) ? architecture : undefined);
  const filesize = revisionData ? revisionData.filesize : 0;

  const revisions = (pkg.revisions || []).map((rData) => {
    const revision = {
      ...rData.toObject(),
      download_url: rData.download_url ? downloadUrl(pkg, rData.channel, rData.architecture, rData.version) : null,
      filesize: toBytes(rData.filesize),
    };

    delete revision._id;
    return revision;
  });

  const json = {
    architecture: pkg.architecture || '',
    architectures: pkg.architectures || [],
    author: pkg.author || '',
    category: pkg.category || '',
    changelog: pkg.changelog || '',
    channels: pkg.channels || [DEFAULT_CHANNEL],
    description: pkg.description || '',
    downloads: <SerializedDownload[]>[],
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
    published_date: pkg.published_date || '',
    published: !!pkg.published,
    locked: !!pkg.locked,
    screenshots: screenshotUrls(pkg),
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
    permissions: [],
  };

  if (pkg.revisions) {
    const jsonDownloads = Object.values(Channel).reduce<(SerializedDownload | null)[]>((downloads: (SerializedDownload | null)[], channel: Channel) => {
      return [...downloads, ...pkg.architectures.map((arch) => {
        if (!Object.values(Architecture).includes(arch)) {
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

    pkg.revisions.forEach((revision) => {
      json.totalDownloads += revision.downloads;
    });
  }

  return json;
}

export function serialize(pkgs: PackageDoc[] | PackageDoc, slim: boolean = false, architecture: Architecture = Architecture.ARMHF, apiVersion = 4) {
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
