# Familie-kennisgraaf — Roblox

De Familie-graaf, beschikbaar in Roblox (en Roblox-VR op de Meta Quest 3S).

Roblox-cloudservers kunnen `localhost:3100` niet bereiken, dus we bakken een
**snapshot** in als ModuleScript en bouwen die in 3D op. Privé: een Roblox-place
is standaard alleen voor jou zichtbaar tot je 'm publiceert.

## Genereren + syncen

```bash
# 1. Exporteer de live graaf naar een Luau-snapshot
python3 scripts/export-family-roblox.py        # → src/ReplicatedStorage/FamilieGraphData.luau

# 2. Sync in Roblox Studio met Rojo
cd roblox/familie-graph
rojo serve                                      # verbind vanuit Studio (Rojo-plugin)
```

In Studio: druk **Play**. `FamilieGraphBuilder` bouwt de graaf in de Workspace —
neon-bollen per object (kleur = categorie), naamlabels, dunne staven als relaties,
geclusterd per categorie. Zwaartekracht staat op 0 zodat je er vrij doorheen vliegt.

## VR (Quest 3S)

Roblox ondersteunt VR native. Start de place via de Roblox-app op de Quest (of
Quest Link) — de 3D-graaf is dan immersief te bekijken. Bijwerken doe je via het
webportaal (`/family-portal.html`); herhaal daarna stap 1+2 om de snapshot te
verversen.

## Bestanden

| Bestand | Rol |
|---|---|
| `default.project.json` | Rojo-mapping (ReplicatedStorage + ServerScriptService) |
| `src/ReplicatedStorage/FamilieGraphData.luau` | Auto-gegenereerde snapshot (nodes/links) |
| `src/ServerScriptService/FamilieGraphBuilder.server.luau` | Renderer (bouwt de 3D-graaf) |
