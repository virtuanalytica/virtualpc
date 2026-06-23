import { createAgent, certifyAgent } from '../../../src/agent-army/agent';
import { Relation } from '../../../src/ingest/relations';

describe('createAgent', () => {
  it('creates an agent with a known role', () => {
    const agent = createAgent({
      did: 'did:agent:1',
      name: 'Gov-1',
      roleId: 'data-governance-analyst',
    });
    expect(agent.name).toBe('Gov-1');
    expect(agent.role.fiber).toBe('data');
    expect(agent.role.domains).toContain('governance');
    expect(agent.certificates).toEqual([]);
  });

  it('throws for an unknown role', () => {
    expect(() =>
      createAgent({ did: 'did:agent:2', name: 'X', roleId: 'wizard' }),
    ).toThrow('unknown agent role: wizard');
  });
});

describe('certifyAgent', () => {
  it('passes a certification and stores a certificate', () => {
    const relations: Relation[] = [
      { subject: 'policy', predicate: 'is-a', object: 'rule', weight: 1 },
      { subject: 'policy', predicate: 'defines', object: 'behaviour', weight: 1 },
    ];
    const agent = createAgent({
      did: 'did:agent:3',
      name: 'Gov-3',
      roleId: 'data-governance-analyst',
    });
    const result = certifyAgent(agent, relations, 10);
    expect(result.passed).toBe(true);
    expect(agent.certificates.length).toBe(1);
    expect(agent.certificates[0].fiber).toBe('data');
  });
});
