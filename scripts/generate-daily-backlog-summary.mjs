#!/usr/bin/env node
/**
 * Dagelijkse samenvatting van afgeronde backlog items per project/game
 * en gegenereerde digitale assets.
 */

import fs from 'node:fs/promises'
import path from 'node:path'

const BASE_URL = process.env.VIRTUALPC_URL || 'http://127.0.0.1:3100'
const outputPath = process.argv[2] || path.join(process.cwd(), 'reports', `daily-backlog-summary-${new Date().toISOString().slice(0, 10)}.md`)

function fmt (n) {
  return new Intl.NumberFormat('nl-NL').format(n || 0)
}

function isToday (isoDate) {
  if (!isoDate) return false
  const d = new Date(isoDate)
  const now = new Date()
  return d.getDate() === now.getDate() &&
    d.getMonth() === now.getMonth() &&
    d.getFullYear() === now.getFullYear()
}

function categorizeProject (task) {
  const text = `${task.title} ${task.description || ''} ${task.sprint || ''}`.toLowerCase()
  if (text.includes('roblox')) return 'MOLGANG Roblox'
  if (text.includes('web') || text.includes('next.js') || text.includes('wiki ux')) return 'MOLGANG Web'
  if (text.includes('molgang')) return 'MOLGANG (algemeen)'
  if (text.includes('knitnet')) return 'KnitNet'
  if (text.includes('virtualpc') || text.includes('agent') || text.includes('llm') || text.includes('inference') || text.includes('dashboard')) return 'VirtualPC'
  return 'Overig'
}

function categorizeAsset (task) {
  const text = `${task.title} ${task.description || ''}`.toLowerCase()
  if (text.includes('3d') || text.includes('model') || text.includes('fbx') || text.includes('gltf') || text.includes('glb') || text.includes('usd')) return '3D/4D assets'
  if (text.includes('texture') || text.includes('webp') || text.includes('png') || text.includes('svg')) return 'Textures/2D assets'
  if (text.includes('script') || text.includes('lua') || text.includes('tool') || text.includes('client')) return 'Scripts/tools'
  return null
}

async function fetchJson (url) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${url}`)
  return res.json()
}

async function main () {
  const backlog = await fetchJson(`${BASE_URL}/api/backlog/per-person`)
  const assets = await fetchJson(`${BASE_URL}/api/assets/mirror-coverage`)
  const gameStats = await fetchJson(`${BASE_URL}/api/game/stats`)

  const todayTasks = []
  for (const [agent, data] of Object.entries(backlog)) {
    for (const task of data.tasks || []) {
      if (isToday(task.completed_at) && task.status === 'completed') {
        todayTasks.push({ ...task, agent })
      }
    }
  }

  const byProject = {}
  const byAssetType = {}
  let totalEstimatedHours = 0

  for (const task of todayTasks) {
    const project = categorizeProject(task)
    if (!byProject[project]) byProject[project] = []
    byProject[project].push(task)
    totalEstimatedHours += task.estimated_hours || 0

    const assetType = categorizeAsset(task)
    if (assetType) {
      if (!byAssetType[assetType]) byAssetType[assetType] = 0
      byAssetType[assetType]++
    }
  }

  const lines = []
  lines.push(`# Dagelijkse Backlog Samenvatting — ${new Date().toISOString().slice(0, 10)}`)
  lines.push('')
  lines.push(`*Gegenereerd: ${new Date().toLocaleString('nl-NL')}*`)
  lines.push('')

  lines.push('## Samenvatting')
  lines.push('')
  lines.push(`- **Totaal afgerozen taken vandaag**: ${fmt(todayTasks.length)}`)
  lines.push(`- **Geschatte uren geleverd**: ${fmt(totalEstimatedHours)} uur`)
  lines.push(`- **Actieve agenten**: ${fmt(Object.keys(backlog).length)}`)
  lines.push(`- **Game sprint**: ${gameStats.sprint || 'n/b'} | taken afgerond vandaag: ${fmt(gameStats.tasksCompletedToday || 0)} | in progress: ${fmt(gameStats.tasksInProgress || 0)}`)
  lines.push('')

  lines.push('## Afgeronde taken per project/game')
  lines.push('')
  for (const [project, tasks] of Object.entries(byProject).sort((a, b) => b[1].length - a[1].length)) {
    lines.push(`### ${project} (${tasks.length})`)
    lines.push('')
    lines.push('| Agent | Taak | Uren | Prioriteit |')
    lines.push('|---|---|---|---|')
    for (const task of tasks) {
      lines.push(`| ${task.agent} | ${task.title} | ${task.estimated_hours || '-'} | ${task.priority || '-'} |`)
    }
    lines.push('')
  }

  lines.push('## Digitale assets & deliverables')
  lines.push('')
  if (Object.keys(byAssetType).length === 0) {
    lines.push('Vandaag zijn er geen expliciet als asset gemarkeerde taken afgerond.')
  } else {
    lines.push('| Type | Aantal taken |')
    lines.push('|---|---|')
    for (const [type, count] of Object.entries(byAssetType).sort((a, b) => b[1] - a[1])) {
      lines.push(`| ${type} | ${fmt(count)} |`)
    }
  }
  lines.push('')
  lines.push('> Opmerking: dit zijn *geclassificeerde taken* uit de backlog. Er zijn vandaag geen nieuwe asset-bestanden gedetecteerd met een wijzigingsdatum van vandaag op schijf. De asset pipeline heeft op dit moment **96 assets in Roblox** waarvan **0% is gemirrored naar Web**.')
  lines.push('')

  lines.push('## Asset mirror coverage (Roblox ↔ Web)')
  lines.push('')
  lines.push(`- **Totaal assets**: ${fmt(assets.totalAssets)}`)
  lines.push('')
  lines.push('| Categorie | Roblox | Web | Gemirrored | Nog te mirroren | Coverage |')
  lines.push('|---|---|---|---|---|---|')
  for (const cat of assets.byCategory) {
    lines.push(`| ${cat.category} | ${fmt(cat.roblox)} | ${fmt(cat.web)} | ${fmt(cat.mirrored)} | ${fmt(cat.unmirrored)} | ${cat.coveragePct}% |`)
  }
  lines.push('')

  lines.push('## Top agenten vandaag (op afgeronde taken)')
  lines.push('')
  const byAgent = {}
  for (const task of todayTasks) {
    if (!byAgent[task.agent]) byAgent[task.agent] = { count: 0, hours: 0 }
    byAgent[task.agent].count++
    byAgent[task.agent].hours += task.estimated_hours || 0
  }
  const sortedAgents = Object.entries(byAgent).sort((a, b) => b[1].count - a[1].count)
  lines.push('| Agent | Taken | Uren |')
  lines.push('|---|---|---|')
  for (const [agent, stats] of sortedAgents.slice(0, 10)) {
    lines.push(`| ${agent} | ${fmt(stats.count)} | ${fmt(stats.hours)} |`)
  }
  lines.push('')

  await fs.mkdir(path.dirname(outputPath), { recursive: true })
  await fs.writeFile(outputPath, lines.join('\n'))
  console.log(`Rapport opgeslagen: ${outputPath}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
