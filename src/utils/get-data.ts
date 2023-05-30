import { type Request } from 'express';
import isString from 'lodash/isString';

export function getData(req: Request, name: string, defaultData = ''): string {
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

export function getDataInt(req: Request, name: string, defaultData = 0): number {
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

export function getDataArray(req: Request, name: string, defaultData: string[] = []): string[] {
  if (req.query && req.query[name]) {
    const value = req.query[name];
    if (Array.isArray(value)) {
      return value as string[];
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

export function getDataBoolean(req: Request, name: string, defaultData = false): boolean {
  if (req.query && req.query[name] !== undefined) {
    const value = req.query[name];
    if (isString(value)) {
      return value.toLowerCase() === 'true';
    }

    return Boolean(value);
  }

  if (req.body && req.body[name] !== undefined) {
    if (isString(req.body[name])) {
      return req.body[name].toLowerCase() === 'true';
    }

    return Boolean(req.body[name]);
  }

  return Boolean(defaultData);
}

export function getDataBooleanOrUndefined(req: Request, name: string): boolean | undefined {
  if (req.query && req.query[name] !== undefined && req.query[name] !== '') {
    const value = req.query[name];
    if (isString(value)) {
      return value.toLowerCase() === 'true';
    }

    return Boolean(value);
  }

  if (req.body && req.body[name] !== undefined && req.body[name] !== '') {
    if (isString(req.body[name])) {
      return req.body[name].toLowerCase() === 'true';
    }

    return Boolean(req.body[name]);
  }

  return undefined;
}
