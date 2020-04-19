const URL = require('url').URL;

const config = require('./config');

function apiLinks(originalUrl, count, limit, skip) {
  let next = null;
  let previous = null;
  const parsedLimit = limit ? parseInt(limit, 10) : 0;
  const parsedSkip = skip ? parseInt(skip, 10) : 0;

  const url = new URL(config.server.host + originalUrl);
  if (count == parsedLimit) {
    const nextSkip = parsedSkip + parsedLimit;
    url.searchParams.set('skip', nextSkip);
    next = url.toString();
  }

  if (parsedSkip > 0) {
    const previousSkip = (parsedSkip - parsedLimit > 0) ? (parsedSkip - parsedLimit) : 0;
    url.searchParams.set('skip', previousSkip);
    previous = url.toString();
  }

  return { next, previous };
}

module.exports = apiLinks;
