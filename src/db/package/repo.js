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

    findOne(id, {frameworks, architecture}) {
        let query = {
            published: true,
            id: id,
        };

        if (frameworks) {
            query.framework = {$in: frameworks.split(',')};
        }

        if (architecture) {
            let architectures = [architecture];
            if (req.query.architecture != 'all') {
                architectures.push('all');
            }

            query.$or = [
                {architecture: {$in: architectures}},
                {architectures: {$in: architectures}},
            ];
        }

        return Package.findOne(query);
    },

    incrementDownload(id, revisionIndex) {
        let inc = {};
        inc[`revisions.${revisionIndex}.downloads`] = 1;

        return Package.update({_id: id}, {$inc: inc});
    },

    async stats() {
        let [categoryStats, typeStats] = await Promise.all([
            this.categoryStats(),
            Package.aggregate([
                {
                    $match: {published: true},
                }, {
                    $group: {
                        _id: '$types',
                        count: {$sum: 1},
                    },
                }, {
                    $sort: {_id: 1},
                },
            ]),
        ]);

        let categories = {};
        categoryStats.forEach((category) => {
            categories[category._id] = category.count;
        });

        let types = {};
        typeStats.forEach((type) => {
            type._id.forEach((t) => {
                if (types[t]) {
                    types[t] += type.count;
                }
                else {
                    types[t] = type.count;
                }
            });
        });

        return {categories, types};
    },

    categoryStats(channel) {
        let match = {published: true};
        if (channel) {
            match.channels = channel;
        }

        return Package.aggregate([
            {
                $match: match,
            }, {
                $group: {
                    _id: '$category',
                    count: { $sum: 1 },
                },
            }, {
                $sort: {_id: 1},
            },
        ]);
    },
};


module.exports = PackageRepo
