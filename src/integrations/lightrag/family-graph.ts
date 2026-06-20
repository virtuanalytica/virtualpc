/**
 * Familie knowledge graph — een aparte, *verbergbare* kennisgraaf binnen de
 * gitnexus/LightRAG/Neo4j familie van grafen (naast Asset, Governance, Wiki,
 * Corpus, Codegraph).
 *
 * Doel
 * ----
 * Eén benoemde graaf ("Familie") die de privé/holding-structuur modelleert:
 * personen, bedrijven (B.V./VOF/holdings), hardware, software/OS, diensten,
 * projecten, winning-trajecten, materialen en game-engines. Omdat dit
 * gevoelige (familie/holding) data is, is de hele graaf met één toggle te
 * **verbergen** — de 3D-viewer en API geven dan niets terug.
 *
 * Scheiding van de andere grafen
 * ------------------------------
 *   - Alle knopen krijgen het label `:Familie` *plus* een type-label
 *     (`:Persoon`, `:Bedrijf`, ...). Daardoor raakt deze graaf nooit de
 *     bestaande Asset/Corpus/Node-grafen en kun je 'm los queryen/wissen.
 *   - Elke knoop heeft `graph: 'Familie'` zodat een platte query op property
 *     ook werkt.
 *   - De zichtbaarheid (`hidden`) staat zowel als property op elke knoop als
 *     in `data/family-graph-visibility.json`, zodat de toggle een Neo4j-herstart
 *     overleeft en de viewer 'm zonder DB kan uitlezen.
 *
 * Eerlijkheid over data
 * ---------------------
 * Conform de huisregel "nooit synthetische data": de enige *feiten* die we
 * vastleggen zijn (a) dat een object bestaat en (b) zijn type/categorie — dat
 * zijn precies de objecten die de gebruiker heeft opgegeven. Categorie-randen
 * zijn puur organisatorisch (radiale structuur voor de 3D-weergave). De enkele
 * semantische randen die we leggen (product → winning, studio → engine,
 * dienst → platform, workstation → OS) zijn 1-op-1 uit de namen zelf af te
 * leiden en worden gemarkeerd met `inferred: true`. We verzinnen géén
 * familierelaties of bedrijfs-eigendom waarvoor we geen bewijs hebben.
 *
 * Idempotent: MERGE op elke knoop/rand. Veilig om te herhalen. Bij offline
 * LightRAG (Neo4j onbereikbaar) noopt alles netjes — zelfde graceful-degradation
 * als de rest van de LightRAG-integratie.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as crypto from 'crypto';
import { exec } from 'child_process';
import logger from '../../utils/logger';
import type { LightRAGClient } from './client';

export const FAMILY_GRAPH_NAME = 'Familie';

const VISIBILITY_FILE = path.resolve(__dirname, '..', '..', '..', 'data', 'family-graph-visibility.json');

/** Categorie-taxonomie (Nederlandse labels) → Neo4j type-label + 3D groep-id. */
interface Category {
  /** Nederlandse weergavenaam van de categorie (hub-knoop). */
  label: string;
  /** Neo4j-label dat elk object in deze categorie krijgt. */
  nodeLabel: string;
  /** Numerieke groep voor kleur-clustering in de 3D-viewer. */
  group: number;
}

const CATEGORIES: Record<string, Category> = {
  persoon:   { label: 'Personen',        nodeLabel: 'Persoon',   group: 1 },
  bedrijf:   { label: 'Bedrijven',       nodeLabel: 'Bedrijf',   group: 2 },
  hardware:  { label: 'Hardware',        nodeLabel: 'Hardware',  group: 3 },
  software:  { label: 'Software / OS',   nodeLabel: 'Software',  group: 4 },
  dienst:    { label: 'Diensten',        nodeLabel: 'Dienst',    group: 5 },
  project:   { label: 'Projecten',       nodeLabel: 'Project',   group: 6 },
  winning:   { label: 'Winning',         nodeLabel: 'Winning',   group: 7 },
  materiaal: { label: 'Materialen',      nodeLabel: 'Materiaal', group: 8 },
  engine:    { label: 'Game-engines',    nodeLabel: 'Engine',    group: 9 },
  tool:      { label: 'Studio / Tools',  nodeLabel: 'Tool',      group: 10 },
  // Categorieën uit de chat-extractie (getagd source='chat'); toggle-baar.
  locatie:    { label: 'Locaties',     nodeLabel: 'Locatie',    group: 11 },
  activiteit: { label: 'Activiteiten', nodeLabel: 'Activiteit', group: 12 },
  onderwerp:  { label: 'Onderwerpen',  nodeLabel: 'Onderwerp',  group: 13 },
  chat:       { label: 'Chats',        nodeLabel: 'Chat',       group: 14 },
  // Molgang-game (source='molgang'): fictieve personages mogen; locaties zijn
  // UITSLUITEND echte plaatsen (categorie 'locatie') voor latere AR. Game-zones
  // zijn game-layout, bewust NIET als 'locatie' getagd.
  personage:  { label: 'Personages (Molgang)', nodeLabel: 'Personage', group: 15 },
  gamezone:   { label: 'Game-zones (Molgang)', nodeLabel: 'GameZone',  group: 16 },
  // Chemie/fysica — staalslak-valorisatie (source='chem'), trilinguaal gelabeld.
  element:    { label: 'Elementen',    nodeLabel: 'Element',    group: 17 },
  verbinding: { label: 'Verbindingen', nodeLabel: 'Verbinding', group: 18 },
  fase:       { label: 'Fasen',        nodeLabel: 'Fase',       group: 19 },
  reactie:    { label: 'Reacties',     nodeLabel: 'Reactie',    group: 20 },
  proces:     { label: 'Processen',    nodeLabel: 'Proces',     group: 21 },
  parameter:  { label: 'Parameters',   nodeLabel: 'Parameter',  group: 22 },
};

interface Entity {
  /** Weergavenaam (exact zoals door gebruiker opgegeven). */
  name: string;
  /** Sleutel in CATEGORIES. */
  cat: keyof typeof CATEGORIES;
  /** Optionele korte omschrijving voor de tooltip in de viewer. */
  note?: string;
}

/**
 * Alle door de gebruiker opgegeven objecten. Volgorde = invoervolgorde van het
 * verzoek (kern-familie/holding objecten eerst, daarna de project/3D-objecten).
 */
