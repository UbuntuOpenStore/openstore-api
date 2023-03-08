/* eslint-disable no-param-reassign */

import { FilterQuery, Schema } from 'mongoose';
import uniq from 'lodash/uniq';
import { Request } from 'express';

import { getData, getDataArray, getDataBooleanOrUndefined, getDataInt } from 'utils';
import { UserError } from 'exceptions';
import { DUPLICATE_PACKAGE, NO_SPACES_NAME, BAD_NAMESPACE, MISSING_CHANNEL_ARCH } from 'utils/error-messages';
import {
  Architecture,
  PackageType,
  PackageRequestFilters,
  PackageDoc,
  CategoryStat,
  Channel,
  ChannelArchitecture,
  PackageModel,
  PackageStats,
  PackageQueryReturn,
} from './types';
import { packageSearchInstance } from './search';
import { RatingCount } from '../rating_count/model';

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

    const architecture = getData(req, 'architecture').toLowerCase();
    let architectures: Architecture[] = [];
    if (architecture) {
      architectures = [architecture];
      if (architecture != Architecture.ALL) {
        architectures.push(Architecture.ALL);
      }
    }

    let limit = getDataInt(req, 'limit', 30);
    if (limit > 100) {
      limit = 100;
    }
    else if (limit <= 0) {
      limit = 30;
    }

    const queryNsfw = getDataBooleanOrUndefined(req, 'nsfw');
    let nsfw: (null|boolean)[] = [];
    if (queryNsfw === true) {
      nsfw = [true];
    }
    else if (queryNsfw === false) {
      nsfw = [null, false];
    }

    const channel = getData(req, 'channel').toLowerCase();
    if (!channel && architectures.length > 0) {
      throw new UserError(MISSING_CHANNEL_ARCH);
    }

    return {
      limit,
      skip: getDataInt(req, 'skip', 0),
      sort: getData(req, 'sort', 'relevance'),
      types: uniq(types),
      ids: getDataArray(req, 'apps'),
      frameworks: getDataArray(req, 'frameworks'),
      architectures,
      category: getData(req, 'category'),
      author: getData(req, 'author') ? getData(req, 'author') : getData(req, 'publisher'),
      search: getData(req, 'search'),
      channel,
      nsfw,
    };
  };

  packageSchema.statics.parseFilters = function({
    types,
    ids,
    frameworks,
    architecture, // TODO can this be removed?
    architectures,
    category,
    author,
    channel,
    search,
    nsfw,
    maintainer,
    published,
  }: PackageRequestFilters, textSearch = true): FilterQuery<PackageDoc> {
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

    const parsedFrameworks = Array.isArray(frameworks) ? frameworks : (frameworks?.split(',') ?? []);
    const arches: Architecture[] = architectures ?? [];
    if (architecture) {
      arches.push(architecture);
      if (architecture != Architecture.ALL) {
        arches.push(Architecture.ALL);
      }
    }

    // If framework is specified, both arch and channel will also be specified
    // If arch is specified then channel must be specified
    if (arches.length > 0 && channel && parsedFrameworks.length > 0) {
      const deviceCompatibilities = arches.flatMap((arch) => {
        return parsedFrameworks.map((framework) => {
          return `${channel}:${arch}:${framework}`;
        });
      });

      query.device_compatibilities = { $in: deviceCompatibilities };
    }
    else if (arches.length > 0 && channel && parsedFrameworks.length === 0) {
      const channelArchitectures = arches.map((arch) => {
        return `${channel}:${arch}`;
      }) as ChannelArchitecture[];

      query.channel_architectures = { $in: channelArchitectures };
    }
    else if (channel) {
      query.channels = channel;
    }

    if (category) {
      query.category = category;
    }

    if (author) {
      query.author = author;
    }

    if (search) {
      if (textSearch) {
        query.$text = { $search: search };
      }
      else {
        query.name = { $regex: search, $options: 'i' };
      }
    }

    if (nsfw && nsfw.length > 0) {
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

  packageSchema.statics.countByFilters = async function(filters: PackageRequestFilters, textSearch = true): Promise<number> {
    const query = this.parseFilters(filters, textSearch);

    const result = await this.countDocuments(query);
    return result;
  };

  packageSchema.statics.findByFilters = async function(
    filters: PackageRequestFilters,
    sort: string = 'relevance',
    limit?: number,
    skip?: number,
    textSearch = true,
  ): Promise<PackageQueryReturn[]> {
    const query = this.parseFilters(filters, textSearch);

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
    filters: PackageRequestFilters = {},
  ): Promise<PackageQueryReturn | null> {
    const query = this.parseFilters(filters);
    query.id = id;

    const result = await this.findOne(query).populate('rating_counts');
    return result;
  };

  packageSchema.statics.searchByFilters = async function(
    filters: PackageRequestFilters,
    full = false,
  ): Promise<{ pkgs: PackageQueryReturn[], count: number }> {
    const results = await packageSearchInstance.search(filters, filters.sort, filters.skip, filters.limit);
    const hits = results.hits.hits.map((hit: any) => hit._source);

    const ids = hits.map((pkg: any) => pkg.id);
    let pkgs = [];
    if (full) {
      pkgs = await this.findByFilters({ ids });

      // Maintain ordering from the elastic search results
      pkgs.sort((a, b) => ids.indexOf(a.id) - ids.indexOf(b.id));
    }
    else {
      // Get the ratings
      const ratingCounts = await RatingCount.getCountsByIds(ids);

      pkgs = hits.map((pkg: any) => {
        return new this({
          ...pkg,
          rating_counts: ratingCounts[pkg.id] || [],
        });
      });
    }

    return {
      pkgs,
      count: results.hits.total,
    };
  };

  packageSchema.statics.checkId = async function(id: string): Promise<void> {
    if (id.includes(' ')) {
      throw new UserError(NO_SPACES_NAME);
    }

    const existing = await this.findOneByFilters(id);
    if (existing) {
      throw new UserError(DUPLICATE_PACKAGE);
    }
  };

  packageSchema.statics.checkRestrictedId = function(id: string): void {
    if (id.startsWith('com.ubuntu.') && !id.startsWith('com.ubuntu.developer.')) {
      throw new UserError(BAD_NAMESPACE);
    }
    if (id.startsWith('com.canonical.')) {
      throw new UserError(BAD_NAMESPACE);
    }
    if (id.includes('ubports')) {
      throw new UserError(BAD_NAMESPACE);
    }
    if (id.includes('openstore')) {
      throw new UserError(BAD_NAMESPACE);
    }
    if (id.includes('lomiri')) {
      throw new UserError(BAD_NAMESPACE);
    }
  };
}
