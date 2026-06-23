import { tagBundle } from '../../../src/ingest/tagger';
import { Relation } from '../../../src/ingest/relations';
import { Source, SourceFormat } from '../../../src/ingest/types';

function makeSource(): Source {
  return {
    path: '/corpus/dama/ch1.txt',
    format: SourceFormat.TXT,
    fiber: 'data',
    domains: ['governance', 'quality'],
    assetCid: 'source:/corpus/dama/ch1.txt',
    originator: 'test',
  };
}

describe('tagBundle', () => {
  it('prepends hasFiber and hasDomain relations', () => {
    const relations: Relation[] = [
      { subject: 'dama', predicate: 'is-a', object: 'guide', weight: 1 },
    ];
    const bundle = tagBundle(makeSource(), relations);
    expect(bundle.fiber).toBe('data');
    expect(bundle.domains).toEqual(['governance', 'quality']);
    expect(bundle.relations[0]).toEqual({
      subject: 'source:/corpus/dama/ch1.txt',
      predicate: 'hasFiber',
      object: 'data',
      weight: 1,
    });
    expect(bundle.relations[1]).toEqual({
      subject: 'source:/corpus/dama/ch1.txt',
      predicate: 'hasDomain',
      object: 'governance',
      weight: 1,
    });
    expect(bundle.relations[2]).toEqual({
      subject: 'source:/corpus/dama/ch1.txt',
      predicate: 'hasDomain',
      object: 'quality',
      weight: 1,
    });
    expect(bundle.relations[3]).toEqual(relations[0]);
  });
});
