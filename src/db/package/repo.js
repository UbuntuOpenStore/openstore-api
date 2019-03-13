const Package = require('./model');

const PackageRepo = {
    parseFilters({types, ids, frameworks, architectures, category, author, channel, search, nsfw, maintainer, published}) {
        let query = {};

        if (types.length > 0) {
            query.types = {
                $in: types,
            };
        }

        if (ids.length > 0) {
            query.id = {
                $in: ids,
            };
        }

        if (frameworks.length > 0) {
            query.framework = {
                $in: frameworks,
            };
        }

        if (architectures.length > 0) {
            query.architectures = {
                $in: architectures,
            };
        }

        if (category) {
            query.category = category;
        }

        if (author) {
            query.author = author;
        }

        if (channel) {
            query.channels = channel;
        }

        if (search) {
            query.$text = {$search: search};
        }

        if (nsfw) {
            if (Array.isArray(nsfw)) {
                query.nsfw = {$in: nsfw};
            }
            else {
                query.nsfw = nsfw;
            }
        }

        if (maintainer) {
            query.maintainer = maintainer;
        }

        if (published) {
            query.published = published;
        }

        return query;
    },

    count(filters) {
        let query = this.parseFilters(filters);

        return Package.count(query);
    },

    find(filters, sort, limit, skip) {
        let query = this.parseFilters(filters);

        let findQuery = Package.find(query);

        if (sort == 'relevance') {
            if (query.$text) {
                findQuery.select({score: {$meta: 'textScore'}});
                findQuery.sort({score: {$meta: 'textScore'}});
            }
            else {
                findQuery.sort('name');
            }
        }
        else {
            findQuery.sort(sort);
        }

        if (limit) {
            findQuery.limit(limit);
        }

        if (skip) {
            findQuery.skip(skip);
        }

        return findQuery.exec();
    },
};


module.exports = PackageRepo
