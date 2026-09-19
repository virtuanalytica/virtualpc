import fs from 'node:fs';
import path from 'node:path';

const virtualPcRoot = path.resolve(__dirname, '../..');
const molgangRoot = process.env.MOLGANG_ROOT || '/media/knight2/EDS2/projects/molgang-web';

describe('MOLGANG four-tier polyglot contracts', () => {
  it('documents all four tiers and their persistence boundary', () => {
    const document = fs.readFileSync(path.join(virtualPcRoot, '.backlog/FOUR-TIER-POLYGLOT-MOLGANG.md'), 'utf8');
    for (const tier of ['Tier 1 — Presentation', 'Tier 2 — Gateway', 'Tier 3 — Application', 'Tier 4 — Polyglot persistence']) {
      expect(document).toContain(tier);
    }
    for (const contract of ['AssetManifest', 'GameEvent', 'TaskExport', 'AgentTask']) {
      expect(document).toContain(`- \`${contract}\``);
    }
    expect(document).toContain('virtualpc.export.v1');
    expect(document).toContain('Ethereum is the settlement/provenance anchor');
  });

  const roleContractPath = path.join(molgangRoot, 'shared/agent-review-contracts.json');
const roleContractAvailable = fs.existsSync(roleContractPath);
  (roleContractAvailable ? it : it.skip)('requires data, LLM and agent engineer ownership plus evidence', () => {
    const contract = JSON.parse(fs.readFileSync(roleContractPath, 'utf8'));
    expect(contract.version).toBe(1);
    for (const role of ['data-engineer', 'llm-engineer', 'agent-engineer']) {
      const definition = contract.roles.find((candidate: { id: string }) => candidate.id === role);
      expect(definition).toBeDefined();
      expect(definition.ownerAgent).toBeTruthy();
      expect(definition.requiredEvidence.length).toBeGreaterThan(0);
    }
  });
});
