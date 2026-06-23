import { Relation } from './relations';
import { Source } from './types';

export interface TaggedBundle {
  assetCid: string;
  originator: string;
  fiber: string;
  domains: string[];
  relations: Relation[];
}

/**
 * Tag a set of extracted relations with the source's fiber and domain metadata.
 *
 * Produces a TaggedBundle that can be serialised to JSON and later converted
 * into a Knitweb Pulse Fiber bundle. The metadata relations use the same
 * predicates as `knitweb.synaptic.fiber`: `hasFiber` and `hasDomain`.
 */
export function tagBundle(source: Source, relations: Relation[]): TaggedBundle {
  const domainRelations: Relation[] = source.domains.map((domain) => ({
    subject: source.assetCid || source.path,
    predicate: 'hasDomain',
    object: domain,
    weight: 1,
  }));

  const fiberRelation: Relation = {
    subject: source.assetCid || source.path,
    predicate: 'hasFiber',
    object: source.fiber,
    weight: 1,
  };

  return {
    assetCid: source.assetCid || source.path,
    originator: source.originator,
    fiber: source.fiber,
    domains: source.domains,
    relations: [fiberRelation, ...domainRelations, ...relations],
  };
}
