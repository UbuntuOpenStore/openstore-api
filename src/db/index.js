const mongoose = require('mongoose');
const bluebird = require('bluebird');

const config = require('../utils/config');
const logger = require('../utils/logger');

mongoose.Promise = bluebird;
mongoose.connect(`${config.mongo.uri}/${config.mongo.database}`, {useNewUrlParser: true}, (err) => {
    if (err) {
        logger.error('database error:', err);
        process.exit(1);
    }
});

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
    channels: [], // vivid, xenial

    icon: String,
}, {usePushEach: true});

packageSchema.virtual('architecture').get(function() {
    return this.architectures.join(',');
});

function getRevision(pkg, channel) {
    let data = null;
    pkg.revisions.filter((revisionData) => (revisionData.channel == channel))
        .forEach((revisionData) => {
            if (!data || data.revision < revisionData.revision) {
                data = revisionData;
            }
        });

    return data;
}

packageSchema.virtual('vivid_revision').get(function() {
    let data = getRevision(this, 'vivid');
    return data ? data.revision : -1;
});

packageSchema.virtual('vivid_revision_data').get(function() {
    return getRevision(this, 'vivid');
});

packageSchema.virtual('xenial_revision').get(function() {
    let data = getRevision(this, 'xenial');
    return data ? data.revision : -1;
});

packageSchema.virtual('xenial_revision_data').get(function() {
    return getRevision(this, 'xenial');
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

const Package = mongoose.model('Package', packageSchema);

Package.XENIAL = 'xenial';
Package.VIVID = 'vivid';
Package.CHANNELS = [
    Package.XENIAL,
    Package.VIVID,
];

const userSchema = mongoose.Schema({
    apikey: String,
    email: String,
    language: String,
    name: String,
    role: String,
    ubuntu_id: {type: String, index: true},
    github_id: String,
    gitlab_id: String,
    username: String,
});

const User = mongoose.model('User', userSchema);

function queryPackages(filters, query) {
    if (filters.types.length > 0) {
        query.types = {
            $in: filters.types,
        };
    }

    if (filters.ids.length > 0) {
        query.id = {
            $in: filters.ids,
        };
    }

    if (filters.frameworks.length > 0) {
        query.framework = {
            $in: filters.frameworks,
        };
    }

    if (filters.architectures.length > 0) {
        query.architectures = {
            $in: filters.architectures,
        };
    }

    if (filters.category) {
        query.category = filters.category;
    }

    if (filters.author) {
        query.author = filters.author;
    }

    if (filters.channel) {
        query.channels = {
            $in: [filters.channel],
        };
    }

    if (filters.search) {
        query.$text = {$search: filters.search};
    }

    if (filters.nsfw) {
        if (Array.isArray(filters.nsfw)) {
            query.nsfw = {$in: filters.nsfw};
        }
        else {
            query.nsfw = filters.nsfw;
        }
    }

    return Package.count(query).then((count) => {
        let findQuery = Package.find(query);

        if (filters.sort == 'relevance') {
            if (filters.search) {
                findQuery.select({score: {$meta: 'textScore'}});
                findQuery.sort({score: {$meta: 'textScore'}});
            }
            else {
                findQuery.sort('name');
            }
        }
        else {
            findQuery.sort(filters.sort);
        }

        if (filters.limit) {
            findQuery.limit(filters.limit);
        }

        if (filters.skip) {
            findQuery.skip(filters.skip);
        }

        return Promise.all([
            findQuery,
            count,
        ]);
    });
}

exports.Package = Package;
exports.queryPackages = queryPackages;
exports.User = User;
