const Package = require('./model');
const { getData, getDataArray } = require('../../utils/helpers');

const PackageRepo = {
  parseRequestFilters(req) {
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

    const architecture = getData(req, 'architecture').toLowerCase();
    let architectures = [];
    if (architecture) {
      architectures = [architecture];
      if (architecture != 'all') {
        architectures.push('all');
      }
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
      types,
      ids: getDataArray(req, 'apps'),
      frameworks: getDataArray(req, 'frameworks'),
      architectures,
      category: getData(req, 'category'),
      author: getData(req, 'author'),
      search: getData(req, 'search'),
      channel: getData(req, 'channel').toLowerCase(),
      nsfw,
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
      if (Array.isArray(nsfw)) {
        query.nsfw = { $in: nsfw };
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

  async stats() {
    const [categoryStats, typeStats, frameworkStats] = await Promise.all([
      this.categoryStats(),
      Package.aggregate([
        {
          $match: { published: true },
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
          $match: { published: true, channels: Package.XENIAL },
        }, {
          $group: {
            _id: '$framework',
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

    return { categories, types, frameworks };
  },

  categoryStats(channel) {
    const match = { published: true };
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
        $sort: { _id: 1 },
      },
    ]);
  },
};

module.exports = PackageRepo;
