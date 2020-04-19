const elasticsearch = require('elasticsearch');

const config = require('../../utils/config');

// Modified from https://github.com/bhdouglass/uappexplorer/blob/master/src/db/elasticsearch/elasticsearch.js
const PackageSearch = {
  client: new elasticsearch.Client({ host: config.elasticsearch.uri }),
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
  ],

  search_fields: [
    'search_name^3',
    'description^2',
    'keywords^2',
    'author',
  ],

  convert(item) {
    const doc = {};
    this.properties.forEach((prop) => {
      doc[prop] = item[prop] ? item[prop] : null;
    });
    doc.search_name = item.name;
    doc.category = doc.category ? doc.category.replace(/&/g, '_').replace(/ /g, '_').toLowerCase() : '';
    doc.nsfw = !!doc.nsfw; // Force a boolean

    if (doc.keywords) {
      doc.keywords = doc.keywords.map((keyword) => keyword.toLowerCase());
    }
    else {
      doc.keywords = [];
    }

    return doc;
  },

  async upsert(item) {
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

  async remove(item) {
    try {
      await this.client.delete({
        index: this.index,
        type: this.type,
        id: item.id,
        retryOnConflict: 3,
      });
    }
    catch (err) {
      if (err.status == 404) {
        return item;
      }

      throw err;
    }

    return item;
  },

  bulk(upserts, removals) {
    let body = [];
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

  parseFilters({ types, ids, frameworks, architectures, category, author, channel, nsfw }) {
    const query = {
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

  search(filters, sort, skip, limit) {
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

    const request = {
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
      const s = {};
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

module.exports = PackageSearch;
