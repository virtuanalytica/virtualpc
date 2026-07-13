#!/usr/bin/env node
/**
 * Genereer een dagelijks management overzicht van VirtualPC + Alexander.
 *
 * Gebruik:
 *   node scripts/generate-daily-management-report.js [uitvoerpad]
 */

import fs from 'node:fs/promises'
import path from 'node:path'

const BASE_URL = process.env.VIRTUALPC_URL || 'http://127.0.0.1:3100'
const outputPath = process.argv[2] || path.join(process.cwd(), 'reports', `daily-management-overview-${new Date().toISOString().slice(0, 10)}.md`)

function fmt (n) {
  return new Intl.NumberFormat('nl-NL').format(n || 0)
}

function fmtHours (min) {
  if (min === undefined || min === null) return '0'
  return (min / 60).toFixed(1)
}

function fmtCost (cost) {
  if (cost === undefined || cost === null) return '€0,00'
  return '€' + Number(cost).toFixed(2).replace('.', ',')
}

async function fetchJson (url) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${url}`)
  return res.json()
}

async function main () {
  const [overview, vitals, terminalCoord] = await Promise.all([
    fetchJson(`${BASE_URL}/api/management/daily-overview`),
    fetchJson(`${BASE_URL}/api/vitals`),
    fetchJson(`${BASE_URL}/api/terminal-coordination`)
  ])

  if (!overview.success) throw new Error('daily-overview faalde')
  const data = overview.overview

  const lines = []
  lines.push(`# Dagelijks Management Overzicht — ${data.date}`)
  lines.push('')
  lines.push(`*Gegenereerd: ${new Date(data.generatedAt).toLocaleString('nl-NL')}*`)
  lines.push('')

  lines.push('## Executive Summary')
  lines.push('')
  lines.push(`- **VirtualPC** heeft vandaag **${fmt(data.virtualPC.callsToday)} LLM calls** gedaan voor **${fmt(data.virtualPC.tokensToday)} tokens** (${fmtCost(data.virtualPC.estimatedCostToday)} geschatte kosten).`)
  lines.push(`- **${fmt(data.virtualPC.tasksCompletedToday)} taken** en **${fmt(data.virtualPC.subtasksCompletedToday)} subtaken** afgerond in **${fmtHours(data.virtualPC.workMinutesToday)} uur** werk.`)
  lines.push(`- **Alexander** draaide **${fmt(data.alexander.callsToday)} calls**, rondde **${fmt(data.alexander.tasksCompletedToday)} taken** af en gebruikte **${fmt(data.alexander.tokensToday)} tokens** (model: ${data.alexander.primaryModel}).`)
  lines.push(`- **Actieve terminals**: ${data.terminalStatuses.filter((t) => t.isActive).length} van ${data.terminalStatuses.length}.`)
  lines.push(`- **Systeem load**: ${vitals.snapshot.load['5']}% (5m gemiddelde), CPU ${vitals.snapshot.cpu_pct}%.`)
  lines.push('')

  lines.push('## VirtualPC Prestaties')
  lines.push('')
  lines.push('| Metric | Waarde |')
  lines.push('|---|---|')
  lines.push(`| Tokens vandaag | ${fmt(data.virtualPC.tokensToday)} |`)
  lines.push(`| Prompt tokens | ${fmt(data.virtualPC.promptTokensToday)} |`)
  lines.push(`| Completion tokens | ${fmt(data.virtualPC.completionTokensToday)} |`)
  lines.push(`| LLM calls | ${fmt(data.virtualPC.callsToday)} |`)
  lines.push(`| Geschatte kosten | ${fmtCost(data.virtualPC.estimatedCostToday)} |`)
  lines.push(`| Werkuren | ${fmtHours(data.virtualPC.workMinutesToday)} uur |`)
  lines.push(`| Work entries | ${fmt(data.virtualPC.workEntriesToday)} |`)
  lines.push(`| Taken afgerond | ${fmt(data.virtualPC.tasksCompletedToday)} |`)
  lines.push(`| Subtaken afgerond | ${fmt(data.virtualPC.subtasksCompletedToday)} |`)
  lines.push(`| Geregistreerde terminalsessies | ${fmt(data.virtualPC.registeredTerminalSessions)} |`)
  lines.push(`| Actieve terminalsessies | ${fmt(data.virtualPC.activeTerminalSessions)} |`)
  lines.push('')

  lines.push('## Alexander Prestaties')
  lines.push('')
  lines.push('| Metric | Waarde |')
  lines.push('|---|---|')
  lines.push(`| Tokens vandaag | ${fmt(data.alexander.tokensToday)} |`)
  lines.push(`| LLM calls | ${fmt(data.alexander.callsToday)} |`)
  lines.push(`| Geschatte kosten | ${fmtCost(data.alexander.estimatedCostToday)} |`)
  lines.push(`| Werkminuten | ${fmt(data.alexander.workMinutesToday)} |`)
  lines.push(`| Taken afgerond | ${fmt(data.alexander.tasksCompletedToday)} |`)
  lines.push(`| Subtaken afgerond | ${fmt(data.alexander.subtasksCompletedToday)} |`)
  lines.push(`| Work entries | ${fmt(data.alexander.workEntriesToday)} |`)
  lines.push(`| Primaire model | ${data.alexander.primaryModel} |`)
  lines.push(`| Tier-1 percentage | ${data.alexander.tier1Pct}% |`)
  lines.push(`| Laatste activiteit | ${new Date(data.alexander.lastActivity).toLocaleString('nl-NL')} |`)
  lines.push('')

  lines.push('## Terminal Sessies')
  lines.push('')
  if (data.terminalStatuses.length === 0 && (!terminalCoord.sessions || terminalCoord.sessions.length === 0)) {
    lines.push('Geen actieve terminal sessies op dit moment.')
  } else {
    lines.push('| Terminal | Agent | Actief | Context tokens | Berichten | Tokens vandaag | Laatste activiteit |')
    lines.push('|---|---|---|---|---|---|---|')
    for (const t of data.terminalStatuses) {
      lines.push(`| ${t.terminal} | ${t.agent} | ${t.isActive ? 'ja' : 'nee'} | ${fmt(t.contextTokens)} | ${fmt(t.messageCount)} | ${fmt(t.tokensToday)} | ${new Date(t.lastActivity).toLocaleString('nl-NL')} |`)
    }
  }
  lines.push('')

  lines.push('## Top Agenten Vandaag')
  lines.push('')
  lines.push('| Agent | Calls | Tokens | Taken | Subtaken | Model |')
  lines.push('|---|---|---|---|---|---|')
  for (const agent of data.topAgentsToday.slice(0, 10)) {
    lines.push(`| ${agent.agent} | ${fmt(agent.callsToday)} | ${fmt(agent.tokensToday)} | ${fmt(agent.tasksCompletedToday)} | ${fmt(agent.subtasksCompletedToday)} | ${agent.primaryModel} |`)
  }
  lines.push('')

  lines.push('## 7-Dagen Trend')
  lines.push('')
  lines.push('| Datum | Tokens | Kosten | Calls |')
  lines.push('|---|---|---|---|')
  for (const day of data.sevenDayTokens) {
    lines.push(`| ${day.date} | ${fmt(day.tokens)} | ${fmtCost(day.cost)} | ${fmt(day.calls)} |`)
  }
  lines.push('')

  lines.push('## Infrastructuur Status')
  lines.push('')
  lines.push('| Service | Status |')
  lines.push('|---|---|')
  lines.push(`| VirtualPC API (:3100) | ${vitals.snapshot?.services?.virtualpc_3100 ? 'online' : 'offline'} |`)
  lines.push(`| Ollama (:11434) | ${vitals.snapshot?.services?.ollama_11434 ? 'online' : 'offline'} |`)
  lines.push(`| GPU enabled | ${vitals.gpu_enabled ? 'ja' : 'nee'} |`)
  lines.push(`| CPU gebruik | ${vitals.snapshot.cpu_pct}% |`)
  lines.push(`| Geheugen gebruik | ${fmt(vitals.snapshot.mem_mb.used)} / ${fmt(vitals.snapshot.mem_mb.total)} MB |`)
  lines.push(`| Schijf root | ${vitals.snapshot.disk.root_used_pct}% gebruikt (${vitals.snapshot.disk.root_free_gb} GB vrij) |`)
  lines.push(`| Schijf EDS2 | ${vitals.snapshot.disk.eds2_used_pct}% gebruikt (${vitals.snapshot.disk.eds2_free_gb} GB vrij) |`)
  lines.push('')

  await fs.mkdir(path.dirname(outputPath), { recursive: true })
  await fs.writeFile(outputPath, lines.join('\n'))
  console.log(`Rapport opgeslagen: ${outputPath}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
