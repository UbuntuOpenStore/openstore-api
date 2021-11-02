const uniq = require('lodash/uniq');

const Package = require('./model');
const { getData, getDataArray, getDataBoolean } = require('../../utils/helpers');

const PackageRepo = {
  parseRequestFilters(req) {
    const types = [
      ...getDataArray(req, 'types'),
      // Handle non-pluralized form
      ...getDataArray(req, 'type'),
    ];

    if (types.includes('webapp')) {
      types.push('webapp+');
    }

    const architecture = getData(req, 'architecture').toLowerCase();
    let architectures = [];
    if (architecture) {
      architectures = [architecture];
      if (architecture != 'all') {
        architectures.push('all');
      }
    }

    return {
      limit: parseInt(getData(req, 'limit', 0), 10),
      skip: parseInt(getData(req, 'skip', 0), 10),
      sort: getData(req, 'sort', 'relevance'),
      types: uniq(types),
      ids: getDataArray(req, 'apps'),
      frameworks: getDataArray(req, 'frameworks'),
      architectures,
      category: getData(req, 'category'),
      author: getData(req, 'author'),
      search: getData(req, 'search'),
      channel: getData(req, 'channel').toLowerCase(),
      nsfw: getDataBoolean(req, 'nsfw') ? [true] : [null, false],
    };
  },

  parseFilters({ types, ids, frameworks, architectures, category, author, channel, search, nsfw, maintainer, published }) {
    const query = {};

    if (types && types.length > 0) {
      query.types = {
        $in: types,
      };
    }

    if (ids && ids.length > 0) {
      query.id = {
        $in: ids,
      };
    }

    if (frameworks && frameworks.length > 0) {
      query.framework = {
        $in: frameworks,
      };
    }

    if (architectures && architectures.length > 0) {
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
      query.$text = { $search: search };
    }

    if (nsfw) {
      query.nsfw = { $in: nsfw };
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
    const query = this.parseFilters(filters);

    return Package.countDocuments(query);
  },

  find(filters, sort, limit, skip) {
    const query = this.parseFilters(filters);

    const findQuery = Package.find(query).populate('rating_counts');

    if (sort == 'relevance') {
      if (query.$text) {
        findQuery.select({ score: { $meta: 'textScore' } });
        findQuery.sort({ score: { $meta: 'textScore' } });
      }
      else {
        findQuery.sort('name');
      }
    }
    else {
      findQuery.sort(sort).sort('name');
    }

    if (limit) {
      findQuery.limit(limit);
    }

    if (skip) {
      findQuery.skip(skip);
    }

    return findQuery.exec();
  },

  findOne(id, { published, frameworks, architecture, maintainer } = {}) {
    const query = {
      id,
    };

    if (published) {
      query.published = published;
    }

    if (frameworks) {
      query.framework = { $in: frameworks.split(',') };
    }

    if (architecture) {
      const architectures = [architecture];
      if (architecture != 'all') {
        architectures.push('all');
      }

      query.$or = [
        { architecture: { $in: architectures } },
        { architectures: { $in: architectures } },
      ];
    }

    if (maintainer) {
      query.maintainer = maintainer;
    }

    return Package.findOne(query).populate('rating_counts');
  },

  incrementDownload(id, revisionIndex) {
    const inc = {};
    inc[`revisions.${revisionIndex}.downloads`] = 1;

    return Package.updateOne({ _id: id }, { $inc: inc });
  },

  // TODO refactor to support multiple channels
  async stats() {
    const [categoryStats, typeStats, frameworkStats, archStats] = await Promise.all([
      this.categoryStats(Package.CHANNELS),
      Package.aggregate([
        {
          $match: { published: true, channels: { $in: Package.CHANNELS } },
        }, {
          $group: {
            _id: '$types',
            count: { $sum: 1 },
          },
        }, {
          $sort: { _id: 1 },
        },
      ]),
      Package.aggregate([
        {
          $match: { published: true, channels: { $in: Package.CHANNELS } },
        }, {
          $group: {
            _id: '$framework',
            count: { $sum: 1 },
          },
        }, {
          $sort: { _id: 1 },
        },
      ]),
      Package.aggregate([
        {
          $match: { published: true, channels: { $in: Package.CHANNELS } },
        }, {
          $group: {
            _id: '$architectures',
            count: { $sum: 1 },
          },
        }, {
          $sort: { _id: 1 },
        },
      ]),
    ]);

    const categories = {};
    categoryStats.forEach((category) => {
      categories[category._id] = category.count;
    });

    const types = {};
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

    const frameworks = {};
    frameworkStats.forEach((framework) => {
      frameworks[framework._id] = framework.count;
    });

    const architectures = {};
    archStats.forEach((stats) => {
      stats._id.forEach((arch) => {
        if (!architectures[arch]) {
          architectures[arch] = 0;
        }

        architectures[arch] += stats.count;
      });
    });

    return { categories, types, frameworks, architectures };
  },

  categoryStats(channels) {
    const match = { published: true };
    if (channels) {
      match.channels = { $in: channels };
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
        $sort: { _id: 1 },
      },
    ]);
  },
};

module.exports = PackageRepo;
