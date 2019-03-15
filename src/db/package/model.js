const mongoose = require('mongoose');
const moment = require('moment');

const {sanitize} = require('../../utils/helpers');
const config = require('../../utils/config');
const fs = require('../../utils/asyncFs');
const User = require('../user/model');

const packageSchema = mongoose.Schema({
    id: {type: String, index: true},

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
    framework: String,

    // Metadata
    author: String,
    version: String, // TODO depricate
    filesize: Number,
    manifest: {},
    types: [String],
    languages: [],
    architectures: [String],

    // Publication metadata
    published: Boolean,
    published_date: String,
    updated_date: String,

    // Revisions
    revisions: [
        /*
        {
            revision: Number,
            version: String, // Unique among revisions
            downloads: Number,
            channel: String, // vivid, xenial
            download_url: String,
            download_sha512: String,
        }
        */
    ], // Revisions and stats
    channels: [],

    icon: String,
}, {usePushEach: true});

packageSchema.virtual('architecture').get(function() {
    return this.architectures.join(',');
});

packageSchema.virtual('next_revision').get(function() {
    let revision = 0;
    let revisions = this.revisions.map((data) => data.revision);

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

packageSchema.methods.getLatestRevision = function(channel) {
    let revisionData = null;
    let revisionIndex = -1;
    this.revisions.filter((data) => (data.channel == channel))
        .forEach((data, index) => {
            if (!revisionData || revisionData.revision < data.revision) {
                revisionData = data;
                revisionIndex = index;
            }
        });

    return { revisionData, revisionIndex };
};

packageSchema.methods.updateFromClick = function(data, file) {
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

            Object.keys(app.scopeIni).forEach((key) => {
                // Remove any ini properties with a `.` as mongo will reject them
                hook.scope[key.replace('.', '__')] = app.scopeIni[key];
            });
        }

        // Mongo will reject this if there are any `.`s
        manifest.hooks[app.name.replace('.', '__')] = hook;
    });

    this.architecture = data.architecture;
    this.architectures = data.architecture;
    this.author = data.maintainer;
    this.framework = data.framework;
    this.id = data.name;
    this.manifest = manifest;
    this.types = data.types;
    this.version = data.version;
    this.languages = data.languages;

    // Don't overwrite the these if they already exists
    this.name = this.name ? this.name : data.title;
    this.description = this.description ? this.description : sanitize(data.description);
    this.tagline = this.tagline ? this.tagline : sanitize(data.description);

    if (file && file.size) {
        this.filesize = file.size;
    }
};

packageSchema.methods.updateFromBody = async function(body) {
    if (body.name) {
        this.name = body.name;
    }

    if (body.published !== undefined) {
        this.published = (body.published == 'true' || body.published === true);
    }

    if (!this.published_date && this.published) {
        this.published_date = moment().toISOString();
        this.updated_date = moment().toISOString();
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
        // TODO support regular youtube urls and transform them into embedded urls
        if (body.video_url.indexOf('https://www.youtube.com/embed/') === 0) {
            this.video_url = body.video_url;
        }
        else {
            this.video_url = '';
        }
    }

    if (body.tagline || body.tagline === '') {
        this.tagline = body.tagline;
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
    this.screenshots.forEach((screenshot) => {
        let prefix = `${config.server.host}/api/screenshot/`;
        if (screenshots.indexOf(screenshot) == -1 && screenshot.startsWith(prefix)) {
            let filename = screenshot.replace(prefix, '');
            fs.unlink(`${config.image_dir}/${filename}`);
        }
    });
    this.screenshots = screenshots;

    if (body.keywords) {
        if (!Array.isArray(body.keywords)) {
            body.keywords = body.keywords.split(',');
        }

        this.keywords = body.keywords.map((keyword) => keyword.trim());
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

    if (body.maintainer !== undefined) {
        this.maintainer = body.maintainer;
    }

    let user = await User.findOne({_id: this.maintainer})
    if (user) {
        this.maintainer_name = user.name ? user.name : user.username;
    }
};

packageSchema.methods.newRevision = function(version, channel, url, downloadSha512) {
    this.revisions.push({
        revision: this.next_revision,
        version: version,
        downloads: 0,
        channel: channel,
        download_url: url,
        download_sha512: downloadSha512,
    });

    this.updated_date = moment().toISOString();
};

const Package = mongoose.model('Package', packageSchema);

// TODO make a default channel
Package.XENIAL = 'xenial';
Package.CHANNELS = [
    Package.XENIAL,
];

module.exports = Package;