const ENTITIES: Entity[] = [
  // --- Kern: personen -------------------------------------------------------
  { name: 'Vanya', cat: 'persoon' },
  { name: 'Edwin', cat: 'persoon' },
  { name: 'Archie', cat: 'persoon' },
  { name: 'Lea', cat: 'persoon' },
  { name: 'Adrie', cat: 'persoon' },
  { name: 'Gonny', cat: 'persoon' },
  { name: 'Karin', cat: 'persoon' },
  { name: 'X.Wu', cat: 'persoon', note: '51% meerderheidsaandeelhouder Slag B.V. (nieuwe situatie)' },
  { name: 'Diederik Fierig', cat: 'persoon', note: 'metallurg, 50/50 vennoot Slakkenspoor VOF' },
  { name: 'Witteveen', cat: 'persoon', note: 'bestuurder Uniforce Group B.V. (mede-gedaagde)' },

  // --- Kern: bedrijven (holdings / B.V. / VOF) ------------------------------
  { name: 'VirtualV Holding B.V.',     cat: 'bedrijf', note: 'Holding' },
  { name: 'EHMAC B.V.',                cat: 'bedrijf' },
  { name: 'SLAG B.V.',                 cat: 'bedrijf' },
  { name: 'VirtualPC VOF',             cat: 'bedrijf', note: 'VOF' },
  { name: "Zack's Holding B.V.",       cat: 'bedrijf', note: 'Holding' },
  { name: "Zack's Consultancy B.V.",   cat: 'bedrijf' },
  { name: 'Uniforce Group B.V.',       cat: 'bedrijf' },
  { name: 'Slakkenspoor VOF',          cat: 'bedrijf', note: 'R&D-vehikel SmartSlag3 (50/50 Edwin/Diederik Fierig)' },
  { name: 'Tata Steel IJmuiden',       cat: 'bedrijf', note: 'leverancier BOF-staalslak' },
  { name: 'Magnit',                    cat: 'bedrijf', note: 'detacheringsbureau (contract data steward)' },

  // --- Kern: hardware -------------------------------------------------------
  { name: 'GPU Server 1', cat: 'hardware', note: '2×3090 ML/Ollama server' },

  // --- Kern: software / OS --------------------------------------------------
  { name: 'Python',            cat: 'software' },
  { name: 'Ubuntu',            cat: 'software', note: 'Linux OS' },
  { name: 'Microsoft Windows', cat: 'software', note: 'OS' },

  // --- Kern: diensten -------------------------------------------------------
  { name: 'Google',       cat: 'dienst' },
  { name: 'Google Drive', cat: 'dienst' },
  { name: 'Google Mail',  cat: 'dienst' },
  { name: 'Transip',      cat: 'dienst' },
  { name: 'Transip Mail', cat: 'dienst' },

  // --- 3D-vulling: projecten ------------------------------------------------
  { name: 'SmartSlag3', cat: 'project' },
  { name: 'VANECO',     cat: 'project' },
  { name: 'SlagBox',    cat: 'project' },
  { name: 'MOLGANG',    cat: 'project', note: 'Chemical Engineering game' },

  // --- 3D-vulling: winning-trajecten ----------------------------------------
  { name: 'Vanadium winning', cat: 'winning' },
  { name: 'Silicium winning', cat: 'winning' },
  { name: 'Calcium winning',  cat: 'winning' },
  { name: 'Titanium winning', cat: 'winning' },
  { name: 'Fosfor winning',   cat: 'winning' },
  { name: 'Ijzer winning',    cat: 'winning' },

  // --- 3D-vulling: materialen / producten -----------------------------------
  { name: 'Vanadium elektrolyt', cat: 'materiaal' },
  { name: 'Vanadium ijzer',      cat: 'materiaal' },
  { name: 'Vanadium baar',       cat: 'materiaal' },

  // --- 3D-vulling: game-engines ---------------------------------------------
  { name: 'Roblox', cat: 'engine' },
  { name: 'Unreal', cat: 'engine' },
  { name: 'GoDot',  cat: 'engine' },

  // --- 3D-vulling: studio's / tools -----------------------------------------
  { name: 'Roblox Studio', cat: 'tool' },
  { name: 'Unreal Studio', cat: 'tool' },
  { name: 'GoDot Studio',  cat: 'tool' },

  // --- 3D-vulling: extra hardware / devices ---------------------------------
  { name: 'Laptop macbook air 2023', cat: 'hardware' },
  { name: 'Laptop Dell',             cat: 'hardware' },
  { name: 'APG',                     cat: 'hardware' },
  { name: 'Windows Workstation',     cat: 'hardware' },
  { name: 'Ubuntu Workstation',      cat: 'hardware' },
  { name: 'Optane nvram',            cat: 'hardware' },
  { name: 'Intel SSD 750',           cat: 'hardware' },
  { name: 'Smartphone Samsung Z-fold 5', cat: 'hardware' },
];

/**
 * Semantische randen die rechtstreeks uit de objectnamen volgen (geen
 * verzonnen feiten). Gemarkeerd `inferred` zodat consumenten weten dat dit
 * naam-afleidingen zijn, geen geverifieerde claims.
 *   TOOL_VOOR    : studio/editor hoort bij een engine
 *   DIENST_VAN   : sub-dienst hoort bij een platform
 *   DRAAIT_OP    : workstation draait een OS
 * (De Vanadium product→winning randen stonden hier eerder als naam-afleiding;
 *  ze zijn nu opgenomen in VERIFIED_EDGES met bron-bewijs uit de werkcontext.)
 */
interface SemanticEdge { from: string; to: string; rel: string; }
const SEMANTIC_EDGES: SemanticEdge[] = [
  // Studio → engine
  { from: 'Roblox Studio', to: 'Roblox', rel: 'TOOL_VOOR' },
  { from: 'Unreal Studio', to: 'Unreal', rel: 'TOOL_VOOR' },
  { from: 'GoDot Studio',  to: 'GoDot',  rel: 'TOOL_VOOR' },
  // Sub-dienst → platform
  { from: 'Google Drive', to: 'Google',  rel: 'DIENST_VAN' },
  { from: 'Google Mail',  to: 'Google',  rel: 'DIENST_VAN' },
  { from: 'Transip Mail', to: 'Transip', rel: 'DIENST_VAN' },
  // Workstation → OS
  { from: 'Ubuntu Workstation',  to: 'Ubuntu',            rel: 'DRAAIT_OP' },
  { from: 'Windows Workstation', to: 'Microsoft Windows', rel: 'DRAAIT_OP' },
];

/**
 * Geverifieerde randen uit de werkcontext (door de gebruiker aangeleverd).
 * Elke rand is adversarieel "geground" tegen de brontekst: alleen relaties die
 * de context écht ondersteunt zijn opgenomen. `confidence`:
 *   'stated'   — expliciet in de context vermeld
 *   'inferred' — redelijke afleiding uit de bewoording
 * `evidence` bewaart de bron-frase op de Neo4j-relatie zodat de claim
 * herleidbaar is. Géén familie-relaties of eigendom zonder bewijs (twee
 * speculatieve randen — Optane→GPU Server 1 en Edwin→MOLGANG — zijn bewust
 * afgewezen tijdens verificatie).
 */
