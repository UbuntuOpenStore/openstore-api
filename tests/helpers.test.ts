import { expect } from './helper';
import { getData, getDataArray, getDataBoolean } from '../src/utils';

describe('Helpers', () => {
  context('getData', () => {
    it('gets trimmed data from the query', () => {
      expect(getData({ query: { foo: ' bar ' } } as any, 'foo')).to.equal('bar');
    });

    it('gets trimmed data from the body', () => {
      expect(getData({ body: { foo: ' bar ' } } as any, 'foo')).to.equal('bar');
    });

    it('returns the default', () => {
      expect(getData({} as any, 'foo', 'default')).to.equal('default');
    });
  });

  context('getDataArray', () => {
    it('gets array data from the query', () => {
      expect(getDataArray({ query: { foo: ['bar', 'baz'] } } as any, 'foo')).to.deep.equal(['bar', 'baz']);
    });

    it('gets csv data from the query', () => {
      expect(getDataArray({ query: { foo: 'bar,baz' } } as any, 'foo')).to.deep.equal(['bar', 'baz']);
    });

    it('gets array data from the body', () => {
      expect(getDataArray({ body: { foo: ['bar', 'baz'] } } as any, 'foo')).to.deep.equal(['bar', 'baz']);
    });

    it('gets csv data from the body', () => {
      expect(getDataArray({ body: { foo: 'bar,baz' } } as any, 'foo')).to.deep.equal(['bar', 'baz']);
    });

    it('returns the default', () => {
      expect(getDataArray({} as any, 'foo', ['default'])).to.deep.equal(['default']);
    });
  });

  context('getDataBoolean', () => {
    it('gets boolean string data from the query', () => {
      expect(getDataBoolean({ query: { foo: 'true' } } as any, 'foo')).to.be.true;
      expect(getDataBoolean({ query: { foo: 'false' } } as any, 'foo')).to.be.false;
    });

    it('gets boolean data from the query', () => {
      expect(getDataBoolean({ query: { foo: true } } as any, 'foo')).to.be.true;
    });

    it('gets boolean string data from the body', () => {
      expect(getDataBoolean({ body: { foo: 'true' } } as any, 'foo')).to.be.true;
      expect(getDataBoolean({ body: { foo: 'false' } } as any, 'foo')).to.be.false;
    });

    it('gets boolean data from the body', () => {
      expect(getDataBoolean({ body: { foo: true } } as any, 'foo')).to.be.true;
    });

    it('returns the default', () => {
      expect(getDataBoolean({} as any, 'foo', true)).to.be.true;
    });
  });
});
