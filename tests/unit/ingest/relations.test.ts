import {
  extractRelations,
  splitSentences,
} from '../../../src/ingest/relations';

describe('splitSentences', () => {
  it('splits on periods', () => {
    const text = 'First sentence. Second sentence. Third one!';
    expect(splitSentences(text)).toEqual([
      'First sentence.',
      'Second sentence.',
      'Third one!',
    ]);
  });

  it('handles common abbreviations', () => {
    const text = 'Dr. Smith is a researcher. He works here.';
    expect(splitSentences(text)).toEqual([
      'Dr. Smith is a researcher.',
      'He works here.',
    ]);
  });
});

describe('extractRelations', () => {
  it('extracts is-a relations', () => {
    const text = 'DAMA-DMBOK is a guide. Data governance is a discipline.';
    const rels = extractRelations(text);
    expect(rels).toContainEqual({
      subject: 'dama-dmbok',
      predicate: 'is-a',
      object: 'guide',
      weight: 1,
    });
    expect(rels).toContainEqual({
      subject: 'data governance',
      predicate: 'is-a',
      object: 'discipline',
      weight: 1,
    });
  });

  it('extracts has relations', () => {
    const text = 'A database has tables.';
    const rels = extractRelations(text);
    expect(rels).toContainEqual({
      subject: 'database',
      predicate: 'has',
      object: 'tables',
      weight: 1,
    });
  });

  it('extracts is-part-of relations', () => {
    const text = 'A column is part of a table.';
    const rels = extractRelations(text);
    expect(rels).toContainEqual({
      subject: 'column',
      predicate: 'is-part-of',
      object: 'table',
      weight: 1,
    });
  });

  it('deduplicates identical relations', () => {
    const text = 'Water is a compound. Water is a compound.';
    const rels = extractRelations(text);
    expect(rels.filter((r) => r.subject === 'water')).toHaveLength(1);
  });

  it('skips stop-word-only terms', () => {
    const text = 'It is a thing.';
    const rels = extractRelations(text);
    expect(rels).toHaveLength(0);
  });
});