interface VerifiedEdge {
  from: string; to: string; rel: string;
  confidence: 'stated' | 'inferred'; evidence: string;
  /** Aandeel-percentage als string (bv '51%') — zet r.aandeel + r.meerderheid. */
  share?: string;
  /** Open punt dat herziening vraagt — zet r.review zodat de tensie in-graph zichtbaar is. */
  review?: string;
}
const VERIFIED_EDGES: VerifiedEdge[] = [
  // Edwin ↔ holding / bedrijven
  { from: 'Edwin', to: 'VirtualV Holding B.V.', rel: 'CEO_VAN',       confidence: 'stated',   evidence: 'Edwin Hauwert is CEO/founder of VirtualV Holding B.V.' },
  { from: 'Edwin', to: 'VirtualV Holding B.V.', rel: 'OPRICHTER_VAN', confidence: 'stated',   evidence: 'Edwin Hauwert is CEO/founder of VirtualV Holding B.V.' },
  { from: 'Edwin', to: 'Uniforce Group B.V.',   rel: 'GESCHIL_MET',   confidence: 'stated',   evidence: 'Edwin pursues a civil lawsuit (dagvaarding) against Uniforce Group B.V.' },
  // NB: 'Edwin -CONTROLEERT-> SLAG B.V.' (was inferred) is bewust vervallen —
  // in de nieuwe situatie krijgt X.Wu 51% (meerderheid), dus Edwin heeft geen
  // zeggenschapsmeerderheid meer.
  // Nieuwe situatie: X.Wu meerderheidsaandeelhouder Slag B.V.
  { from: 'X.Wu', to: 'SLAG B.V.', rel: 'AANDEELHOUDER_VAN', confidence: 'stated', share: '51%',
    evidence: 'In de nieuwe situatie krijgt X.Wu 51% aandeel in Slag B.V. om ook werk aan te nemen waarvoor geen zelfstandigen in aanmerking komen' },
  // Holding-structuur
  { from: 'VirtualV Holding B.V.', to: 'EHMAC B.V.', rel: 'HEEFT_DOCHTER', confidence: 'stated', evidence: 'VirtualV Holding B.V. has subsidiaries EHMAC B.V. and Slag B.V.' },
  { from: 'VirtualV Holding B.V.', to: 'SLAG B.V.',  rel: 'HEEFT_DOCHTER', confidence: 'stated', share: '49%',
    evidence: 'VirtualV Holding houdt 49% in Slag B.V. (X.Wu 51%) en blijft die als dochter boeken (besluit gebruiker 2026-06-07).' },
  { from: 'SLAG B.V.', to: 'Uniforce Group B.V.',   rel: 'GESCHIL_MET',   confidence: 'stated', evidence: 'the dispute is between Slag B.V./Edwin and Uniforce Group B.V.' },
  // Edwin ↔ hardware / software
  { from: 'Edwin', to: 'GPU Server 1', rel: 'BEZIT',    confidence: 'stated',   evidence: 'Edwin owns a Supermicro 4029GP-TRT server with 4× RTX 3090 GPUs' },
  { from: 'Edwin', to: 'Optane nvram', rel: 'BEZIT',    confidence: 'stated',   evidence: 'Edwin evaluated/purchased Optane DCPMM for the X11DPG-OT-CPU server board' },
  // Door gebruiker bevestigd (was eerder afgewezen bij verificatie): de Optane
  // zit zowel in het X11DPG-bord als in het Supermicro-serverbord (= GPU Server 1).
  { from: 'Optane nvram', to: 'GPU Server 1', rel: 'ONDERDEEL_VAN', confidence: 'stated',
    evidence: 'Optane hoort bij zowel het X11DPG bord als ook de Supermicro Server bord (= GPU Server 1)' },
  { from: 'GPU Server 1', to: 'Python', rel: 'DRAAIT',  confidence: 'stated',   evidence: 'Local server runs an 8-model expert LLM team and ML stack (Python)' },
  { from: 'Edwin', to: 'Python',       rel: 'GEBRUIKT', confidence: 'inferred', evidence: 'The ML/data work is in Python and Rust' },
  // Projecten / SmartSlag3
  { from: 'Edwin', to: 'SmartSlag3',           rel: 'WERKT_AAN',    confidence: 'stated',   evidence: 'Edwin operates Slakkenspoor VOF for the SmartSlag3 R&D venture' },
  { from: 'SlagBox', to: 'SmartSlag3',         rel: 'ONDERDEEL_VAN', confidence: 'inferred', evidence: 'SmartSlag3 MK-II "SlagBox 100" design — SlagBox is a sub-project of SmartSlag3' },
  { from: 'Vanadium winning', to: 'SmartSlag3', rel: 'ONDERDEEL_VAN', confidence: 'stated',  evidence: 'the vanadium extraction (Vanadium winning) within SmartSlag3' },
  { from: 'Vanadium baar',      to: 'Vanadium winning', rel: 'PRODUCT_VAN', confidence: 'stated', evidence: 'Vanadium baar/elektrolyt/ijzer are vanadium products derived from the vanadium extraction' },
  { from: 'Vanadium elektrolyt', to: 'Vanadium winning', rel: 'PRODUCT_VAN', confidence: 'stated', evidence: 'Vanadium baar/elektrolyt/ijzer are vanadium products derived from the vanadium extraction' },
  { from: 'Vanadium ijzer',     to: 'Vanadium winning', rel: 'PRODUCT_VAN', confidence: 'stated', evidence: 'Vanadium baar/elektrolyt/ijzer are vanadium products derived from the vanadium extraction' },
  // Game
  { from: 'MOLGANG', to: 'Roblox', rel: 'GEBOUWD_MET', confidence: 'stated', evidence: 'MOLGANG: Roblox/Three.js game development' },
  // Uitbreiding uit werkcontext (gebruiker akkoord 2026-06-07) — alleen gegronde relaties
  { from: 'Edwin', to: 'Slakkenspoor VOF', rel: 'VENNOOT_IN', confidence: 'stated', evidence: 'Edwin operates Slakkenspoor VOF (50/50 with metallurgist Diederik Fierig)' },
  { from: 'Diederik Fierig', to: 'Slakkenspoor VOF', rel: 'VENNOOT_IN', confidence: 'stated', evidence: 'Slakkenspoor VOF (50/50 with metallurgist Diederik Fierig)' },
  { from: 'Slakkenspoor VOF', to: 'SmartSlag3', rel: 'ONTWIKKELT', confidence: 'stated', evidence: 'Edwin operates Slakkenspoor VOF ... for the SmartSlag³ R&D venture' },
  { from: 'Tata Steel IJmuiden', to: 'SmartSlag3', rel: 'LEVERT_AAN', confidence: 'stated', evidence: 'hydrometallurgical processing of BOF steel slag from Tata Steel IJmuiden' },
  { from: 'Witteveen', to: 'Uniforce Group B.V.', rel: 'BESTUURDER_VAN', confidence: 'stated', evidence: 'director Witteveen' },
  { from: 'Edwin', to: 'Witteveen', rel: 'GESCHIL_MET', confidence: 'stated', evidence: 'civil lawsuit against Uniforce Group B.V. and director Witteveen (co-defendant, joint liability)' },
  { from: 'Edwin', to: 'Magnit', rel: 'DETACHERING_VIA', confidence: 'stated', evidence: 'Active contract work runs through Magnit/APG as a senior data steward' },
];

// Defense-in-depth: elk dynamisch geïnterpoleerd Neo4j-label/relatietype moet
// een veilige identifier zijn. Waarden komen vandaag enkel uit de hardcoded
// whitelists hierboven; deze guard voorkomt dat een toekomstige edit met een
// user-afkomstige waarde stilletjes injecteerbaar wordt.
const SAFE_IDENT = /^[A-Za-z_][A-Za-z0-9_]*$/;
function assertSafeIdent(v: string): string {
  if (!SAFE_IDENT.test(v)) throw new Error(`family-graph: onveilig label/relatie '${v}'`);
  return v;
}

// ---------------------------------------------------------------------------
// Zichtbaarheid (toggle "verbergen")
// ---------------------------------------------------------------------------

export interface Visibility {
  graph: string;
  hidden: boolean;
  updated_at: string;
}

/** Lees de toggle-status van schijf (default: zichtbaar). */
export function getFamilyVisibility(): Visibility {
  try {
    if (fs.existsSync(VISIBILITY_FILE)) {
      const v = JSON.parse(fs.readFileSync(VISIBILITY_FILE, 'utf8'));
      return { graph: FAMILY_GRAPH_NAME, hidden: !!v.hidden, updated_at: v.updated_at || '' };
    }
  } catch (e: any) {
    logger.warn(`family-graph: kon zichtbaarheid niet lezen: ${e.message}`);
  }
  return { graph: FAMILY_GRAPH_NAME, hidden: false, updated_at: '' };
}

function persistVisibility(hidden: boolean): Visibility {
  const v: Visibility = { graph: FAMILY_GRAPH_NAME, hidden, updated_at: new Date().toISOString() };
  try {
    fs.mkdirSync(path.dirname(VISIBILITY_FILE), { recursive: true });
    fs.writeFileSync(VISIBILITY_FILE, JSON.stringify(v, null, 2));
  } catch (e: any) {
    logger.warn(`family-graph: kon zichtbaarheid niet schrijven: ${e.message}`);
  }
  return v;
}

/**
 * Zet de hele Familie-graaf op verborgen/zichtbaar. Schrijft de toggle naar
 * schijf én zet `hidden` op alle :Familie-knopen (zodat een directe Cypher-query
 * de toggle ook respecteert). Graceful bij offline Neo4j.
 */
export async function setFamilyVisibility(client: LightRAGClient, hidden: boolean): Promise<Visibility> {
  const v = persistVisibility(hidden);
  if (client.isConnected()) {
    const session = (client as any).driver.session();
    try {
      await session.run(
        `MATCH (n:Familie) SET n.hidden = $hidden`,
        { hidden },
      );
    } catch (e: any) {
      logger.warn(`family-graph: kon hidden-property niet zetten: ${e.message}`);
    } finally {
      await session.close();
    }
  }
  logger.info(`✓ family-graph: zichtbaarheid → ${hidden ? 'VERBORGEN' : 'zichtbaar'}`);
  return v;
}

// ---------------------------------------------------------------------------
// Ingest
// ---------------------------------------------------------------------------

export interface IngestResult {
  entities: number;
  categories: number;
  /** Organisatorische randen: IN_CATEGORIE (per object) + DEEL_VAN (per hub). */
  structuralEdges: number;
  /** Naam-afgeleide randen (inferred). */
  semanticEdges: number;
  /** Bron-geverifieerde randen uit de werkcontext. */
  verifiedEdges: number;
  hidden: boolean;
  offline?: boolean;
}

/**
 * Bouw/ververs de Familie-graaf in Neo4j. Idempotent (MERGE overal):
 *   (:Familie:<Type> {name})            één per object
 *   (:Familie:Categorie {name})         één hub per categorie
 *   (:Familie:Graaf {name:'Familie'})   één root-knoop
 *   (entity)-[:IN_CATEGORIE]->(hub)
 *   (hub)-[:DEEL_VAN]->(root)
 *   (entity)-[:<semantic>]->(entity)    de afgeleide randen
 */
