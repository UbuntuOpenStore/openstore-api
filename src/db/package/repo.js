const Package = require('./model');

const PackageRepo = {
    // TODO rename and split up
    queryPackages(filters, query) {
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
    },
};


module.exports = PackageRepo
