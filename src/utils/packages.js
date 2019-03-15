const fs = require('fs');
const moment = require('moment');
const path = require('path');

const Package = require('../db/package/model');
const User = require('../db/user/model');
const config = require('./config');

function iconUrl(pkg) {
    let ext = pkg.icon ? path.extname(pkg.icon) : '.png';
    let version = '0.0.0';
    if (pkg.revisions) {
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

// TODO move to serializer and cleanup
function toSlimJson(pkg) {
    let json = {};
    if (pkg) {
        json = {
            architectures: pkg.architectures ? pkg.architectures : [],
            author: pkg.author ? pkg.author : '',
            name: pkg.name ? pkg.name : '',
            id: pkg.id ? pkg.id : '',
            category: pkg.category ? pkg.category : '',
            channels: pkg.channels ? pkg.channels : [],
            description: pkg.description ? pkg.description : '',
            framework: pkg.framework ? pkg.framework : '',
            icon: iconUrl(pkg),
            keywords: pkg.keywords ? pkg.keywords : [],
            license: pkg.license ? pkg.license : 'Proprietary',
            nsfw: !!pkg.nsfw,
            published_date: pkg.published_date ? pkg.published_date : '',
            tagline: pkg.tagline ? pkg.tagline : '',
            types: pkg.types ? pkg.types : [],
            updated_date: pkg.published_date ? pkg.updated_date : '',
        };
    }

    return json;
}

function toJson(pkg, req) {
    let channel = req.query.channel || Package.XENIAL;
    if (!Package.CHANNELS.includes(channel)) {
        channel = Package.XENIAL;
    }

    let json = {};
    if (pkg) {
        let downloadSha512 = '';
        let version = '';

        if (pkg.revisions) {
            let {revisionData} = pkg.getLatestRevision(Package.XENIAL);
            if (revisionData && channel == Package.XENIAL) {
                downloadSha512 = revisionData.download_sha512;
                version = revisionData.version;
            }
        }

        let languages = pkg.languages ? pkg.languages.sort() : [];
        languages = languages.map((language) => {
            if (language.includes('/')) {
                let split = language.split('/');
                language = split[split.length - 1];
            }

            return language;
        });

        json = {
            architecture: pkg.architecture ? pkg.architecture : '',
            architectures: pkg.architectures ? pkg.architectures : [],
            author: pkg.author ? pkg.author : '',
            category: pkg.category ? pkg.category : '',
            changelog: pkg.changelog ? pkg.changelog : '',
            channels: pkg.channels ? pkg.channels : [Package.XENIAL],
            description: pkg.description ? pkg.description : '',
            download: downloadUrl(pkg, channel),
            download_sha512: downloadSha512,
            downloads: [],
            filesize: pkg.filesize ? pkg.filesize : 0,
            framework: pkg.framework ? pkg.framework : '',
            icon: iconUrl(pkg),
            id: pkg.id ? pkg.id : '',
            keywords: pkg.keywords ? pkg.keywords : [],
            license: pkg.license ? pkg.license : 'Proprietary',
            maintainer_name: pkg.maintainer_name ? pkg.maintainer_name : null,
            maintainer: pkg.maintainer ? pkg.maintainer : null,
            manifest: pkg.manifest ? pkg.manifest : {},
            name: pkg.name ? pkg.name : '',
            nsfw: !!pkg.nsfw,
            permissions: pkg.permissions ? pkg.permissions : [],
            published_date: pkg.published_date ? pkg.published_date : '',
            published: !!pkg.published,
            screenshots: pkg.screenshots ? pkg.screenshots : [],
            source: pkg.source ? pkg.source : '',
            support_url: pkg.support_url ? pkg.support_url : '',
            donate_url: pkg.donate_url ? pkg.donate_url : '',
            video_url: pkg.video_url ? pkg.video_url : '',
            tagline: pkg.tagline ? pkg.tagline : '',
            types: pkg.types ? pkg.types : [],
            updated_date: pkg.published_date ? pkg.updated_date : '',
            version: version || '',
            revision: -1, // TODO depricate this
            languages: languages,
            revisions: pkg.revisions ? pkg.revisions : [],
            totalDownloads: 0,
        };

        if (pkg.revisions) {
            json.downloads = Package.CHANNELS.map((channel) => {
                let {revisionData} = pkg.getLatestRevision(Package.XENIAL);
                if (revisionData) {
                    return {
                        channel: channel,
                        download_url: downloadUrl(pkg, channel),
                        download_sha512: revisionData.download_sha512,
                        version: revisionData.version,
                        revision: revisionData.revision,
                    };
                }

                return null;
            }).filter((revision) => !!revision);

            pkg.revisions.forEach((revision) => {
                json.totalDownloads += revision.downloads;
            });
        }
    }

    return json;
}

// TODO move and clean up
function parseFiltersFromRequest(req) {
    let types = [];
    if (req.query.types && Array.isArray(req.query.types)) {
        types = req.query.types;
    }
    else if (req.query.types) {
        types = [req.query.types];
    }
    else if (req.body && req.body.types) {
        types = req.body.types;
    }

    // Handle non-pluralized form
    if (req.query.type && Array.isArray(req.query.type)) {
        types = req.query.type;
    }
    else if (req.query.type) {
        types = [req.query.type];
    }
    else if (req.body && req.body.type) {
        types = req.body.type;
    }

    if (types.indexOf('webapp') >= 0 && types.indexOf('webapp+') == -1) {
        types.push('webapp+');
    }

    let ids = [];
    if (req.query.apps) {
        ids = req.query.apps.split(',');
    }
    else if (req.body && req.body.apps) {
        ids = req.body.apps;
    }

    let frameworks = [];
    if (req.query.frameworks) {
        frameworks = req.query.frameworks.split(',');
    }
    else if (req.body && req.body.frameworks) {
        frameworks = req.body.frameworks;
    }

    let architecture = '';
    let architectures = [];
    if (req.query.architecture) {
        architecture = req.query.architecture;
    }
    else if (req.body && req.body.architecture) {
        architecture = req.body.architecture;
    }

    if (architecture) {
        architectures = [architecture];
        if (architecture != 'all') {
            architectures.push('all');
        }
    }

    let category = null;
    if (req.query.category) {
        category = req.query.category;
    }
    else if (req.body && req.body.category) {
        category = req.body.category;
    }

    let author = null;
    if (req.query.author) {
        author = req.query.author;
    }
    else if (req.body && req.body.author) {
        author = req.body.author;
    }

    let search = '';
    if (req.query.search) {
        search = req.query.search;
    }
    else if (req.body && req.body.search) {
        search = req.body.search;
    }

    let channel = null;
    if (req.query.channel) {
        channel = req.query.channel;
    }
    else if (req.body && req.body.channel) {
        channel = req.body.channel;
    }

    let nsfw = null;
    if (
        (req.query.nsfw === false || (req.query.nsfw && req.query.nsfw.toLowerCase() == 'false')) ||
        (req.body && (req.body.nsfw === false || (req.query.nsfw && req.query.nsfw.toLowerCase() == 'false')))
    ) {
        nsfw = [null, false];
    }

    if (
        (req.query.nsfw === true || (req.query.nsfw && req.query.nsfw.toLowerCase() == 'true')) ||
        (req.body && (req.body.nsfw === true || (req.query.nsfw && req.query.nsfw.toLowerCase() == 'true')))
    ) {
        nsfw = true;
    }

    return {
        limit: req.query.limit ? parseInt(req.query.limit, 10) : 0,
        skip: req.query.skip ? parseInt(req.query.skip, 10) : 0,
        sort: req.query.sort ? req.query.sort : 'relevance',
        types: types,
        ids: ids,
        frameworks: frameworks,
        architectures: architectures,
        category: category,
        author: author,
        search: search,
        channel: channel,
        nsfw: nsfw,
    };
}

exports.toSlimJson = toSlimJson;
exports.toJson = toJson;
exports.parseFiltersFromRequest = parseFiltersFromRequest;
exports.iconUrl = iconUrl;