export async function ingestFamilyGraph(client: LightRAGClient): Promise<IngestResult> {
  const vis = getFamilyVisibility();
  if (!client.isConnected()) {
    return { entities: 0, categories: 0, structuralEdges: 0, semanticEdges: 0, verifiedEdges: 0, hidden: vis.hidden, offline: true };
  }
  const session = (client as any).driver.session();
  let structuralEdges = 0, semanticEdges = 0, verifiedEdges = 0;
  try {
    // Root-knoop van deze benoemde graaf.
    await session.run(
      `MERGE (g:Familie:Graaf {name: $name})
       SET g.graph = $name, g.hidden = $hidden, g.kind = 'graph-root'`,
      { name: FAMILY_GRAPH_NAME, hidden: vis.hidden },
    );

    // Categorie-hubs (elke hub → DEEL_VAN → root).
    for (const key of Object.keys(CATEGORIES)) {
      const c = CATEGORIES[key];
      await session.run(
        `MERGE (cat:Familie:Categorie {name: $label})
         SET cat.graph = $graph, cat.hidden = $hidden, cat.group = $group, cat.kind = 'category'
         WITH cat
         MATCH (g:Familie:Graaf {name: $graph})
         MERGE (cat)-[:DEEL_VAN]->(g)`,
        { label: c.label, graph: FAMILY_GRAPH_NAME, hidden: vis.hidden, group: c.group },
      );
      structuralEdges++; // DEEL_VAN
    }

    // Entiteiten + categorie-randen. We zetten het type-label dynamisch via
    // apoc-vrije string-interpolatie van een gevalideerde whitelist-waarde
    // (nodeLabel komt uit CATEGORIES, nooit uit user input; extra geguard).
    for (const e of ENTITIES) {
      const c = CATEGORIES[e.cat];
      const typeLabel = assertSafeIdent(c.nodeLabel);
      await session.run(
        `MERGE (n:Familie:\`${typeLabel}\` {name: $name})
         SET n.graph = $graph, n.hidden = $hidden, n.category = $catLabel,
             n.group = $group, n.note = $note, n.kind = 'entity'
         WITH n
         MATCH (cat:Familie:Categorie {name: $catLabel})
         MERGE (n)-[:IN_CATEGORIE]->(cat)`,
        {
          name: e.name,
          graph: FAMILY_GRAPH_NAME,
          hidden: vis.hidden,
          catLabel: c.label,
          group: c.group,
          note: e.note || '',
        },
      );
      structuralEdges++; // IN_CATEGORIE
    }

    // Reconciliatie — maak de afgeleide + geverifieerde randen DECLARATIEF.
    // MERGE voegt alleen toe; een rand die uit de bron-arrays verdwijnt (bv. de
    // vervallen 'Edwin -CONTROLEERT-> SLAG B.V.') zou anders in Neo4j blijven
    // hangen. Daarom verwijderen we eerst alle door deze module gezette randen
    // (die dragen r.verified) en herbouwen ze daarna 1-op-1 uit de arrays.
    // Structurele randen (IN_CATEGORIE/DEEL_VAN) hebben deze property niet en
    // blijven dus onaangeroerd.
    await session.run(
      `MATCH (:Familie)-[r]->(:Familie) WHERE r.verified IS NOT NULL DELETE r`,
    );

    // Afgeleide semantische randen (naam-afleiding → inferred=true).
    for (const s of SEMANTIC_EDGES) {
      await session.run(
        `MATCH (a:Familie {name: $from}), (b:Familie {name: $to})
         MERGE (a)-[r:\`${assertSafeIdent(s.rel)}\`]->(b)
         SET r.inferred = true, r.verified = false`,
        { from: s.from, to: s.to },
      );
      semanticEdges++;
    }

    // Bron-geverifieerde randen uit de werkcontext (met bewijs op de relatie).
    // `inferred` = niet expliciet gesteld (confidence === 'inferred'), zodat de
    // 3D-viewer geverifieerd-maar-afgeleid visueel kan onderscheiden.
    for (const v of VERIFIED_EDGES) {
      const pct = v.share ? parseInt(v.share, 10) : null;
      await session.run(
        `MATCH (a:Familie {name: $from}), (b:Familie {name: $to})
         MERGE (a)-[r:\`${assertSafeIdent(v.rel)}\`]->(b)
         SET r.verified = true, r.confidence = $confidence,
             r.evidence = $evidence, r.inferred = $inferred,
             r.aandeel = $share, r.meerderheid = $meerderheid, r.review = $review`,
        {
          from: v.from, to: v.to, confidence: v.confidence, evidence: v.evidence,
          inferred: v.confidence === 'inferred',
          share: v.share || null,
          meerderheid: pct == null ? null : pct > 50,
          review: v.review || null,
        },
      );
      verifiedEdges++;
    }

    // Persistente gebruikers-delta uit het webportaal toepassen (na de
    // statische arrays), zodat portal-bewerkingen een herstart overleven.
    const ov = await applyOverrides(session, vis.hidden);

    logger.info(`✓ family-graph: ${ENTITIES.length} objecten, ${Object.keys(CATEGORIES).length} categorieën, ${structuralEdges} structurele + ${semanticEdges} afgeleide + ${verifiedEdges} geverifieerde randen + ${ov.entities} user-objecten/${ov.edges} user-randen (hidden=${vis.hidden})`);
    return {
      entities: ENTITIES.length + ov.entities,
      categories: Object.keys(CATEGORIES).length,
      structuralEdges,
      semanticEdges,
      verifiedEdges: verifiedEdges + ov.edges,
      hidden: vis.hidden,
    };
  } finally {
    await session.close();
  }
}

// ---------------------------------------------------------------------------
// 3D query-surface
// ---------------------------------------------------------------------------

export interface Graph3D {
  graph: string;
  hidden: boolean;
  nodes: Array<{ id: string; name: string; type: string; category: string; group: number; kind: string; note?: string; i18n?: { nl?: string; en?: string; cn?: string }; val: number }>;
  links: Array<{ source: string; target: string; type: string; inferred?: boolean; verified?: boolean; confidence?: string; evidence?: string; share?: string; review?: string }>;
}

/**
 * Geef de Familie-graaf terug in het `3d-force-graph` formaat ({nodes, links}).
 * Als de toggle op "verbergen" staat, komt er een lege graaf terug met
 * `hidden: true` — zo blijft de privé-data buiten beeld zonder de DB te wissen.
 */
export async function getFamilyGraph3D(client: LightRAGClient): Promise<Graph3D> {
  const vis = getFamilyVisibility();
  const empty: Graph3D = { graph: FAMILY_GRAPH_NAME, hidden: vis.hidden, nodes: [], links: [] };
  if (vis.hidden) return empty;          // toggle wint — niets teruggeven
  if (!client.isConnected()) return empty;

  const session = (client as any).driver.session();
  try {
    const nodeRes = await session.run(
      `MATCH (n:Familie)
       WHERE coalesce(n.hidden, false) = false
       RETURN n.name AS name, labels(n) AS labels, coalesce(n.category,'') AS category,
              coalesce(n.group,0) AS group, coalesce(n.kind,'entity') AS kind,
              coalesce(n.note,'') AS note,
              coalesce(n.label_nl,'') AS label_nl, coalesce(n.label_en,'') AS label_en, coalesce(n.label_cn,'') AS label_cn`,
    );
    const nodes = nodeRes.records.map((r: any) => {
      const o = r.toObject();
      const labels: string[] = o.labels || [];
      // primair type = het niet-'Familie' label (Persoon/Bedrijf/Categorie/Graaf...)
      const type = labels.find((l) => l !== 'Familie') || 'Familie';
      const group = typeof o.group === 'object' && o.group?.low !== undefined ? o.group.low : Number(o.group) || 0;
      const i18n = (o.label_nl || o.label_en || o.label_cn)
        ? { nl: o.label_nl || undefined, en: o.label_en || undefined, cn: o.label_cn || undefined }
        : undefined;
      return {
        id: o.name,
        name: o.name,
        type,
        category: o.category,
        group,
        kind: o.kind,
        note: o.note || undefined,
        i18n,
        // hubs/root groter dan losse objecten zodat de 3D-layout structuur toont
        val: o.kind === 'graph-root' ? 12 : o.kind === 'category' ? 6 : 2,
      };
    });

    const linkRes = await session.run(
      `MATCH (a:Familie)-[r]->(b:Familie)
       WHERE coalesce(a.hidden,false) = false AND coalesce(b.hidden,false) = false
       RETURN a.name AS source, b.name AS target, type(r) AS type,
              coalesce(r.inferred,false) AS inferred, coalesce(r.verified,false) AS verified,
              coalesce(r.confidence,'') AS confidence, coalesce(r.evidence,'') AS evidence,
              coalesce(r.aandeel,'') AS share, coalesce(r.review,'') AS review`,
    );
    const links = linkRes.records.map((r: any) => {
      const o = r.toObject();
      return {
        source: o.source, target: o.target, type: o.type,
        inferred: !!o.inferred, verified: !!o.verified,
        confidence: o.confidence || undefined, evidence: o.evidence || undefined,
        share: o.share || undefined, review: o.review || undefined,
      };
    });

    return { graph: FAMILY_GRAPH_NAME, hidden: false, nodes, links };
  } finally {
    await session.close();
  }
}

