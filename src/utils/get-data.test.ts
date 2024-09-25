import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { getData, getDataArray, getDataBoolean, getDataBooleanOrUndefined } from './get-data';

describe('Helpers', () => {
  describe('getData', () => {
    test('gets trimmed data from the query', () => {
      assert.equal(getData({ query: { foo: ' bar ' } } as any, 'foo'), 'bar');
    });

    test('gets trimmed data from the body', () => {
      assert.equal(getData({ body: { foo: ' bar ' } } as any, 'foo'), 'bar');
    });

    test('returns the default', () => {
      assert.equal(getData({} as any, 'foo', 'default'), 'default');
    });
  });

  describe('getDataArray', () => {
    test('gets array data from the query', () => {
      assert.deepEqual(getDataArray({ query: { foo: ['bar', 'baz'] } } as any, 'foo'), ['bar', 'baz']);
    });

    test('gets csv data from the query', () => {
      assert.deepEqual(getDataArray({ query: { foo: 'bar,baz' } } as any, 'foo'), ['bar', 'baz']);
    });

    test('gets array data from the body', () => {
      assert.deepEqual(getDataArray({ body: { foo: ['bar', 'baz'] } } as any, 'foo'), ['bar', 'baz']);
    });

    test('gets csv data from the body', () => {
      assert.deepEqual(getDataArray({ body: { foo: 'bar,baz' } } as any, 'foo'), ['bar', 'baz']);
    });

    test('returns the default', () => {
      assert.deepEqual(getDataArray({} as any, 'foo', ['default']), ['default']);
    });
  });

  describe('getDataBoolean', () => {
    test('gets boolean string data from the query', () => {
      assert.equal(getDataBoolean({ query: { foo: 'true' } } as any, 'foo'), true);
      assert.equal(getDataBoolean({ query: { foo: 'false' } } as any, 'foo'), false);
    });

    test('gets boolean data from the query', () => {
      assert.equal(getDataBoolean({ query: { foo: true } } as any, 'foo'), true);
    });

    test('gets boolean string data from the body', () => {
      assert.equal(getDataBoolean({ body: { foo: 'true' } } as any, 'foo'), true);
      assert.equal(getDataBoolean({ body: { foo: 'false' } } as any, 'foo'), false);
    });

    test('gets boolean data from the body', () => {
      assert.equal(getDataBoolean({ body: { foo: true } } as any, 'foo'), true);
    });

    test('returns the default', () => {
      assert.equal(getDataBoolean({} as any, 'foo', true), true);
    });
  });

  describe('getDataBooleanOrUndefined', () => {
    test('gets boolean string data from the query', () => {
      assert.equal(getDataBooleanOrUndefined({ query: { foo: 'true' } } as any, 'foo'), true);
      assert.equal(getDataBooleanOrUndefined({ query: { foo: 'false' } } as any, 'foo'), false);
    });

    test('gets boolean data from the query', () => {
      assert.equal(getDataBooleanOrUndefined({ query: { foo: true } } as any, 'foo'), true);
    });

    test('gets boolean string data from the body', () => {
      assert.equal(getDataBooleanOrUndefined({ body: { foo: 'true' } } as any, 'foo'), true);
      assert.equal(getDataBooleanOrUndefined({ body: { foo: 'false' } } as any, 'foo'), false);
    });

    test('gets boolean data from the body', () => {
      assert.equal(getDataBooleanOrUndefined({ body: { foo: true } } as any, 'foo'), true);
    });

    test('returns undefined', () => {
      assert.equal(getDataBooleanOrUndefined({} as any, 'foo'), undefined);
      assert.equal(getDataBooleanOrUndefined({ query: { foo: '' } } as any, 'foo'), undefined);
      assert.equal(getDataBooleanOrUndefined({ body: { foo: '' } } as any, 'foo'), undefined);
    });
  });
});
