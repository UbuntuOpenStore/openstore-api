import elasticsearch, { SearchParams } from 'elasticsearch';

import { config } from 'utils';
import { PackageDoc, PackageRequestFilters, PackageSchema } from './types';

// Modified from https://github.com/bhdouglass/uappexplorer/blob/master/src/db/elasticsearch/elasticsearch.js

const INDEX = config.elasticsearch.index;
const TYPE = 'openstore_package';
const PROPERTIES = [
  'id',
  'name',
  'architectures',
  'author',
  'category',
  'channels',
  'channel_architectures',
  'device_compatibilities',
  'description',
  'framework',
  'icon',
  'keywords',
  'license',
  'nsfw',
  'published_date',
  'tagline',
  'types',
  'updated_date',
  'version',
  'calculated_rating',
];

const SEARCH_FIELDS = [
  'search_name^3',
  'description^2',
  'keywords^2',
  'author',
];

export class PackageSearch {
  // https://stackoverflow.com/a/68631678
  private client: elasticsearch.Client;

  constructor() {
    this.client = new elasticsearch.Client({
      host: config.elasticsearch.uri,
      apiVersion: '6.8',
      ssl: { rejectUnauthorized: false, pfx: [] },
    });
  }

  convert(item: PackageDoc) {
    const doc: Partial<PackageSchema> & { search_name?: string } = {};
    PROPERTIES.forEach((prop: string) => {
      (doc as any)[prop] = (item as any)[prop] ? (item as any)[prop] : null;
    });
    doc.search_name = item.name;
    doc.category = doc.category ? doc.category.replace(/&/g, '_').replace(/ /g, '_').toLowerCase() : '';
    doc.nsfw = !!doc.nsfw; // Force a boolean

    if (doc.keywords) {
      doc.keywords = doc.keywords.map((keyword: string) => keyword.toLowerCase().trim()).filter(Boolean);
    }
    else {
      doc.keywords = [];
    }

    return doc;
  }

  async upsert(item: PackageDoc) {
    await this.client.update({
      index: INDEX,
      type: TYPE,
      id: item.id,
      retryOnConflict: 3,
      body: {
        doc_as_upsert: true,
        doc: this.convert(item),
      },
    });

    return item;
  }

  async remove(item: PackageDoc) {
    try {
      await this.client.delete({
        index: INDEX,
        type: TYPE,
        id: item.id,
        retryOnConflict: 3,
      } as any);
    }
    catch (err) {
      if (err?.status == 404) {
        return item;
      }

      throw err;
    }

    return item;
  }

  bulk(upserts: PackageDoc[], removals?: PackageDoc[]) {
    let body: { [key: string]: any }[] = [];
    upserts.forEach((item) => {
      body.push({
        update: {
          _id: item.id,
          _index: INDEX,
          _type: TYPE,
          _retry_on_conflict: 3,
        },
      });

      body.push({
        doc_as_upsert: true,
        doc: this.convert(item),
      });
    });

    if (removals) {
      body = body.concat(removals.map((id) => {
        return {
          delete: {
            _id: id,
            _index: INDEX,
            _type: TYPE,
            _retry_on_conflict: 3,
          },
        };
      }));
    }

    return this.client.bulk({ body });
  }

