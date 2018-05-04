const db = require('../db');
const { Package } = require('../db');
const config = require('./config');

const fs = require('fs');
const sanitizeHtml = require('sanitize-html');
const moment = require('moment');
const path = require('path');

function sanitize(html) {
    return sanitizeHtml(html, {
        allowedTags: [],
        allowedAttributes: [],
    }).replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/\r/g, '');
}

// TODO clean up arguments
function updateInfo(pkg, data, body, file, url, updateRevision, channel, version, download_sha512) {
    updateRevision = (updateRevision === undefined) ? false : updateRevision;
    channel = channel || Package.VIVID;

    let maintainer = body ? body.maintainer : pkg.maintainer;
    return db.User.findOne({_id: maintainer}).then((user) => {
        if (user) {
            pkg.maintainer_name = user.name ? user.name : user.username;
        }

        if (data) {
            let manifest = {
                architecture: data.architecture,
                changelog: data.changelog,
                description: data.description,
                framework: data.framework,
                hooks: {},
                maintainer: data.maintainer,
                name: data.name,
                title: data.title,
                version: data.version,
            };

            data.apps.forEach((app) => {
                let hook = {};

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

                    for (let key in Object.keys(app.scopeIni)) {
                        // Remove any ini properties with a `.` as mongo will reject them
                        hook.scope[key.replace('.', '__')] = app.scopeIni[key];
                    }
                }

                // Mongo will reject this if there are any `.`s
                manifest.hooks[app.name.replace('.', '__')] = hook;
            });

            pkg.architecture = data.architecture;
            pkg.architectures = data.architecture;
            pkg.author = data.maintainer;
            pkg.framework = data.framework;
            pkg.id = data.name;
            pkg.manifest = manifest;
            pkg.types = data.types;
            pkg.version = data.version;
            pkg.languages = data.languages;

            // Don't overwrite the these if they already exists
            pkg.name = pkg.name ? pkg.name : data.title;
            pkg.description = pkg.description ? pkg.description : data.description;
            pkg.tagline = pkg.tagline ? pkg.tagline : data.description;
        }

        if (file && file.size) {
            pkg.filesize = file.size;
        }

        if (url) {
            pkg.package = url;
        }

        if (body) {
            if (body.name) {
                pkg.name = body.name;
            }

            if (body.published !== undefined) {
                pkg.published = (body.published == 'true' || body.published === true);
            }

            if (body.category || body.category === '') {
                pkg.category = body.category;
            }

            if (body.changelog || body.changelog === '') {
                pkg.changelog = body.changelog;
            }

            if (body.description || body.description === '') {
                pkg.description = body.description;
            }

            if (body.license || body.license === '') {
                pkg.license = body.license;
            }

            if (body.source || body.source === '') {
                if (body.source.indexOf('https://') === 0 || body.source.indexOf('http://') === 0) {
                    pkg.source = body.source;
                }
                else {
                    pkg.source = '';
                }
            }

            if ((body.support_url || body.support_url === '')) {
                if (body.support_url.indexOf('https://') === 0 || body.support_url.indexOf('http://') === 0) {
                    pkg.support_url = body.support_url;
                }
                else {
                    pkg.support_url = '';
                }
            }

            if (body.donate_url || body.donate_url === '') {
                if (body.donate_url.indexOf('https://') === 0 || body.donate_url.indexOf('http://') === 0) {
                    pkg.donate_url = body.donate_url;
                }
                else {
                    pkg.donate_url = '';
                }
            }

            if (body.video_url || body.video_url === '') {
                // TODO support regular youtube urls and transform them into embedded urls
                if (body.video_url.indexOf('https://www.youtube.com/embed/') === 0) {
                    pkg.video_url = body.video_url;
                }
                else {
                    pkg.video_url = '';
                }
            }

            if (body.tagline || body.tagline === '') {
                pkg.tagline = body.tagline;
            }

            let screenshots = [];
            if (body.screenshots) {
                if (Array.isArray(body.screenshots)) {
                    screenshots = body.screenshots;
                }
                else {
                    screenshots = JSON.parse(body.screenshots);
                }
            }

            // Unlink the screenshot file if it gets removed
            pkg.screenshots.forEach((screenshot) => {
                let prefix = `${config.server.host}/api/screenshot/`;
                if (screenshots.indexOf(screenshot) == -1 && screenshot.startsWith(prefix)) {
                    let filename = screenshot.replace(prefix, '');
                    fs.unlink(`${config.image_dir}/${filename}`);
                }
            });
            pkg.screenshots = screenshots;

            if (body.keywords) {
                if (!Array.isArray(body.keywords)) {
                    body.keywords = body.keywords.split(',');
                }

                pkg.keywords = body.keywords.map((keyword) => {
                    return keyword.trim();
                });
            }
            else {
                pkg.keywords = [];
            }

            if (body.nsfw !== undefined) {
                pkg.nsfw = body.nsfw;
            }

            pkg.description = pkg.description ? pkg.description : '';
            pkg.changelog = pkg.changelog ? pkg.changelog : '';
            pkg.tagline = pkg.tagline ? pkg.tagline : '';

            pkg.description = sanitize(pkg.description);
            pkg.changelog = sanitize(pkg.changelog);
            pkg.tagline = sanitize(pkg.tagline);

            if (body.maintainer !== undefined) {
                pkg.maintainer = body.maintainer;
            }
        }
        else {
            pkg.description = pkg.description ? pkg.description : '';
            pkg.changelog = pkg.changelog ? pkg.changelog : '';
            pkg.tagline = pkg.tagline ? pkg.tagline : '';

            pkg.description = sanitize(pkg.description);
            pkg.changelog = sanitize(pkg.changelog);
            pkg.tagline = sanitize(pkg.tagline);
        }

        if (updateRevision) {
            let revision = 1;
            if (channel == Package.VIVID) {
                pkg.revision = pkg.revisions.length + 1;
                revision = pkg.revision;
            }
            else {
                pkg.xenial_revision = pkg.revisions.length + 1;
                revision = pkg.xenial_revision;
            }

            pkg.revisions.push({
                revision: revision,
                version: version || pkg.version,
                downloads: 0,
                channel: channel,
                download_url: url || pkg.package,
                download_sha512: download_sha512 || pkg.download_sha512,
            });

            // Only update if we have a new version uploaded
            pkg.updated_date = moment().toISOString();
        }

        if (!pkg.published_date && pkg.published) {
            pkg.published_date = moment().toISOString();
            pkg.updated_date = moment().toISOString();
        }

        return pkg;
    });
}