/** Platte lijst van alle objecten (voor tabel/debug). Respecteert de toggle. */
export async function listFamilyEntities(client: LightRAGClient): Promise<{ hidden: boolean; count: number; entities: any[] }> {
  const vis = getFamilyVisibility();
  if (vis.hidden || !client.isConnected()) return { hidden: vis.hidden, count: 0, entities: [] };
  const session = (client as any).driver.session();
  try {
    const res = await session.run(
      `MATCH (n:Familie) WHERE n.kind = 'entity'
       RETURN n.name AS name, n.category AS category, coalesce(n.note,'') AS note
       ORDER BY n.category, n.name`,
    );
    const entities = res.records.map((r: any) => r.toObject());
    return { hidden: false, count: entities.length, entities };
  } finally {
    await session.close();
  }
}

// ---------------------------------------------------------------------------
// Schrijf-laag — de graaf bijwerken vanuit het webportaal (Quest 3S / browser)
// ---------------------------------------------------------------------------
//
// Gebruikers-bewerkingen moeten een herstart/declaratieve re-ingest overleven.
// Daarom persisteren we ze in data/family-overrides.json en passen ze bij elke
// ingest opnieuw toe (na de statische arrays). Live schrijven gaat direct naar
// Neo4j zodat de portal-bewerking meteen zichtbaar is.

const OVERRIDES_FILE = path.resolve(__dirname, '..', '..', '..', 'data', 'family-overrides.json');
const PORTAL_TOKEN_FILE = path.resolve(__dirname, '..', '..', '..', 'data', 'family-portal-token.json');

export const CATEGORY_KEYS = Object.keys(CATEGORIES);
/** Categorieën voor de portal-dropdown ({key,label,group}). */
export function getCategories() {
  return CATEGORY_KEYS.map((k) => ({ key: k, label: CATEGORIES[k].label, group: CATEGORIES[k].group }));
}

// ---------------------------------------------------------------------------
// i18n — NL / EN / CN (Kantonees = Traditioneel Chinees 繁體)
// ---------------------------------------------------------------------------
// Sleutel op de NL-categorielabel (= node.category) zodat de portal de filter-
// groepering stabiel houdt en alleen de weergave vertaalt. Hub/root ook.
export const CATEGORY_I18N: Record<string, { nl: string; en: string; cn: string }> = {
  'Personen': { nl: 'Personen', en: 'People', cn: '人物' },
  'Bedrijven': { nl: 'Bedrijven', en: 'Companies', cn: '公司' },
  'Hardware': { nl: 'Hardware', en: 'Hardware', cn: '硬件' },
  'Software / OS': { nl: 'Software / OS', en: 'Software / OS', cn: '軟件' },
  'Diensten': { nl: 'Diensten', en: 'Services', cn: '服務' },
  'Projecten': { nl: 'Projecten', en: 'Projects', cn: '項目' },
  'Winning': { nl: 'Winning', en: 'Extraction', cn: '提取' },
  'Materialen': { nl: 'Materialen', en: 'Materials', cn: '材料' },
  'Game-engines': { nl: 'Game-engines', en: 'Game engines', cn: '遊戲引擎' },
  'Studio / Tools': { nl: 'Studio / Tools', en: 'Studios / Tools', cn: '工具' },
  'Locaties': { nl: 'Locaties', en: 'Locations', cn: '地點' },
  'Activiteiten': { nl: 'Activiteiten', en: 'Activities', cn: '活動' },
  'Onderwerpen': { nl: 'Onderwerpen', en: 'Topics', cn: '主題' },
  'Chats': { nl: 'Chats', en: 'Chats', cn: '對話' },
  'Personages (Molgang)': { nl: 'Personages (Molgang)', en: 'Characters (Molgang)', cn: '角色（Molgang）' },
  'Game-zones (Molgang)': { nl: 'Game-zones (Molgang)', en: 'Game zones (Molgang)', cn: '遊戲區域（Molgang）' },
  'Elementen': { nl: 'Elementen', en: 'Elements', cn: '元素' },
  'Verbindingen': { nl: 'Verbindingen', en: 'Compounds', cn: '化合物' },
  'Fasen': { nl: 'Fasen', en: 'Phases', cn: '物相' },
  'Reacties': { nl: 'Reacties', en: 'Reactions', cn: '反應' },
  'Processen': { nl: 'Processen', en: 'Processes', cn: '工藝' },
  'Parameters': { nl: 'Parameters', en: 'Parameters', cn: '參數' },
  'Categorie': { nl: 'Categorie', en: 'Category', cn: '類別' },
  'Graaf': { nl: 'Graaf', en: 'Graph', cn: '圖' },
};

export const RELATION_I18N: Record<string, { nl: string; en: string; cn: string }> = {
  IN_CATEGORIE: { nl: 'in categorie', en: 'in category', cn: '屬類別' },
  DEEL_VAN: { nl: 'deel van', en: 'part of', cn: '屬於' },
  CEO_VAN: { nl: 'CEO van', en: 'CEO of', cn: '行政總裁' },
  OPRICHTER_VAN: { nl: 'oprichter van', en: 'founder of', cn: '創辦人' },
  HEEFT_DOCHTER: { nl: 'heeft dochter', en: 'has subsidiary', cn: '子公司' },
  CONTROLEERT: { nl: 'controleert', en: 'controls', cn: '控制' },
  AANDEELHOUDER_VAN: { nl: 'aandeelhouder van', en: 'shareholder of', cn: '股東' },
  BESTUURDER_VAN: { nl: 'bestuurder van', en: 'director of', cn: '董事' },
  GESCHIL_MET: { nl: 'geschil met', en: 'dispute with', cn: '糾紛' },
  BEZIT: { nl: 'bezit', en: 'owns', cn: '擁有' },
  ONDERDEEL_VAN: { nl: 'onderdeel van', en: 'part of', cn: '部分' },
  DRAAIT: { nl: 'draait', en: 'runs', cn: '運行' },
  DRAAIT_OP: { nl: 'draait op', en: 'runs on', cn: '運行於' },
  GEBRUIKT: { nl: 'gebruikt', en: 'uses', cn: '使用' },
  DIENST_VAN: { nl: 'dienst van', en: 'service of', cn: '服務' },
  WERKT_AAN: { nl: 'werkt aan', en: 'works on', cn: '參與' },
  VENNOOT_IN: { nl: 'vennoot in', en: 'partner in', cn: '合夥人' },
  ONTWIKKELT: { nl: 'ontwikkelt', en: 'develops', cn: '開發' },
  LEVERT_AAN: { nl: 'levert aan', en: 'supplies', cn: '供應' },
  DETACHERING_VIA: { nl: 'detachering via', en: 'contracted via', cn: '外派' },
  PRODUCT_VAN: { nl: 'product van', en: 'product of', cn: '產物' },
  GEBOUWD_MET: { nl: 'gebouwd met', en: 'built with', cn: '建於' },
  TOOL_VOOR: { nl: 'tool voor', en: 'tool for', cn: '工具' },
  GENOEMD_IN: { nl: 'genoemd in', en: 'mentioned in', cn: '提及於' },
  SAMEN_GENOEMD: { nl: 'samen genoemd', en: 'co-mentioned', cn: '共同提及' },
  PERSONAGE_IN: { nl: 'personage in', en: 'character in', cn: '角色' },
  ZONE_VAN: { nl: 'zone van', en: 'zone of', cn: '區域' },
  AR_ANKER: { nl: 'AR-anker', en: 'AR anchor', cn: 'AR錨點' },
  SIMULEERT: { nl: 'simuleert', en: 'simulates', cn: '模擬' },
  VALORISEERT: { nl: 'valoriseert', en: 'valorises', cn: '增值' },
  BEVAT_FASE: { nl: 'bevat fase', en: 'contains phase', cn: '含物相' },
  BESTAAT_UIT: { nl: 'bestaat uit', en: 'consists of', cn: '由…組成' },
  BEVAT_ELEMENT: { nl: 'bevat element', en: 'contains element', cn: '含元素' },
  GEBRUIKT_PROCES: { nl: 'gebruikt proces', en: 'uses process', cn: '用工藝' },
  HEEFT_PARAMETER: { nl: 'heeft parameter', en: 'has parameter', cn: '有參數' },
  PRODUCEERT: { nl: 'produceert', en: 'produces', cn: '生產' },
  REDUCEERT: { nl: 'reduceert', en: 'reduces', cn: '還原' },
  WINT: { nl: 'wint', en: 'extracts', cn: '提取' },
  OMVAT: { nl: 'omvat', en: 'includes', cn: '包括' },
  IS_CHEMISCH: { nl: 'is chemisch', en: 'is chemically', cn: '化學上為' },
  MEET: { nl: 'meet', en: 'measures', cn: '量度' },
  GEBRUIKT_APPARAAT: { nl: 'gebruikt apparaat', en: 'uses device', cn: '用設備' },
  BETREFT: { nl: 'betreft', en: 'concerns', cn: '關於' },
};

