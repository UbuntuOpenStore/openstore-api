import { URL } from 'url';

import { config } from './config';

export function apiLinks(originalUrl: string, count: number, limit: number = 0, skip: number = 0) {
  let next: string | null = null;
  let previous: string | null = null;

  const url = new URL(config.server.host + originalUrl);
  if (count == limit) {
    const nextSkip = skip + limit;
    url.searchParams.set('skip', `${nextSkip}`);
    next = url.toString();
  }

  if (skip > 0) {
    const previousSkip = (skip - limit > 0) ? (skip - limit) : 0;
    url.searchParams.set('skip', `${previousSkip}`);
    previous = url.toString();
  }

  return { next, previous };
}
