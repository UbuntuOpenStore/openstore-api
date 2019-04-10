const path = require('path');

const config = require('../../utils/config');
const Package = require('./model');

function iconUrl(pkg) {
    let ext = pkg.icon ? path.extname(pkg.icon) : '.png';
    let version = '0.0.0';

    // TODO get the version when the data is coming from elasticsearch
    if (pkg.getLatestRevision) {
        let {revisionData} = pkg.getLatestRevision(Package.XENIAL);
        if (revisionData) {
            version = revisionData.version;
        }
    }

    return `${config.server.host}/api/v3/apps/${pkg.id}/icon/${version}${ext}`;
}

function downloadUrl(pkg, channel) {
    return `${config.server.host}/api/v3/apps/${pkg.id}/download/${channel}`;
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

    let {revisionData} = pkg.getLatestRevision(Package.XENIAL);
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
        version: revisionData ? revisionData.version : '',
        languages: languages,
        revisions: pkg.revisions || [],
        totalDownloads: 0,

        // TODO depricate these
        revision: -1,
        download: downloadUrl(pkg, Package.XENIAL),
        download_sha512: revisionData ? revisionData.download_sha512 : '',
    };

    if (pkg.revisions) {
        json.downloads = Package.CHANNELS.map((channel) => {
            let {revisionData: downloadRevisionData} = pkg.getLatestRevision(channel);
            if (downloadRevisionData) {
                return {
                    channel: channel,
                    download_url: downloadUrl(pkg, channel),
                    download_sha512: downloadRevisionData.download_sha512,
                    version: downloadRevisionData.version,
                    revision: downloadRevisionData.revision,
                };
            }

            return null;
        }).filter((revision) => !!revision);

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
exports.serialize = serialize;