/** i18n-woordenboek voor de portal (UI-zinnen + categorie + relatie). */
export function getI18n() {
  return {
    categories: CATEGORY_I18N,
    relations: RELATION_I18N,
    ui: {
      nl: { title: 'Familie — portaal', categories: 'Categorieën aan/uit', allOn: 'Alles aan', allOff: 'Alles uit', hideGraph: 'Hele graaf verbergen', showGraph: 'Hele graaf tonen', edit: 'Bewerken (privé)', visible: 'zichtbaar', hidden: 'verborgen', objects: 'objecten' },
      en: { title: 'Family — portal', categories: 'Categories on/off', allOn: 'All on', allOff: 'All off', hideGraph: 'Hide whole graph', showGraph: 'Show whole graph', edit: 'Edit (private)', visible: 'visible', hidden: 'hidden', objects: 'objects' },
      cn: { title: '家族 — 入口', categories: '類別開關', allOn: '全開', allOff: '全關', hideGraph: '隱藏整圖', showGraph: '顯示整圖', edit: '編輯（私人）', visible: '可見', hidden: '隱藏', objects: '物件' },
    },
  };
}

export interface OverrideEntity { name: string; cat: string; note?: string; }
export interface OverrideEdge { from: string; to: string; rel: string; confidence?: 'stated' | 'inferred'; evidence?: string; }
interface Overrides {
  entities: OverrideEntity[];
  edges: OverrideEdge[];
  removedEntities: string[];
  removedEdges: { from: string; to: string; rel: string }[];
}

function loadOverrides(): Overrides {
  try {
    if (fs.existsSync(OVERRIDES_FILE)) {
      const o = JSON.parse(fs.readFileSync(OVERRIDES_FILE, 'utf8'));
      return {
        entities: o.entities || [], edges: o.edges || [],
        removedEntities: o.removedEntities || [], removedEdges: o.removedEdges || [],
      };
    }
  } catch (e: any) { logger.warn(`family-graph: overrides lezen mislukt: ${e.message}`); }
  return { entities: [], edges: [], removedEntities: [], removedEdges: [] };
}

function saveOverrides(o: Overrides): void {
  try {
    fs.mkdirSync(path.dirname(OVERRIDES_FILE), { recursive: true });
    fs.writeFileSync(OVERRIDES_FILE, JSON.stringify(o, null, 2));
  } catch (e: any) { logger.warn(`family-graph: overrides schrijven mislukt: ${e.message}`); }
}

/** Aantal door de gebruiker toegevoegde objecten/randen (voor de boot-log). */
export function overridesSummary(): { entities: number; edges: number; removedEntities: number; removedEdges: number } {
  const o = loadOverrides();
  return { entities: o.entities.length, edges: o.edges.length, removedEntities: o.removedEntities.length, removedEdges: o.removedEdges.length };
}

/** Pas de persistente gebruikers-delta toe binnen een lopende ingest-sessie. */
async function applyOverrides(session: any, hidden: boolean): Promise<{ entities: number; edges: number }> {
  const o = loadOverrides();
  for (const e of o.entities) {
    const c = CATEGORIES[e.cat];
    if (!c) continue; // onbekende categorie → overslaan
    await session.run(
      `MERGE (n:Familie:\`${assertSafeIdent(c.nodeLabel)}\` {name: $name})
       SET n.graph = $graph, n.hidden = $hidden, n.category = $catLabel,
           n.group = $group, n.note = $note, n.kind = 'entity', n.usercreated = true
       WITH n MATCH (cat:Familie:Categorie {name: $catLabel}) MERGE (n)-[:IN_CATEGORIE]->(cat)`,
      { name: e.name, graph: FAMILY_GRAPH_NAME, hidden, catLabel: c.label, group: c.group, note: e.note || '' },
    );
  }
  for (const ed of o.edges) {
    await session.run(
      `MATCH (a:Familie {name: $from}), (b:Familie {name: $to})
       MERGE (a)-[r:\`${assertSafeIdent(ed.rel)}\`]->(b)
       SET r.verified = true, r.usercreated = true, r.confidence = $confidence,
           r.evidence = $evidence, r.inferred = $inferred`,
      { from: ed.from, to: ed.to, confidence: ed.confidence || 'stated', evidence: ed.evidence || '', inferred: ed.confidence === 'inferred' },
    );
  }
  // Verwijderingen winnen — als laatste toegepast.
  for (const ed of o.removedEdges) {
    await session.run(
      `MATCH (:Familie {name: $from})-[r:\`${assertSafeIdent(ed.rel)}\`]->(:Familie {name: $to}) DELETE r`,
      { from: ed.from, to: ed.to },
    );
  }
  for (const name of o.removedEntities) {
    await session.run(`MATCH (n:Familie {name: $name}) DETACH DELETE n`, { name });
  }
  return { entities: o.entities.length, edges: o.edges.length };
}

function ensureConnected(client: LightRAGClient) {
  if (!client.isConnected()) throw new Error('Neo4j niet verbonden — kan de graaf niet bijwerken');
}

/** Voeg een object toe of werk het bij (portal). Persisteert + schrijft live. */
export async function upsertEntity(client: LightRAGClient, e: OverrideEntity): Promise<{ ok: true; entity: OverrideEntity }> {
  ensureConnected(client);
  if (!e.name || !e.name.trim()) throw new Error('naam is verplicht');
  const c = CATEGORIES[e.cat];
  if (!c) throw new Error(`onbekende categorie '${e.cat}' (kies uit: ${CATEGORY_KEYS.join(', ')})`);
  const o = loadOverrides();
  o.removedEntities = o.removedEntities.filter((n) => n !== e.name);
  o.entities = o.entities.filter((x) => x.name !== e.name);
  o.entities.push({ name: e.name, cat: e.cat, note: e.note || '' });
  saveOverrides(o);
  const vis = getFamilyVisibility();
  const session = (client as any).driver.session();
  try {
    await session.run(
      `MERGE (n:Familie:\`${assertSafeIdent(c.nodeLabel)}\` {name: $name})
       SET n.graph = $graph, n.hidden = $hidden, n.category = $catLabel,
           n.group = $group, n.note = $note, n.kind = 'entity', n.usercreated = true
       WITH n MATCH (cat:Familie:Categorie {name: $catLabel}) MERGE (n)-[:IN_CATEGORIE]->(cat)`,
      { name: e.name, graph: FAMILY_GRAPH_NAME, hidden: vis.hidden, catLabel: c.label, group: c.group, note: e.note || '' },
    );
  } finally { await session.close(); }
  logger.info(`✓ family-graph: object toegevoegd/bijgewerkt '${e.name}' (${e.cat})`);
  scheduleExport(client);
  return { ok: true, entity: { name: e.name, cat: e.cat, note: e.note || '' } };
}

