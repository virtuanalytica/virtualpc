# FEBUZ — tickets voor een mens (Edwin) 🧑‍🔧

> Deze tickets kan de agent **niet** headless oplossen — ze vragen een mens:
> Roblox Studio openen en kijken, visueel beoordelen, of een PR reviewen/mergen.
> De agent heeft de logica al bewezen (headless tests groen); wat hier staat is
> precies het stuk dat jouw ogen / oordeel nodig heeft.
>
> Aangemaakt 2026-06-04 door de coding-agent. Status-detail per onderwerp:
> molgang → `~/molgang-roblox/docs/INTEGRATION_AUDIT_2026_06.md`.

---

## 🎮 MOLGANG — Studio-pass (visueel, kan alleen een mens)

De levende economie + campagne is gebouwd en de **logica is bewezen** (86 headless
checks, `lune run scripts/verify_economy.luau` + `verify_missions.luau`). Maar
niets hiervan is ooit *gerenderd*. Dit is dé openstaande "werkt het echt"-vraag.

### FB-M1 — Speel de levende economie één keer in Studio  ⭐ hoogste prioriteit
- **Wat:** `cd ~/molgang-roblox && rojo serve` → verbind Roblox Studio → Play.
  Doe een slag-leach in **West**. Verwacht: een gekleurde carrier-puck glijdt over
  de brug naar een fertilizer-plot in **Noord** die zelf Ca bestelde → plot maakt
  fertilizer ("♻ From recovered slag!") → overschot verkoopt in **Centrum**.
- **Waarom mens:** ik kan Studio niet draaien; puck-glide / anchors / remotes zijn
  alleen live te zien.
- **Klaar wanneer:** je één volledige keten West→Noord→Centrum hebt zien stromen.
  Werkt het niet → noteer wát (geen puck / verkeerde plek / geen fertilizer) en
  geef het aan de agent; dan fix ik het meteen.

### FB-M2 — Controleer de 3 nieuwe regio's (geometrie)
- **Wat:** kijk of **Zuid** (Regeneration Gardens), **Diep** (Deep Slag Quarry) en
  **Haven** (Trade Harbour) goed in de wereld staan — niet overlappend, bereikbaar,
  niet ergens in het luchtledige. Coördinaten staan in
  `game/src/ServerScriptService/Core/WorldBuilder.server.lua` (buildRegion).
- **Waarom mens:** ik koos de coördinaten "ruim buiten" de bestaande zones, maar
  kan niet zien of ze kloppen.
- **Klaar wanneer:** de 3 regio's zichtbaar + bereikbaar zijn (of je geeft door
  welke coördinaten aangepast moeten).

### FB-M3 — Controleer de 3 UI-panelen
- **Wat:** in Studio toets **J** (Economy HUD: productiviteit + stewardship-rating),
  **M** (Mission Tracker: briefing + objectives), **N** (Scenario Board: 9
  challenges met sterren). Kijk of ze renderen en updaten.
- **Waarom mens:** UI's zijn parse-clean maar nooit gerenderd.
- **Klaar wanneer:** de 3 panelen tonen en meebewegen met je voortgang.

### FB-M4 — (later) Vul Zuid/Diep/Haven met interactables
- **Wat:** de 3 nieuwe regio's zijn nu sfeer-platforms zonder dingen om te doen.
  Ontwerp wat er per regio te doen is (bv. Diep = waar je slag mijnt, Zuid = waar
  gewassen groeien op je fertilizer, Haven = uitgebreide markt).
- **Waarom mens:** dit is game-design + Studio-plaatsing.
- **Klaar wanneer:** elke nieuwe regio minstens één interactie heeft.

---

## 🔐 VIRTUALPC — PR-review & operationeel (menselijk oordeel)

### FB-V1 — Review + merge PR #18 (security/stability)
- **Wat:** `gh pr view 18 --repo knitweb/virtualpc`. 6 codebase-gegronde fixes (o.a.
  de 196 MB `task-state.json` workLog-cap, credential-encryptie #31,
  path-traversal guard). Alles `tsc` clean, 2 unit-test suites.
- **Waarom mens:** mergen naar een live repo is jouw beslissing.
- **Klaar wanneer:** gereviewd en gemerged (of feedback gegeven).

### FB-V2 — Review + merge PR #19 (P1 security hardening), daarna retargeten
- **Wat:** stacked op #18. Security headers + rate limiter + write-auth, met
  recon→design→adversarial-verify (een 9-agent panel ving 3 kritieke bugs vóór
  merge). Na merge van #18: PR #19 **retargeten naar master** en mergen.
- **Waarom mens:** review + merge-volgorde is jouw call.
- **Klaar wanneer:** #18 gemerged, #19 geretarget + gemerged.

### FB-V3 — Herstart de virtualpc-service voor de workLog-cap
- **Wat:** de 196 MB `task-state.json` krimpt pas na een rebuild + herstart (de cap
  schrijft dan een getrimde snapshot). Doe dit op een rustig moment.