  parseFilters({ types, ids, frameworks, architectures, category, author, channel, nsfw }: PackageRequestFilters) {
    const query: { [key: string]: any } = {
      and: [], // No default published=true filter, only published apps are in elasticsearch
    };

    if (types && types.length > 0) {
      query.and.push({
        in: {
          types,
        },
      });
    }

    if (ids && ids.length > 0) {
      query.and.push({
        in: {
          id: ids,
        },
      });
    }

    // If framework is specified, both arch and channel will also be specified
    // If arch is specified then channel must be specified
    const parsedFrameworks = Array.isArray(frameworks) ? frameworks : (frameworks?.split(',') ?? []);
    if (architectures && architectures.length > 0 && channel && parsedFrameworks.length > 0) {
      const deviceCompatibilities = architectures.flatMap((arch) => {
        return parsedFrameworks.map((framework) => {
          return `${channel}:${arch}:${framework}`;
        });
      });

      query.and.push({
        in: { device_compatibilities: deviceCompatibilities },
      });
    }
    else if (architectures && architectures.length > 0 && channel) {
      const channelArchitectures = architectures.map((arch) => {
        return `${channel}:${arch}`;
      });

      query.and.push({
        in: { channel_architectures: channelArchitectures },
      });
    }
    else if (channel) {
      query.and.push({
        in: {
          channels: [channel],
        },
      });
    }

    if (category) {
      query.and.push({
        term: {
          category: category.replace(/&/g, '_').replace(/ /g, '_').toLowerCase(),
        },
      });
    }

    if (author) {
      query.and.push({
        term: {
          author,
        },
      });
    }

    if (nsfw) {
      query.and.push({
        term: {
          nsfw: nsfw.includes(true),
        },
      });
    }

    return query;
  }

  search(filters: PackageRequestFilters, sort: string = 'relevance', skip: number = 0, limit: number = 30) {
    let sortTerm = '';
    let direction = 'asc';
    if (sort && sort != 'relevance') {
      if (sort.charAt(0) == '-') {
        direction = 'desc';
        sortTerm = sort.substring(1);
      }
      else {
        sortTerm = sort;
      }
    }

    const request: SearchParams = {
      index: INDEX,
      type: TYPE,
      body: {
        from: skip || 0,
        size: limit || 30,
        query: {
          multi_match: {
            query: filters.search?.toLowerCase() || '',
            fields: SEARCH_FIELDS,
            slop: 10,
            max_expansions: 50,
            type: 'phrase_prefix',
          },
        },
      },
    };

    const query = this.parseFilters(filters);
    if (query && query.and && query.and.length > 0) {
      request.body.filter = query;
    }

    if (sortTerm) {
      const s: { [key: string]: { order: string; ignore_unmapped: boolean } } = {};
      s[sortTerm] = {
        order: direction,
        ignore_unmapped: true,
      };
      request.body.sort = [s];
    }

    return this.client.search(request);
  }

  removeIndex() {
    return this.client.indices.delete({ index: INDEX });
  }

  createIndex() {
    return this.client.indices.create({
      index: INDEX,
      body: {
        packages: INDEX,
        settings: {
          analysis: {
            analyzer: {
              lower_standard: {
                type: 'custom',
                tokenizer: 'standard',
                filter: 'lowercase',
              },
            },
          },
        },
        mappings: {
          package: {
            properties: {
              search_name: {
                type: 'string',
                analyzer: 'lower_standard',
              },
              description: {
                type: 'string',
                analyzer: 'lower_standard',
              },
              keywords: {
                type: 'string',
                analyzer: 'lower_standard',
              },
              author: {
                type: 'string',
                analyzer: 'lower_standard',
              },
              category: {
                type: 'string',
                index: 'not_analyzed',
              },
              license: {
                type: 'string',
                index: 'not_analyzed',
              },
              architectures: {
                type: 'string',
                index: 'not_analyzed',
              },
              name: {
                type: 'string',
                index: 'not_analyzed',
              },
              framework: {
                type: 'string',
                index: 'not_analyzed',
              },
              icon: {
                type: 'string',
                index: 'not_analyzed',
              },
              version: {
                type: 'string',
                index: 'not_analyzed',
              },
              channels: {
                type: 'string',
                index: 'not_analyzed',
              },
              channel_architectures: {
                type: 'string',
                index: 'not_analyzed',
              },
              device_compatibilities: {
                type: 'string',
                index: 'not_analyzed',
              },
            },
          },
        },
      },
    });
  }
}

export const packageSearchInstance = new PackageSearch();