/** Voeg een rand toe (portal). Beide eindpunten moeten bestaan. */
export async function upsertEdge(client: LightRAGClient, ed: OverrideEdge): Promise<{ ok: true; edge: OverrideEdge }> {
  ensureConnected(client);
  if (!ed.from || !ed.to || !ed.rel) throw new Error('from, to en rel zijn verplicht');
  const rel = assertSafeIdent(ed.rel.toUpperCase().replace(/\s+/g, '_'));
  const session = (client as any).driver.session();
  try {
    const exists = await session.run(
      `MATCH (a:Familie {name:$from}), (b:Familie {name:$to}) RETURN count(*) AS c`,
      { from: ed.from, to: ed.to },
    );
    const c = exists.records[0]?.get('c');
    const cn = typeof c === 'object' && c?.low !== undefined ? c.low : Number(c);
    if (!cn) throw new Error(`beide objecten moeten bestaan ('${ed.from}', '${ed.to}')`);
    const o = loadOverrides();
    o.removedEdges = o.removedEdges.filter((x) => !(x.from === ed.from && x.to === ed.to && x.rel === rel));
    o.edges = o.edges.filter((x) => !(x.from === ed.from && x.to === ed.to && x.rel === rel));
    o.edges.push({ from: ed.from, to: ed.to, rel, confidence: ed.confidence || 'stated', evidence: ed.evidence || '' });
    saveOverrides(o);
    await session.run(
      `MATCH (a:Familie {name:$from}), (b:Familie {name:$to})
       MERGE (a)-[r:\`${rel}\`]->(b)
       SET r.verified = true, r.usercreated = true, r.confidence = $confidence,
           r.evidence = $evidence, r.inferred = $inferred`,
      { from: ed.from, to: ed.to, confidence: ed.confidence || 'stated', evidence: ed.evidence || '', inferred: ed.confidence === 'inferred' },
    );
  } finally { await session.close(); }
  logger.info(`✓ family-graph: rand toegevoegd ${ed.from} -[${rel}]-> ${ed.to}`);
  scheduleExport(client);
  return { ok: true, edge: { from: ed.from, to: ed.to, rel, confidence: ed.confidence || 'stated', evidence: ed.evidence || '' } };
}

/** Verwijder een object (+ zijn randen). Persisteert de verwijdering. */
export async function removeEntity(client: LightRAGClient, name: string): Promise<{ ok: true; removed: string }> {
  ensureConnected(client);
  const o = loadOverrides();
  o.entities = o.entities.filter((x) => x.name !== name);
  if (!o.removedEntities.includes(name)) o.removedEntities.push(name);
  saveOverrides(o);
  const session = (client as any).driver.session();
  try {
    await session.run(`MATCH (n:Familie {name:$name}) WHERE n.kind = 'entity' DETACH DELETE n`, { name });
  } finally { await session.close(); }
  logger.info(`✓ family-graph: object verwijderd '${name}'`);
  scheduleExport(client);
  return { ok: true, removed: name };
}

