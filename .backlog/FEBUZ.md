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
- **Wat:** `gh pr view 18 --repo febuz/virtualpc`. 6 codebase-gegronde fixes (o.a.
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

## Hoe terug te geven aan de agent
Zet `rm /tmp/claude-stop-autoloop` om de autonome loop te herstarten, of geef
gewoon door wat je in Studio zag (wat wel/niet werkte) — dan pak ik de fixes op.
