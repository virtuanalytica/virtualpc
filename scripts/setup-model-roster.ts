/**
 * Setup program: matches VirtualPC agents to models that fit this machine.
 *
 * Usage:
 *   npm run setup:models
 *
 * It detects resources, lets the user pick a weight class (or accepts auto),
 * writes data/model-router-settings.json, and prints the `lms load` commands
 * needed to get the recommended models.
 */

import * as readline from 'readline';
import {
  WeightClass,
  WEIGHT_CLASSES,
  MODEL_CATALOG,
  detectHostResources,
  generateRoster,
  writeSettings,
  readSettings,
  type HostResources,
} from '../src/model-router';

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

function ask(q: string): Promise<string> {
  return new Promise(resolve => rl.question(q, resolve));
}

function modelLoadCommand(m: typeof MODEL_CATALOG[number]): string {
  if (m.cloudFallback) return `# cloud-only: ${m.cloudFallback}`;
  if (!m.lmStudioLoad) return '# (no load command)';
  return `lms load ${m.lmStudioLoad}`;
}

async function main() {
  console.log('\n=== VirtualPC Model Roster Setup ===\n');

  const resources = detectHostResources();
  const currentSettings = readSettings();

  console.log('Detected resources:');
  console.log(`  Platform      : ${resources.platform}`);
  console.log(`  Total RAM     : ${resources.totalRAMGB} GB`);
  console.log(`  Free RAM      : ${resources.freeRAMGB} GB`);
  console.log(`  Free disk     : ${resources.freeDiskGB} GB`);
  console.log(`  Total VRAM    : ${resources.totalVRAMGB} GB`);
  console.log(`  Free VRAM     : ${resources.freeVRAMGB} GB`);
  console.log(`  CUDA          : ${resources.hasCUDA ? 'yes' : 'no'}`);
  console.log(`  Metal         : ${resources.hasMetal ? 'yes' : 'no'}`);
  console.log(`  CPU cores     : ${resources.cpuCores}`);
  console.log();

  // Auto recommendation
  const auto = generateRoster();
  console.log(`Auto-recommended weight class: ${auto.weightClass} (${WEIGHT_CLASSES[auto.weightClass].label})`);
  console.log(`Simulation by default          : ${auto.simulationByDefault ? 'yes (no local models loaded)' : 'no'}`);
  console.log();

  console.log('Available weight classes:');
  const classes: WeightClass[] = ['featherweight', 'lightweight', 'middleweight', 'heavyweight', 'donkeykongweight'];
  classes.forEach((c, i) => {
    const info = WEIGHT_CLASSES[c];
    const marker = c === auto.weightClass ? ' ← auto' : '';
    console.log(`  ${i + 1}. ${info.label}${marker}`);
    console.log(`     target: ${info.targetDevices}`);
  });
  console.log('  6. keep current settings');
  console.log();

  const choice = (await ask('Pick a class (1-6, Enter = auto): ')).trim();
  let weightClass: WeightClass | undefined;
  if (choice === '1') weightClass = 'featherweight';
  else if (choice === '2') weightClass = 'lightweight';
  else if (choice === '3') weightClass = 'middleweight';
  else if (choice === '4') weightClass = 'heavyweight';
  else if (choice === '5') weightClass = 'donkeykongweight';
  else if (choice === '6') {
    console.log('Keeping current settings:');
    console.log(JSON.stringify(currentSettings, null, 2));
    rl.close();
    return;
  } else {
    weightClass = auto.weightClass;
  }

  // Optional overrides
  const diskOverride = (await ask(`Max disk for models in GB (Enter = ${resources.recommendedMaxDiskGB}): `)).trim();
  const ramOverride = (await ask(`Max RAM for models in GB (Enter = ${resources.recommendedMaxRAMGB}): `)).trim();
  const vramOverride = (await ask(`Max VRAM for models in GB (Enter = ${resources.freeVRAMGB}): `)).trim();
  const allowBig = (await ask('Allow heavyweight/donkeykongweight models? (y/N): ')).trim().toLowerCase();
  const allowCloud = (await ask('Allow cloud fallbacks (Claude/Kimi)? (Y/n): ')).trim().toLowerCase();
  const forceSim = (await ask('Force simulation mode? (y/N): ')).trim().toLowerCase();

  const settings = {
    weightClass,
    maxDiskGB: diskOverride ? parseFloat(diskOverride) : resources.recommendedMaxDiskGB,
    maxRAMGB: ramOverride ? parseFloat(ramOverride) : resources.recommendedMaxRAMGB,
    maxVRAMGB: vramOverride ? parseFloat(vramOverride) : resources.freeVRAMGB,
    allowBigModels: allowBig === 'y' || allowBig === 'yes',
    allowCloud: allowCloud !== 'n' && allowCloud !== 'no',
    forceSimulation: forceSim === 'y' || forceSim === 'yes',
  };

  writeSettings(settings);
  console.log('\nWrote data/model-router-settings.json');

  const roster = generateRoster({ weightClass, allowBigModels: settings.allowBigModels, allowCloud: settings.allowCloud });

  console.log('\n=== Recommended downloads ===');
  if (roster.recommendedDownloads.length === 0) {
    console.log('No local models fit the selected constraints. VirtualPC will simulate responses.');
  } else {
    roster.recommendedDownloads.forEach(m => {
      console.log(`  ${modelLoadCommand(m)}  # ${m.name}, ${m.diskGB} GB`);
    });
  }

  console.log('\n=== Agent → primary model ===');
  roster.roster.slice(0, 10).forEach(e => {
    console.log(`  ${e.agent.padEnd(18)} ${e.primary}`);
  });
  console.log(`  ... and ${roster.roster.length - 10} more`);

  console.log('\nTo refresh the runtime roster without restarting:');
  console.log('  curl -X POST http://localhost:3100/api/health/models/refresh');
  console.log();

  rl.close();
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