/** Verwijder een rand. Persisteert de verwijdering. */
export async function removeEdge(client: LightRAGClient, ed: { from: string; to: string; rel: string }): Promise<{ ok: true }> {
  ensureConnected(client);
  const rel = assertSafeIdent(ed.rel.toUpperCase().replace(/\s+/g, '_'));
  const o = loadOverrides();
  o.edges = o.edges.filter((x) => !(x.from === ed.from && x.to === ed.to && x.rel === rel));
  if (!o.removedEdges.find((x) => x.from === ed.from && x.to === ed.to && x.rel === rel)) {
    o.removedEdges.push({ from: ed.from, to: ed.to, rel });
  }
  saveOverrides(o);
  const session = (client as any).driver.session();
  try {
    await session.run(
      `MATCH (:Familie {name:$from})-[r:\`${rel}\`]->(:Familie {name:$to}) DELETE r`,
      { from: ed.from, to: ed.to },
    );
  } finally { await session.close(); }
  logger.info(`✓ family-graph: rand verwijderd ${ed.from} -[${rel}]-> ${ed.to}`);
  scheduleExport(client);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Privé toegang — gedeeld token voor schrijf-acties vanuit de portal
// ---------------------------------------------------------------------------
//
// "Liefst privé": schrijf-endpoints vereisen een token. Bij eerste boot wordt
// er één gegenereerd en op schijf bewaard; de eigenaar leest 'm via de
// localhost-only route /api/family/portal-token of uit data/family-portal-token.json.
// Env FAMILY_PORTAL_TOKEN overschrijft de file.

export function getOrCreatePortalToken(): string {
  const envTok = process.env.FAMILY_PORTAL_TOKEN;
  if (envTok && envTok.trim()) return envTok.trim();
  try {
    if (fs.existsSync(PORTAL_TOKEN_FILE)) {
      const t = JSON.parse(fs.readFileSync(PORTAL_TOKEN_FILE, 'utf8'));
      if (t?.token) return t.token;
    }
  } catch { /* ignore, regenerate */ }
  const token = crypto.randomBytes(24).toString('base64url');
  try {
    fs.mkdirSync(path.dirname(PORTAL_TOKEN_FILE), { recursive: true });
    fs.writeFileSync(PORTAL_TOKEN_FILE, JSON.stringify({ token, created_at: new Date().toISOString() }, null, 2));
  } catch (e: any) { logger.warn(`family-graph: portal-token schrijven mislukt: ${e.message}`); }
  return token;
}

/** True als het meegegeven token klopt. */
export function checkPortalToken(provided?: string): boolean {
  if (!provided) return false;
  const expected = getOrCreatePortalToken();
  // constant-time vergelijk
  const a = Buffer.from(provided); const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// ---------------------------------------------------------------------------
// Chat-extractie ingest — data/family-extract.json (uit scripts/family-extract.py)
// ---------------------------------------------------------------------------
//
// Voegt de uit 809 chats ontlede entiteiten/locaties/onderwerpen + chat-knopen
// toe. Alles getagd source='chat' (toggle-baar). Overlappende namen MERGEn op
// de bestaande curated knoop (zonder die te overschrijven — alleen een
// `inchat`-vlag). Co-occurrence/mention-randen zijn inferred=true (geen feiten).
// Idempotent: ruimt eerst de vorige source='chat' delta op, dan herbouw.

const EXTRACT_FILE = path.resolve(__dirname, '..', '..', '..', 'data', 'family-extract.json');
const MOLGANG_FILE = path.resolve(__dirname, '..', '..', '..', 'data', 'molgang-extract.json');
const CHEMISTRY_FILE = path.resolve(__dirname, '..', '..', '..', 'data', 'slag-chemistry.json');

export interface ExtractResult { entities: number; chats: number; edges: number; source?: string; offline?: boolean; missing?: boolean; }

/**
 * Generieke per-bron delta-ingest. `source` ('chat' | 'molgang' | ...) tagt en
 * scheidt de data zodat hij apart te reconcileren/togglen is. Idempotent:
 * verwijdert eerst de vorige delta van deze bron, dan herbouw. Entiteiten die
 * al curated bestaan worden niet overschreven (alleen een in<bron>-vlag).
 */
async function ingestDelta(client: LightRAGClient, file: string, source: string): Promise<ExtractResult> {
  if (!client.isConnected()) return { entities: 0, chats: 0, edges: 0, source, offline: true };
  if (!fs.existsSync(file)) return { entities: 0, chats: 0, edges: 0, source, missing: true };
  let doc: any;
  try { doc = JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch (e: any) { logger.warn(`family-graph: ${source}-delta lezen mislukt: ${e.message}`); return { entities: 0, chats: 0, edges: 0, source, missing: true }; }

  const vis = getFamilyVisibility();
  const session = (client as any).driver.session();
  const flag = `in_${source}`; // bv. in_chat / in_molgang op een curated knoop
  let entities = 0, chats = 0, edges = 0;
  try {
    // Reconciliatie: verwijder de vorige delta van deze bron.
    await session.run(`MATCH (:Familie)-[r]->(:Familie) WHERE r.source = $source DELETE r`, { source });
    await session.run(`MATCH (n:Familie) WHERE n.source = $source DETACH DELETE n`, { source });

    // Entiteiten: nieuw → eigen label/categorie; bestaand (curated) → alleen
    // een in<bron>-vlag + mentions, niet overschrijven.
    for (const e of (doc.entities || [])) {
      const c = CATEGORIES[e.category];
      if (!c) continue;
      const i18n = e.i18n || {};
      await session.run(
        `MERGE (n:Familie {name: $name})
         ON CREATE SET n:\`${assertSafeIdent(c.nodeLabel)}\`, n.graph = $graph, n.hidden = $hidden,
             n.category = $catLabel, n.group = $group, n.kind = 'entity', n.source = $source,
             n.mentions = $mentions, n.note = $note,
             n.label_nl = $label_nl, n.label_en = $label_en, n.label_cn = $label_cn
         ON MATCH SET n.\`${flag}\` = true, n.mentions = coalesce(n.mentions,0) + $mentions`,
        { name: e.name, graph: FAMILY_GRAPH_NAME, hidden: vis.hidden, catLabel: c.label, group: c.group, mentions: e.mentions || 0, source, note: e.note || '',
          label_nl: i18n.nl || '', label_en: i18n.en || '', label_cn: i18n.cn || '' },
      );
      entities++;
    }

    // Optionele chat-knopen (merge op chatId zodat dubbele titels niet samenvallen).
    const chatCat = CATEGORIES['chat'];
    for (const ch of (doc.chats || [])) {
      await session.run(
        `MERGE (c:Familie:\`${assertSafeIdent(chatCat.nodeLabel)}\` {chatId: $uuid})
         SET c.name = $name, c.graph = $graph, c.hidden = $hidden, c.category = $catLabel,
             c.group = $group, c.kind = 'chat', c.source = $source, c.date = $date, c.entityCount = $ents
         WITH c MATCH (cat:Familie:Categorie {name: $catLabel}) MERGE (c)-[:IN_CATEGORIE]->(cat)`,
        { uuid: ch.uuid, name: ch.name, graph: FAMILY_GRAPH_NAME, hidden: vis.hidden, catLabel: chatCat.label, group: chatCat.group, date: ch.date || '', ents: ch.entities || 0, source },
      );
      chats++;
    }

    // Randen: kind 'mention' → entiteit→chat (op chatId); anders entiteit↔entiteit (op naam).
    for (const ed of (doc.edges || [])) {
      const rel = assertSafeIdent(ed.rel);
      if (ed.kind === 'mention') {
        await session.run(
          `MATCH (a:Familie {name: $from}), (c:Familie:Chat {chatId: $to})
           MERGE (a)-[r:\`${rel}\`]->(c) SET r.source = $source, r.inferred = true`,
          { from: ed.from, to: ed.to, source },
        );
      } else {
        await session.run(
          `MATCH (a:Familie {name: $from}), (b:Familie {name: $to})
           MERGE (a)-[r:\`${rel}\`]->(b) SET r.source = $source, r.inferred = true, r.weight = $weight`,
          { from: ed.from, to: ed.to, weight: ed.weight || 1, source },
        );
      }
      edges++;
    }

    logger.info(`✓ family-graph: ${source}-delta geïngest — ${entities} entiteiten, ${chats} chats, ${edges} randen`);
    scheduleExport(client);
    return { entities, chats, edges, source };
  } finally {
    await session.close();
  }
}

/** Chat-extractie (data/family-extract.json) inladen — getagd source='chat'. */
export function ingestExtract(client: LightRAGClient): Promise<ExtractResult> {
  return ingestDelta(client, EXTRACT_FILE, 'chat');
}

/** Molgang-game extractie (data/molgang-extract.json) — getagd source='molgang'. */
export function ingestMolgang(client: LightRAGClient): Promise<ExtractResult> {
  return ingestDelta(client, MOLGANG_FILE, 'molgang');
}

/** Chemie/fysica staalslak-valorisatie (data/slag-chemistry.json) — getagd source='chem'. */
export function ingestChemistry(client: LightRAGClient): Promise<ExtractResult> {
  return ingestDelta(client, CHEMISTRY_FILE, 'chem');
}

// ---------------------------------------------------------------------------
// Externe kopie up-to-date houden bij elke graafwijziging (o.a. Google Drive)
// ---------------------------------------------------------------------------
//
// Bij elke mutatie (toevoegen/verwijderen/ingest) schrijven we — gedebounced —
// een verse snapshot (JSON + CSV) naar EXPORT_DIR, en pushen die naar een
// externe bestemming als die geconfigureerd is:
//   FAMILY_RCLONE_REMOTE  bv. "gdrive:Familie-Kennisgraaf"  → rclone copy
//   FAMILY_DRIVE_DIR      een (Drive-gesyncte) map          → cp
//   FAMILY_DRIVE_SYNC_CMD een eigen commando ({dir} = exportmap)
// Zonder configuratie blijft alleen de lokale kopie vers (en logt 'niet
// geconfigureerd'); de Google-Drive-leg vraagt eenmalig rclone/credentials.

const EXPORT_DIR = process.env.FAMILY_EXPORT_DIR || path.join(os.homedir(), 'familie-export');
let exportTimer: NodeJS.Timeout | null = null;
let exportClient: LightRAGClient | null = null;

/** Gedebouncede export+sync: plan 3 s na de laatste wijziging (coalescing). */
export function scheduleExport(client: LightRAGClient): void {
  exportClient = client;
  if (exportTimer) return;
  exportTimer = setTimeout(() => {
    exportTimer = null;
    const c = exportClient;
    if (c) exportAndSync(c).catch((e) => logger.warn(`family-graph: export-sync faalde: ${e.message}`));
  }, 3000);
}

function toCsv(rows: any[], cols: string[]): string {
  const esc = (v: any) => { const s = (v ?? '') + ''; return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  return cols.join(',') + '\n' + rows.map((r) => cols.map((c) => esc(r[c])).join(',')).join('\n') + '\n';
}

/** Schrijf JSON+CSV-snapshot naar EXPORT_DIR en push naar de externe bestemming. */
export async function exportAndSync(client: LightRAGClient): Promise<{ dir: string; nodes: number; links: number; synced: string }> {
  if (!client.isConnected()) return { dir: EXPORT_DIR, nodes: 0, links: 0, synced: 'offline' };
  const session = (client as any).driver.session();
  let nodes: any[] = [], links: any[] = [];
  try {
    const nr = await session.run(
      `MATCH (n:Familie) RETURN n.name AS id, coalesce(n.category,'') AS category,
              coalesce(n.group,0) AS group, coalesce(n.kind,'entity') AS kind,
              coalesce(n.note,'') AS note, coalesce(n.source,'curated') AS source`,
    );
    nodes = nr.records.map((r: any) => r.toObject());
    const lr = await session.run(
      `MATCH (a:Familie)-[r]->(b:Familie) RETURN a.name AS source, b.name AS target, type(r) AS rel,
              coalesce(r.confidence,'') AS confidence, coalesce(r.evidence,'') AS evidence, coalesce(r.aandeel,'') AS share`,
    );
    links = lr.records.map((r: any) => r.toObject());
  } finally { await session.close(); }
  // Neo4j-integers afvlakken.
  for (const n of nodes) if (n.group && typeof n.group === 'object' && 'low' in n.group) n.group = n.group.low;

  fs.mkdirSync(EXPORT_DIR, { recursive: true });
  fs.writeFileSync(path.join(EXPORT_DIR, 'familie-graph.json'),
    JSON.stringify({ graph: FAMILY_GRAPH_NAME, exported_at: new Date().toISOString(), nodes, links }, null, 1));
  fs.writeFileSync(path.join(EXPORT_DIR, 'familie-nodes.csv'), toCsv(nodes, ['id', 'category', 'group', 'kind', 'note', 'source']));
  fs.writeFileSync(path.join(EXPORT_DIR, 'familie-edges.csv'), toCsv(links, ['source', 'target', 'rel', 'confidence', 'evidence', 'share']));

  // Houd de MacBook-Air deploy-zip ook vers (best-effort) zodat één Drive-sync
  // de complete bundel meeneemt.
  await new Promise<void>((resolve) => {
    const script = path.resolve(__dirname, '..', '..', '..', 'scripts', 'build-mac-deploy.py');
    if (!fs.existsSync(script)) { resolve(); return; }
    exec(`python3 '${script.replace(/'/g, "'\\''")}'`, { timeout: 60000 }, () => resolve());
  });

  const synced = await syncDrive(EXPORT_DIR);
  logger.info(`✓ family-graph: snapshot ge-exporteerd (${nodes.length} nodes, ${links.length} links) → ${EXPORT_DIR} [drive: ${synced}]`);
  return { dir: EXPORT_DIR, nodes: nodes.length, links: links.length, synced };
}

function syncDrive(dir: string): Promise<string> {
  return new Promise((resolve) => {
    const cmdTpl = process.env.FAMILY_DRIVE_SYNC_CMD;
    const remote = process.env.FAMILY_RCLONE_REMOTE;
    const driveDir = process.env.FAMILY_DRIVE_DIR;
    const q = (s: string) => `'${s.replace(/'/g, "'\\''")}'`;
    let run: string | null = null;
    if (cmdTpl) run = cmdTpl.replace('{dir}', dir);
    else if (remote) run = `rclone copy ${q(dir)} ${q(remote)}`;
    else if (driveDir) run = `mkdir -p ${q(driveDir)} && cp -f ${q(dir)}/familie-graph.json ${q(dir)}/familie-nodes.csv ${q(dir)}/familie-edges.csv ${q(driveDir)}/`;
    if (!run) { resolve('niet geconfigureerd (zet FAMILY_RCLONE_REMOTE / FAMILY_DRIVE_DIR / FAMILY_DRIVE_SYNC_CMD)'); return; }
    exec(run, { timeout: 60000 }, (err) => resolve(err ? `fout: ${err.message}` : 'ok'));
  });
}