- **Waarom mens:** een live service herstarten is een operationele beslissing.
- **Klaar wanneer:** service herstart; `task-state.json` weer klein.

### FB-V4 — Beslis over de strengere security-gates (na logs kijken)
- **Wat:** drie gates staan bewust **veilig/uit** by default:
  `ENFORCE_STRICT_SECURITY` (COEP/strikte CSP), `INTERNAL_WRITE_ENFORCE` (auth op
  write-endpoints), en de rate-limiter (`RATE_LIMIT_ENABLED`). Aanrader: eerst de
  `[internal-write-auth]` warn-logs lezen om te bevestigen dat alle callers lokaal
  zijn, dán `INTERNAL_WRITE_ENFORCE=true` zetten.
- **Waarom mens:** dit verandert live gedrag; jouw risico-afweging.
- **Klaar wanneer:** je per gate hebt besloten aan/uit + (indien aan) getest.

---

## 🤖 VIRTUANALYTICA / VIRTUALPC DEMO — Agent Army & Certification

> Hardware-context: agent army draait op een server (2× Xeon Platinum 8276L,
> 6 TB RAM, 2× RTX 3090 NVLinked). MacBook Air 2023 dient als afstandsbediening
> / monitor. Publieke repo naam: **VirtualPC Demo**; "VirtuAnalytica" blijft
> alleen in lokale `/Admin/...` planning.

### FB-VA1 — Merge goedgekeurde knitweb/pulse PR's ⭐ hoogste prioriteit
- **Wat:** PR's #248 (Lens), #249 (POUW quorum), #251 (migratieplan generator),
  #263 (fiber taxonomy) hebben allemaal LGTM/febuz-goedkeuring. Wacht op
  merge door Claude/maintainer.
- **Waarom mens:** jij/Claude mergen naar live repo.
- **Klaar wanneer:** 4 PR's gemerged in `Knitweb/pulse:main`.

### FB-VA2 — Beslis over virtualpc PR #13
- **Wat:** cleanup PR voor VirtuAnalytica-referenties heeft nu zware merge-conflicts
  met `master`. De legacy bestanden (`public/virtuanalytica.html`,
  `scripts/verify-virtuanalytica.ts`) zijn al verwijderd op `master`.
- **Optie A (aanbevolen):** sluit PR #13 en laat een schone, gefocusede PR maken
  als er nog demo-features uit moeten.
- **Optie B:** geef groen licht om de conflicts in PR #13 handmatig op te lossen.
- **Klaar wanneer:** PR #13 gesloten óf gemerged.

### FB-VA3 — Phase 2: Body of Knowledge ingestion pipeline
- **Wat:** bouw een bulk-ingestie-pijplijn voor de agent army. Eerste bronnen:
  DAMA-DMBOK (data), PubChem subset (chem), ArXiv abstracts (academic),
  RationalWiki/Skeptoid (pseudo). Output: Fiber bundles met `hasFiber` /
  `hasDomain` relaties.
- **Waarom agent:** dit is puur code + data; kan headless.
- **Klaar wanneer:** `python tools/bulk_ingest.py --source-dir ...` produceert
  getagde bundles die in Lens/Web ingelezen kunnen worden.

### FB-VA4 — Agent-orchestrator voor server-deploy
- **Wat:** ontwerp + implementeer een orchestrator die specialist-agents op de
  Xeon/3090-server start, beheert, en via HTTP/P2P vanaf de MacBook Air
  aanstuurt. Per agent: rol (data/chem/academic/pseudo), LLM-endpoint, fiber-tag.
- **Waarom agent:** architectuur + code; headless op te bouwen.
- **Klaar wanneer:** orchestrator draait op server en MacBook kan status zien.

### FB-VA5 — DAMA-DMBOK certificatie-test generator
- **Wat:** genereer Q&A's uit geïngesteerde triples; laat agents toetsen;
  sla geslaagde certificaten op als `certification`-fiber bundles.
- **Waarom agent:** code + regels; kan headless.
- **Klaar wanneer:** een agent kan slagen voor een CDMP-achtige test en het
  certificaat is opgeslagen in de fabric.

### FB-VA6 — "Last Humanity Test" A/B demo
- **Wat:** twee identieke modellen beantwoorden dezelfde moeilijke vragen;
  één met Knitweb Pulse + Lens (+ optioneel P2P), één zonder. Dashboard toont
  correctheid, provenance en confidence.
- **Waarom agent:** code + UI; kan headless gebouwd worden.
- **Klaar wanneer:** demo draait en laat zien dat Lens-gebruik de scores
  verbetert.

---

## Hoe terug te geven aan de agent
Zet `rm /tmp/claude-stop-autoloop` om de autonome loop te herstarten, of geef
gewoon door wat je in Studio zag (wat wel/niet werkte) — dan pak ik de fixes op.
