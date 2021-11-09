import uniq from 'lodash/uniq';
import { Request } from 'express';

import Package from './model';
import { getData, getDataArray, getDataBoolean, getDataInt } from '../../utils/helpers';
import { Architecture, Channel, PackageType } from './types';

export default {
  parseRequestFilters(req: Request) {
    const types = [
      ...getDataArray(req, 'types'),
      // Handle non-pluralized form
      ...getDataArray(req, 'type'),
    ];

    if (types.includes('webapp')) {
      types.push('webapp+');
    }

    const architecture = getData(req, 'architecture').toLowerCase();
    let architectures: string[] = [];
    if (architecture) {
      architectures = [architecture];
      if (architecture != 'all') {
        architectures.push('all');
      }
    }

    return {
      limit: getDataInt(req, 'limit', 0),
      skip: getDataInt(req, 'skip', 0),
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

  parseFilters({ types, ids, frameworks, architectures, category, author, channel, search, nsfw, maintainer, published }: { types?: PackageType[], ids?: string[], frameworks?: string[], architectures?: Architecture[], category?: string, author?: string, channel?: Channel, search?: string, nsfw?: boolean, maintainer?: string, published?: boolean }) {
    const query: { [key: string]: any } = {}; // TODO fix types

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

  // TODO fix types
  count(filters: { [key: string]: any }) {
    const query = this.parseFilters(filters);

    return Package.countDocuments(query);
  },


  // TODO fix types
  find(filters: { [key: string]: any }, sort: string = 'relevance', limit?: number, skip?: number) {
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

  findOne(id: string, { published, frameworks, architecture, maintainer }: { published?: boolean, frameworks?: string, architecture?: Architecture, maintainer?: string} = {}) {
    // TODO fix types
    const query: { [key: string]: any } = {
      id,
    };

    if (published) {
      query.published = published;
    }

    if (frameworks && frameworks.length > 0) {
      query.framework = { $in: frameworks.split(',') };
    }

    if (architecture) {
      const architectures = [architecture];
      if (architecture != Architecture.ALL) {
        architectures.push(Architecture.ALL);
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

  incrementDownload(id: string, revisionIndex: number) {
    const inc: { [key: string]: number } = {};
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

    const categories: { [key: string]: number } = {};
    categoryStats.forEach((category) => {
      categories[category._id] = category.count;
    });

    const types: { [key: string]: number } = {};
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

    const frameworks: { [key: string]: number } = {};
    frameworkStats.forEach((framework) => {
      frameworks[framework._id] = framework.count;
    });

    const architectures: { [key: string]: number } = {};
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

  categoryStats(channels: Channel[]) {
    const match: { [key: string]: any } = { published: true }; // TODO fix type
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
