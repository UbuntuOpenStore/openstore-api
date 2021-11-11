import elasticsearch from 'elasticsearch';

import config from 'utils/config';
import { PackageDoc, PackageType, Architecture, Channel } from './types';

// Modified from https://github.com/bhdouglass/uappexplorer/blob/master/src/db/elasticsearch/elasticsearch.js
export default {
  // https://stackoverflow.com/a/68631678
  client: new elasticsearch.Client({ host: config.elasticsearch.uri, apiVersion: '6.8', ssl: { rejectUnauthorized: false, pfx: [] } }),
  index: config.elasticsearch.index,
  type: 'openstore_package',

  properties: [
    'id',
    'name',
    'architectures',
    'author',
    'category',
    'channels',
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
  ],

  search_fields: [
    'search_name^3',
    'description^2',
    'keywords^2',
    'author',
  ],

  convert(item: PackageDoc) {
    const doc: { [key: string]: any} = {}; // TODO fix types
    this.properties.forEach((prop) => {
      doc[prop] = item[prop] ? item[prop] : null;
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
  },

  async upsert(item: PackageDoc) {
    await this.client.update({
      index: this.index,
      type: this.type,
      id: item.id,
      retryOnConflict: 3,
      body: {
        doc_as_upsert: true,
        doc: this.convert(item),
      },
    });

    return item;
  },

  async remove(item: PackageDoc) {
    try {
      await this.client.delete({
        index: this.index,
        type: this.type,
        id: item.id,
        retryOnConflict: 3,
      });
    }
    catch (err) {
      // TODO fix types
      if ((err as any)?.status == 404) {
        return item;
      }

      throw err;
    }

    return item;
  },

  bulk(upserts: PackageDoc[], removals?: PackageDoc[]) {
    let body: { [key: string]: any }[] = []; // TODO fix type
    upserts.forEach((item) => {
      body.push({
        update: {
          _id: item.id,
          _index: this.index,
          _type: this.type,
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
            _index: this.index,
            _type: this.type,
            _retry_on_conflict: 3,
          },
        };
      }));
    }

    return this.client.bulk({ body });
  },

  parseFilters({ types, ids, frameworks, architectures, category, author, channel, nsfw }: { types: PackageType[], ids: string[], frameworks: string[], architectures: Architecture[], category: string, author: string, channel: Channel, nsfw: boolean }) {
    const query: { [key: string]: any } = { // TODO fix types
      and: [], // No default published=true filter, only published apps are in elasticsearch
    };

    if (types.length > 0) {
      query.and.push({
        in: {
          types,
        },
      });
    }

    if (ids.length > 0) {
      query.and.push({
        in: {
          id: ids,
        },
      });
    }

    if (frameworks.length > 0) {
      query.and.push({
        in: {
          framework: frameworks,
        },
      });
    }

    if (architectures.length > 0) {
      query.and.push({
        in: {
          architectures,
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

    if (channel) {
      query.and.push({
        in: {
          channels: [channel],
        },
      });
    }

    if (nsfw) {
      if (Array.isArray(nsfw)) {
        // This looks a big weird because the filters.nsfw == [null, false]
        // TODO clean it up
        query.and.push({
          term: {
            nsfw: false,
          },
        });
      }
      else {
        query.and.push({
          term: {
            nsfw,
          },
        });
      }
    }

    return query;
  },

  // TODO enum sort
  // TODO fix filters type
  search(filters: { [key: string]: any }, sort: string, skip: number, limit: number) {
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

    // TODO fix types
    const request: { [key: string]: any } = {
      index: this.index,
      type: this.type,
      body: {
        from: skip || 0,
        size: limit || 30,
        query: {
          multi_match: {
            query: filters.search.toLowerCase(),
            fields: this.search_fields,
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
      const s: { [key: string]: any } = {}; // TODO fix types
      s[sortTerm] = {
        order: direction,
        ignore_unmapped: true,
      };
      request.body.sort = [s];
    }

    return this.client.search(request);
  },

  removeIndex() {
    return this.client.indices.delete({ index: this.index });
  },

  createIndex() {
    return this.client.indices.create({
      index: this.index,
      body: {
        packages: this.index,
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
              architecture: {
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
            },
          },
        },
      },
    });
  },
};
