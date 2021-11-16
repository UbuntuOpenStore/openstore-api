import request from 'request';
import sanitizeHtml from 'sanitize-html';
import * as Sentry from '@sentry/node';
import isString from 'lodash/isString';
import fs from 'fs';

import { Request, Response } from 'express';
import logger from './logger';

export function success(res: Response, data: any, message?: string) {
  res.send({
    success: true,
    data,
    message: message || null,
  });
}

export function error(res: Response, message: string | unknown | Error, code = 500) {
  logger.debug(`server: ${message}`);

  res.status(code);
  res.send({
    success: false,
    data: null,
    message,
  });
}

// TODO refactor to use axios
export function download(url: string, filename: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = request(url);
    r.on('error', (err: any) => {
      reject(err);
    }).on('response', (response: any) => {
      if (response.statusCode == 200) {
        const f = fs.createWriteStream(filename);
        f.on('error', (err) => {
          reject(err);
        }).on('finish', () => {
          resolve(filename);
        });

        r.pipe(f);
      }
      else {
        console.log(response);

        reject(new Error(`Failed to download "${url}": ${response.statusCode}`));
      }
    });
  });
}

export function getData(req: Request, name: string, defaultData = '') {
  if (req.query && req.query[name]) {
    const value = req.query[name];
    if (isString(value)) {
      return value.trim();
    }
  }

  if (req.body && req.body[name]) {
    return req.body[name].trim();
  }

  return defaultData;
}

export function getDataInt(req: Request, name: string, defaultData = 0) {
  let returnValue = defaultData;
  if (req.query && req.query[name]) {
    const value = req.query[name];

    if (isString(value)) {
      returnValue = parseInt(value.trim(), 10);
    }
  }

  if (req.body && req.body[name]) {
    returnValue = parseInt(req.body[name].trim(), 10);
  }

  return Number.isNaN(returnValue) ? defaultData : returnValue;
}

export function getDataArray(req: Request, name: string, defaultData: string[] = []) {
  if (req.query && req.query[name]) {
    const value = req.query[name];
    if (Array.isArray(value)) {
      return value;
    }

    if (isString(value)) {
      return value.split(',');
    }
  }

  if (req.body && req.body[name]) {
    if (Array.isArray(req.body[name])) {
      return req.body[name];
    }

    return req.body[name].split(',');
  }

  return defaultData;
}

export function getDataBoolean(req: Request, name: string, defaultData = false) {
  if (req.query && req.query[name] !== undefined) {
    const value = req.query[name];
    if (isString(value)) {
      return value.toLowerCase() == 'true';
    }

    return Boolean(value);
  }

  if (req.body && req.body[name] !== undefined) {
    if (isString(req.body[name])) {
      return req.body[name].toLowerCase() == 'true';
    }

    return Boolean(req.body[name]);
  }

  return Boolean(defaultData);
}

export function sanitize(html: string) {
  return sanitizeHtml(html, {
    allowedTags: [],
    allowedAttributes: {},
  }).replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/\r/g, '')
    .trim();
}

export function captureException(err: string | unknown | Error, route: string) {
  if (process.env.NODE_ENV != 'testing') {
    console.error(err);
  }

  Sentry.withScope((scope) => {
    scope.setTag('route', route);
    Sentry.captureException(err);
  });
}
