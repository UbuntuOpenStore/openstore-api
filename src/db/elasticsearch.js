'use strict';

const elasticsearch = require('elasticsearch');

var config = require('../utils/config');

//Modified from https://github.com/bhdouglass/uappexplorer/blob/master/src/db/elasticsearch/elasticsearch.js
class Elasticsearch {
    constructor() {
        this.client = new elasticsearch.Client({host: config.elasticsearch.uri});

        this.index = 'openstore_packages';
        this.type = 'openstore_package';

        this.properties = [
            'id',
            'name',
            'architectures',
            'author',
            'category',
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
        ];

        this.search_fields = [
            'search_name^3',
            'description^2',
            'keywords^2',
            'author',
        ];
    }

    _convert(item) {
        let doc = {};
        this.properties.forEach((prop) => {
            doc[prop] = item[prop] ? item[prop] : null;
        });
        doc.search_name = item.name;
        doc.keywords = doc.keywords ? doc.keywords.map((keyword) => keyword.toLowerCase()) : [];
        doc.category = doc.category ? doc.category.replace(/&/g, '_').replace(/ /g, '_').toLowerCase() : '';
        doc.nsfw = !!doc.nsfw; //Force a boolean

        return doc;
    }

    upsert(item) {
        return this.client.update({
            index: this.index,
            type: this.type,
            id: item.id,
            retryOnConflict: 3,
            body: {
                doc_as_upsert: true,
                doc: this._convert(item),
            }
        }).then(() => {
            return item;
        });
    }

    remove(item) {
        return this.client.delete({
            index: this.index,
            type: this.type,
            id: item.id,
            retryOnConflict: 3,
        }).then(() => {
            return item;
        }).catch((err) => {
            if (err.status == 404) {
                return item;
            }
            else {
                throw err;
            }
        });
    }

    bulk(upserts, removals) {
        let body = [];
        upserts.forEach((item) => {
            body.push({update: {
                _id: item.id,
                _index: this.index,
                _type: this.type,
                _retry_on_conflict : 3
            }});

            body.push({
                doc_as_upsert: true,
                doc: this._convert(item),
            });
        }, this);

        if (removals) {
            body = body.concat(removals.map((id) => {
                return {delete: {
                    _id: id,
                    _index: this.index,
                    _type: this.type,
                    _retry_on_conflict : 3
                }};
            }));
        }

        return this.client.bulk({body: body});
    }

    search(query, sort, filters, skip, limit) {
        let request = {
            index: this.index,
            type: this.type,
            body: {
                from: skip ? skip : 0,
                size: limit ? limit : 30,
                query: {
                    multi_match: {
                        query: query.toLowerCase(),
                        fields: this.search_fields,
                        slop: 10,
                        max_expansions: 50,
                        type: 'phrase_prefix',
                    }
                }
            }
        };

        if (filters && filters.and && filters.and.length > 0) {
            request.body.filter = filters;
        }

        if (sort && sort.field) {
            let s = {};
            s[sort.field] = {
                'order': sort.direction,
                'ignore_unmapped': true,
            };
            request.body.sort = [s];
        }

        return this.client.search(request);
    }

    removeIndex() {
        return this.client.indices.delete({index: this.index});
    }

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
                                filter: 'lowercase'
                            }
                        }
                    }
                },
                mappings: {
                    'package': {
                        properties: {
                            search_name: {
                                type: 'string',
                                analyzer: 'lower_standard'
                            },
                            description: {
                                type: 'string',
                                analyzer: 'lower_standard'
                            },
                            keywords: {
                                type: 'string',
                                analyzer: 'lower_standard'
                            },
                            author: {
                                type: 'string',
                                analyzer: 'lower_standard'
                            },
                            category: {
                                type: 'string',
                                analyzer: 'not_analyzed'
                            },
                            license: {
                                type: 'string',
                                index: 'not_analyzed'
                            },
                            architecture: {
                                type: 'string',
                                index: 'not_analyzed'
                            },
                            name: {
                                type: 'string',
                                index: 'not_analyzed'
                            },
                            framework: {
                                type: 'string',
                                index: 'not_analyzed'
                            },
                            icon: {
                                type: 'string',
                                index: 'not_analyzed'
                            }
                        }
                    }
                }
            }
        });
    }
}

module.exports = Elasticsearch;
