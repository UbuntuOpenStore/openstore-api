import elasticsearch from '@elastic/elasticsearch';

import { config } from 'utils';
import { type HydratedPackage, type IPackage, type PackageRequestFilters } from './types';
import { type Search } from '@elastic/elasticsearch/api/requestParams';

// Modified from https://github.com/bhdouglass/uappexplorer/blob/master/src/db/elasticsearch/elasticsearch.js

const INDEX = config.elasticsearch.index;
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
  private readonly client: elasticsearch.Client;

  constructor() {
    /*
      IMPORTANT: The client version must match the major version of the server. So we need v7 while the server is v7
      Also, we are stuck at v7.13.0 for now due to the client not supporting the server:
      https://github.com/elastic/elasticsearch-js/issues/1519
    */
    this.client = new elasticsearch.Client({
      node: config.elasticsearch.uri,
    });
  }

  convert(item: HydratedPackage) {
    const doc: Partial<IPackage> & { search_name?: string } = {};
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

  async upsert(item: HydratedPackage) {
    await this.client.update({
      index: INDEX,
      id: item.id,
      retry_on_conflict: 3,
      body: {
        doc_as_upsert: true,
        doc: this.convert(item),
      },
    });

    return item;
  }

  async remove(item: HydratedPackage) {
    try {
      await this.client.delete({
        index: INDEX,
        id: item.id,
      } as any);
    }
    catch (err) {
      if (err?.meta?.statusCode === 404) {
        return item;
      }

      throw err;
    }

    return item;
  }

  bulk(upserts: HydratedPackage[], removals?: HydratedPackage[]) {
    let body: { [key: string]: any }[] = [];
    upserts.forEach((item) => {
      body.push({
        update: {
          _id: item.id,
          _index: INDEX,
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
          },
        };
      }));
    }

    return this.client.bulk({ body });
  }

  parseFilters({ types, ids, frameworks, architectures, category, author, channel, nsfw }: PackageRequestFilters) {
    // No default published=true filter, only published apps are in elasticsearch
    const query: { [key: string]: any }[] = [];

    if (types && types.length > 0) {
      query.push({
        terms: {
          types,
        },
      });
    }

    if (ids && ids.length > 0) {
      query.push({
        terms: {
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

      query.push({
        terms: { device_compatibilities: deviceCompatibilities },
      });
    }
    else if (architectures && architectures.length > 0 && channel) {
      const channelArchitectures = architectures.map((arch) => {
        return `${channel}:${arch}`;
      });

      query.push({
        terms: { channel_architectures: channelArchitectures },
      });
    }
    else if (channel) {
      query.push({
        terms: {
          channels: [channel],
        },
      });
    }

    if (category) {
      query.push({
        term: {
          category: category.replace(/&/g, '_').replace(/ /g, '_').toLowerCase(),
        },
      });
    }

    if (author) {
      query.push({
        term: {
          author,
        },
      });
    }

    if (nsfw) {
      query.push({
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
    if (sort && sort !== 'relevance') {
      if (sort.charAt(0) === '-') {
        direction = 'desc';
        sortTerm = sort.substring(1);
      }
      else {
        sortTerm = sort;
      }
    }

    const request: Search<Record<string, any>> = {
      index: INDEX,
      body: {
        from: skip || 0,
        size: limit || 30,
        query: {
          bool: {
            must: {
              multi_match: {
                query: filters.search?.toLowerCase() || '',
                fields: SEARCH_FIELDS,
                slop: 10,
                max_expansions: 50,
                type: 'phrase_prefix',
              },
            },
          },
        },
      },
    };

    const query = this.parseFilters(filters);
    if (query && query.length > 0) {
      request.body!.query.bool.filter = query;
    }

    if (sortTerm) {
      const s: { [key: string]: { order: string } } = {};
      s[sortTerm] = {
        order: direction,
      };
      request.body!.sort = [s];
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
          properties: {
            search_name: {
              type: 'text',
              analyzer: 'lower_standard',
            },
            description: {
              type: 'text',
              analyzer: 'lower_standard',
            },
            keywords: {
              type: 'text',
              analyzer: 'lower_standard',
            },
            author: {
              type: 'text',
              analyzer: 'lower_standard',
            },
            category: {
              type: 'keyword',
            },
            license: {
              type: 'keyword',
            },
            architectures: {
              type: 'keyword',
            },
            name: {
              type: 'keyword',
            },
            framework: {
              type: 'keyword',
            },
            icon: {
              type: 'keyword',
            },
            version: {
              type: 'keyword',
            },
            channels: {
              type: 'keyword',
            },
            channel_architectures: {
              type: 'keyword',
            },
            device_compatibilities: {
              type: 'keyword',
            },
          },
        },
      },
    });
  }
}

export const packageSearchInstance = new PackageSearch();
