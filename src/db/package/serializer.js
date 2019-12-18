const path = require('path');

const config = require('../../utils/config');
const Package = require('./model');
const RATINGS = require('../../api/reviews').ratings;

const DEFAULT_VERSION = '0.0.0';

function toBytes(filesize) {
    return filesize * 1024;
}

function iconUrl(pkg) {
    let ext = pkg.icon ? path.extname(pkg.icon) : '.png';
    let version = DEFAULT_VERSION;

    if (pkg.getLatestRevision) {
        let { revisionData } = pkg.getLatestRevision(Package.XENIAL);
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
function getRatings(pkg) {
    let ratings = {};
    if (Array.isArray(pkg.rating_counts)) {
        for (let r of pkg.rating_counts) {
            ratings[r.name] = r.count;
        }
    }
    for (let r of RATINGS) {
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
            ratings: getRatings(pkg),
        };
    }

    return json;
}

function toJson(pkg, architecture = Package.ARMHF, apiVersion) {
    // Clean up languages that got screwed up by click-parser
    let languages = pkg.languages ? pkg.languages.sort() : [];
    languages = languages.map((language) => {
        if (language.includes('/')) {
            let split = language.split('/');
            language = split[split.length - 1];
        }

        return language;
    });

    let { revisionData } = pkg.getLatestRevision(Package.XENIAL, architecture);
    let filesize = revisionData ? revisionData.filesize : pkg.filesize;
    if (!filesize) {
        filesize = 0;
    }

    let revisions = pkg.revisions || [];
    revisions = revisions.map((revision) => {
        let r = revision.toObject();
        // eslint-disable-next-line no-underscore-dangle
        delete r._id;
        return r;
    });

    let json = {
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
        ratings: getRatings(pkg),

        // TODO deprecate these
        revision: -1,
        download: null,
        download_sha512: '',
        filesize: toBytes(filesize), // Have the app get this from the download data
    };

    if (pkg.revisions) {
        /* eslint-disable-next-line arrow-body-style */
        let jsonDownloads = Package.CHANNELS.reduce((downloads, channel) => {
            return [...downloads, ...pkg.architectures.map((arch) => {
                let { revisionData: downloadRevisionData } = pkg.getLatestRevision(channel, arch, false);
                if (downloadRevisionData) {
                    let download = {
                        ...downloadRevisionData.toObject(),
                        download_url: downloadUrl(pkg, channel, arch),
                        filesize: toBytes(downloadRevisionData.filesize),
                    };

                    // eslint-disable-next-line no-underscore-dangle
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
