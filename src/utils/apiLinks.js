const URL = require('url').URL;

const config = require('../utils/config');

function apiLinks(originalUrl, count, limit, skip) {
    let next = null;
    let previous = null;
    limit = limit ? parseInt(limit, 10) : 0;
    skip = skip ? parseInt(skip, 10) : 0;

    let url = new URL(config.server.host + originalUrl);
    if (count == limit) {
        let nextSkip = skip + limit;
        url.searchParams.set('skip', nextSkip);
        next = url.toString();
    }

    if (skip > 0) {
        let previousSkip = (skip - limit > 0) ? (skip - limit) : 0;
        url.searchParams.set('skip', previousSkip);
        previous = url.toString();
    }

    return {next, previous};
}

module.exports = apiLinks;
