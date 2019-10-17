const path = require('path');

const config = require('../../utils/config');
const Package = require('./model');

const DEFAULT_VERSION = '0.0.0';

function iconUrl(pkg) {
    let ext = pkg.icon ? path.extname(pkg.icon) : '.png';
    let version = DEFAULT_VERSION;

    if (pkg.getLatestRevision) {
        let {revisionData} = pkg.getLatestRevision(Package.XENIAL);
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
        };
    }

    return json;
}

function toJson(pkg) {
    // Clean up languages that got screwed up by click-parser
    let languages = pkg.languages ? pkg.languages.sort() : [];
    languages = languages.map((language) => {
        if (language.includes('/')) {
            let split = language.split('/');
            language = split[split.length - 1];
        }

        return language;
    });

    let {revisionData} = pkg.getLatestRevision(Package.XENIAL, Package.ARMHF); // TODO remove this
    let json = {
        architecture: pkg.architecture || '',
        architectures: pkg.architectures || [],
        author: pkg.author || '',
        category: pkg.category || '',
        changelog: pkg.changelog || '',
        channels: pkg.channels || [Package.XENIAL],
        description: pkg.description || '',
        downloads: [],
        filesize: pkg.filesize || 0,
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
        languages: languages,
        revisions: pkg.revisions || [],
        totalDownloads: 0,
        latestDownloads: 0,

        // TODO get these from the latest release
        version: revisionData ? revisionData.version : '',

        // TODO deprecate these
        revision: -1,
        download: null,
        download_sha512: '',
    };

    if (pkg.revisions) {
        /* eslint-disable-next-line arrow-body-style */
        json.downloads = Package.CHANNELS.reduce((downloads, channel) => {
            return [...downloads, ...Package.ARCHITECTURES.map((arch) => {
                let {revisionData: downloadRevisionData} = pkg.getLatestRevision(channel, arch, false);
                if (downloadRevisionData) {
                    return {
                        ...downloadRevisionData.toObject(),
                        download_url: downloadUrl(pkg, channel, arch),
                    };
                }

                return null;
            })];
        }, []).filter((revision) => (!!revision || (revision && !revision.download_url)));

        json.downloads.forEach((download) => {
            json.latestDownloads += download.downloads;
        });

        pkg.revisions.forEach((revision) => {
            json.totalDownloads += revision.downloads;
        });
    }

    return json;
}

function serialize(pkgs, slim) {
    if (Array.isArray(pkgs)) {
        if (slim) {
            return pkgs.map(toSlimJson);
        }

        return pkgs.map(toJson);
    }

    if (slim) {
        return toSlimJson(pkgs);
    }

    return toJson(pkgs);
}

exports.iconUrl = iconUrl;
exports.downloadUrl = downloadUrl;
exports.serialize = serialize;
