const mongoose = require('mongoose');

const config = require('../utils/config');
const logger = require('../utils/logger');

mongoose.connect(config.mongo.uri + '/' + config.mongo.database, function(err) {
    if (err) {
        logger.error('database: ' + err);
        process.exit(1);
    }
});

var packageSchema = mongoose.Schema({
    architecture: String,  // TODO remove this
    architectures: [String],
    author: String,
    category: String,
    changelog: String,
    description: String,
    download_sha512: String,
    downloads: {},
    filesize: Number,
    framework: String,
    icon: String,
    id: {type: String, index: true},
    keywords: [String],
    license: String,
    maintainer_name: String,
    maintainer: String,
    manifest: {},
    name: String,
    nsfw: Boolean,
    package: String,
    published_date: String,
    published: Boolean,
    screenshots: [String],
    snappy_meta: {},
    source: String,
    tagline: String,
    types: [String],
    updated_date: String,
    version: String,
    support_url: String,
    donate_url: String,
    video_url: String,
    revision: Number,
    revisions: [],
    languages: [],
});

packageSchema.index({
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
});

var Package = mongoose.model('Package', packageSchema);

var userSchema = mongoose.Schema({
    apikey: String,
    email: String,
    language: String,
    name: String,
    role: String,
    ubuntu_id: {type: String, index: true},
    github_id: String,
    username: String,
});

var User = mongoose.model('User', userSchema);

function queryPackages(filters, query) {
    if (filters.types.length > 0) {
        query['types'] = {
            $in: filters.types,
        };
    }

    if (filters.ids.length > 0) {
        query.id = {
            $in: filters.ids
        };
    }

    if (filters.frameworks.length > 0) {
        query.framework = {
            $in: filters.frameworks
        };
    }

    if (filters.architectures.length > 0) {
        query.$or = [
            {architecture: {$in: filters.architectures}},
            {architectures: {$in: filters.architectures}},
        ];
    }

    if (filters.category) {
        query.category = filters.category;
    }

    if (filters.author) {
        query.author = filters.author;
    }

    if (filters.search) {
        query['$text'] = {$search: filters.search};
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
                findQuery.select({score : {$meta : 'textScore'}});
                findQuery.sort({score : {$meta : 'textScore'}});
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
