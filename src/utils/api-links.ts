import { URL } from 'url';

import config from './config';

export default function apiLinks(originalUrl: string, count: number, limit: number, skip: number) {
  let next: string | null = null;
  let previous: string | null = null;
  const parsedLimit = limit || 0;
  const parsedSkip = skip || 0;

  const url = new URL(config.server.host + originalUrl);
  if (count == parsedLimit) {
    const nextSkip = parsedSkip + parsedLimit;
    url.searchParams.set('skip', nextSkip + '');
    next = url.toString();
  }

  if (parsedSkip > 0) {
    const previousSkip = (parsedSkip - parsedLimit > 0) ? (parsedSkip - parsedLimit) : 0;
    url.searchParams.set('skip', previousSkip + '');
    previous = url.toString();
  }

  return { next, previous };
}
