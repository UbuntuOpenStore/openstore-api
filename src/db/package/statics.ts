/* eslint-disable no-param-reassign */

import { FilterQuery, Schema } from 'mongoose';
import uniq from 'lodash/uniq';
import { Request } from 'express';

import { getData, getDataArray, getDataBoolean, getDataInt } from 'utils';
import {
  Architecture,
  PackageType,
  PackageRequestFilters,
  PackageDoc,
  CategoryStat,
  Channel,
  PackageModel,
  PackageStats,
  PackageFindOneFilters,
  PackageQueryReturn,
} from './types';

export function setupStatics(packageSchema: Schema<PackageDoc, PackageModel>) {
  packageSchema.statics.incrementDownload = async function(id: string, revisionIndex: number) {
    const inc: { [key: string]: number } = {};
    inc[`revisions.${revisionIndex}.downloads`] = 1;

    await this.updateOne({ _id: id }, { $inc: inc });
  };

  packageSchema.statics.stats = async function(): Promise<PackageStats> {
    // TODO refactor to support multiple channels

    const [categoryStats, typeStats, frameworkStats, archStats] = await Promise.all([
      this.categoryStats(Object.values(Channel)),
      this.aggregate([
        {
          $match: { published: true, channels: { $in: Object.values(Channel) } },
        }, {
          $group: {
            _id: '$types',
            count: { $sum: 1 },
          },
        }, {
          $sort: { _id: 1 },
        },
      ]),
      this.aggregate([
        {
          $match: { published: true, channels: { $in: Object.values(Channel) } },
        }, {
          $group: {
            _id: '$framework',
            count: { $sum: 1 },
          },
        }, {
          $sort: { _id: 1 },
        },
      ]),
      this.aggregate([
        {
          $match: { published: true, channels: { $in: Object.values(Channel) } },
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
    categoryStats.forEach((category: { _id: string, count: number }) => {
      categories[category._id] = category.count;
    });

    const types: { [key: string]: number } = {};
    typeStats.forEach((type) => {
      type._id.forEach((t: string) => {
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
      stats._id.forEach((arch: string) => {
        if (!architectures[arch]) {
          architectures[arch] = 0;
        }

        architectures[arch] += stats.count;
      });
    });

    return { categories, types, frameworks, architectures };
  };

  packageSchema.statics.categoryStats = async function(channels: Channel[]): Promise<CategoryStat[]> {
    const match: FilterQuery<PackageDoc> = { published: true };
    if (channels) {
      match.channels = { $in: channels };
    }

    const results = await this.aggregate([
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

    return results as CategoryStat[];
  };

  packageSchema.statics.parseRequestFilters = function(req: Request): PackageRequestFilters {
    const types = [
      ...getDataArray(req, 'types'),
      // Handle non-pluralized form
      ...getDataArray(req, 'type'),
    ];

    if (types.includes(PackageType.WEBAPP)) {
      types.push(PackageType.WEBAPP_PLUS);
    }

    const architecture = getData(req, 'architecture').toLowerCase();
    let architectures: Architecture[] = [];
    if (architecture) {
      architectures = [architecture];
      if (architecture != Architecture.ALL) {
        architectures.push(Architecture.ALL);
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
  };

  packageSchema.statics.parseFilters = function({
    types,
    ids,
    frameworks,
    architectures,
    category,
    author,
    channel,
    search,
    nsfw,
    maintainer,
    published,
  }: PackageRequestFilters): FilterQuery<PackageDoc> {
    const query: FilterQuery<PackageDoc> = {};

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
  };

  packageSchema.statics.countByFilters = async function(filters: PackageRequestFilters): Promise<number> {
    const query = this.parseFilters(filters);

    const result = await this.countDocuments(query);
    return result;
  };

  packageSchema.statics.findByFilters = async function(
    filters: PackageRequestFilters,
    sort: string = 'relevance',
    limit?: number,
    skip?: number,
  ): Promise<PackageQueryReturn[]> {
    const query = this.parseFilters(filters);

    const findQuery = this.find(query).populate('rating_counts');

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

    const results = await findQuery.exec();
    return results;
  };

  packageSchema.statics.findOneByFilters = async function(
    id: string,
    { published, frameworks, architecture, maintainer }: PackageFindOneFilters = {},
  ): Promise<PackageQueryReturn | null> {
    // TODO make this use this.parseFilters()
    const query: FilterQuery<PackageDoc> = {
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

    const result = await this.findOne(query).populate('rating_counts');
    return result;
  };
}