function iconUrl(pkg) {
    let ext = pkg.icon ? path.extname(pkg.icon) : '.png';
    return `${config.server.host}/api/v3/apps/${pkg.id}/icon/${pkg.version}${ext}`;
}

function downloadUrl(pkg, channel) {
    return `${config.server.host}/api/v3/apps/${pkg.id}/download/${channel}`;
}

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
    let json = {};
    if (pkg) {
        let vividRevisionData = {};
        let xenialRevisionData = null;
        pkg.revisions.forEach((data) => {
            if (data.revision == pkg.xenial_revision) {
                xenialRevisionData = data;
            }

            if (data.revision == pkg.revision) {
                vividRevisionData = data;
            }
        });

        json = {
            architecture: pkg.architecture ? pkg.architecture : '',
            architectures: pkg.architectures ? pkg.architectures : [],
            author: pkg.author ? pkg.author : '',
            category: pkg.category ? pkg.category : '',
            changelog: pkg.changelog ? pkg.changelog : '',
            channels: pkg.channels ? pkg.channels : [db.Package.VIVID],
            description: pkg.description ? pkg.description : '',
            download: downloadUrl(pkg, db.Package.VIVID),
            download_sha512: vividRevisionData.download_sha512 ? vividRevisionData.download_sha512 : '',
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
            package: pkg.package ? pkg.package : '',
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
            version: pkg.version ? pkg.version : '',
            revision: pkg.revision ? pkg.revision : 1,
            xenial_revision: pkg.xenial_revision ? pkg.xenial_revision : 0,
            languages: pkg.languages ? pkg.languages.sort() : [],
        };

        json.downloads = [
            {
                channel: db.Package.VIVID,
                download_url: downloadUrl(pkg, db.Package.VIVID),
                download_sha512: vividRevisionData.download_sha512,
            },
        ];

        if (xenialRevisionData) {
            json.downloads.push({
                channel: db.Package.XENIAL,
                download_url: downloadUrl(pkg, db.Package.XENIAL),
                download_sha512: xenialRevisionData.download_sha512,
            });
        }

        /* eslint-disable no-underscore-dangle */
        if (req.isAuthenticated() && req.user && (req.user._id == pkg.maintainer || req.user.role == 'admin') && pkg.revisions) {
            json.revisions = pkg.revisions;

            json.totalDownloads = 0;
            pkg.revisions.forEach((revision) => {
                json.totalDownloads += revision.downloads;
            });
        }
    }

    return json;
}

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

exports.updateInfo = updateInfo;
exports.toSlimJson = toSlimJson;
exports.toJson = toJson;
exports.parseFiltersFromRequest = parseFiltersFromRequest;
