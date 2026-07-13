# Textus Lexicon: Old English, Latin, Greek, and Indo-European Layers

**Status:** working lexicon for academic review  
**Purpose:** controlled vocabulary for the Fiber/Knit/Loom/Textus architecture  
**Rule:** attested historical forms are separated from proposed system terms.

This file gives Scientific Textus an older language layer without pretending that every
system term has a direct ancient equivalent. It distinguishes three categories:

- **Attested form:** a historical word found in a dictionary or source.
- **Lineage:** an etymological root or cognate relation that is plausible in historical linguistics.
- **Proposed system term:** a new technical use, coined for this architecture.

## 1. Indo-European Root Layer

| Root | Core sense | Relevant descendants | Textus use |
|---|---|---|---|
| `*(h)uebh-` / `*webh-` | weave, interlace; also motion to and fro | Old English `wefan`, English `weave`, `web`; Greek `hyphaino`, `hyphe` | spatial and semantic interlacing; Textus as living web |
| `*teks-` | weave, fabricate, make by craft | Latin `texere`, `textus`; English `text`, `textile`, `tissue`; Greek `tekton`, `techne` by broader craft/fabrication line | Textus as both fabric and readable knowledge surface |
| `*pleḱ-` / `*plek-` | plait, fold, braid | Greek `pleko`; Latin `plectere`, `plexus`; English `complex`, `replicate`, `perplex` | Knit, Plexus, EntanglementFiber |
| `*mezg-` | knit, plait, twist | English `mesh`; Lithuanian `megzti` "to knit", `mazgas` "knot" | mesh-like peer relations; useful secondary root |
| `*sta-` | stand, make firm | Greek `histos` "warp, web, loom" through "that which stands upright" | histology/tissue bridge; upright loom image |

Review note: these roots should be treated as lexical infrastructure, not as proof that
Dutch `brein` and `breien` are etymologically related. Their relation in this project is
conceptual and biological: brain tissue and skin tissue are woven structures.

## 2. Core Architecture Terms

| Architecture term | Dutch gloss | Old English layer | Latin layer | Greek layer | Preferred lexicon role |
|---|---|---|---|---|---|
| `Fiber` | vezel, draad, token | `þræd` / `thraed` "thread"; `twín` "twine/linen" | `fibra` "fiber/filament"; `filum` "thread" | `μίτος` / `mitos` "thread of the warp"; `hyphe` "web" | atomic committed unit |
| `Knit` | knoop, lokale relatie | `cnyttan` "to tie/bind"; `cnotta` "knot" | `nodus` "knot/node"; `nectere` "bind"; `plectere` "plait" | `pleko` "plait, twine, weave"; `desmos` "bond" | signed local claim or transition |
| `Loom` | protocol, weefgetouw | `geloma` "utensil/tool"; `wefan` for weaving action | `tela` "web/warp"; `textrina` "weaving workshop"; `lex texendi` as proposed "law of weaving" | `histos` "loom/web"; `hyphaino` "weave" | protocol rules and constraints |
| `Textus` | kennisweefsel | `webb` / `wefan` conceptual layer | `textus` "woven fabric, structure, web"; `contextus` "woven together" | `histos`, `hyphos`, `plegma` | total knowledge fabric |
| `Plexus` | gevlochten netwerk | proposed `gecnyt-webb` | `plexus` from `plectere`, "braided/interwoven" | `plegma` "plait/network"; `symploke` "interweaving" | higher-order connected knowledge graph |
| `EntanglementFiber` | verstrengelingsvezel | proposed `sam-cnyttung-thraed` | `fibra implicationis` or `fibra complexionis` | `mitos symplokes` | relation between two Knits |
| `SpatialFiber` | ruimtelijke vezel | proposed `stede-thraed` | `fibra loci` | `mitos topou` | geospatial or lab-local cell |
| `ConditionFiber` | conditievezel | proposed `had-thraed` | `fibra condicionis` | `mitos syntheseos` / `mitos peristaseos` | measurement context |
| `CommitmentHash` | cryptografische binding | proposed `segl-thraed` | `sigillum` / `signum digestum` | `sphragis` | cryptographic commitment |

The modern implementation should keep the English identifiers stable (`Fiber`, `Knit`,
`Loom`, `Textus`) and use the older layers as scholarly labels, aliases, UI modes, and
future lexicon metadata.

## 3. Old English Register

### 3.1 Attested Anchor Words

| Form | Transliteration | Meaning for this project | Notes |
|---|---|---|---|
| `wefan` | wefan | to weave, construct, arrange, plan | Strong verb; attested both literal and figurative. |
| `cnyttan` | cnyttan | to bind or tie; source layer for Knit | The modern `knit` line comes through knotting/binding. |
| `geloma` | geloma | tool, implement; later `loom` | Old meaning is general tool, not originally only a textile loom. |
| `twín` | twin | linen/twine/thread-like material | Useful Fiber analogue but not identical to modern cryptographic token. |
| `þræd` | thraed | thread | Useful for Fiber as "draad". |
| `webb` | webb | web, woven fabric | Useful for Textus as a knowledge web. |
| `racente` | racente | chain, fetter | Useful contrast term for "not a chain". |
| `braegen` / `brægen` | braegen | brain | Biological bridge to brain tissue; not a direct `breien` etymology. |
| `hyd` / `hýd` | hyd | skin, hide | Biological bridge to skin tissue. |

### 3.2 Proposed Old-English-Inspired System Names

These are proposed technical aliases, not attested Old English compounds unless later
verified by a specialist.

| Modern term | Proposed alias | Literal gloss |
|---|---|---|
| `Fiber` | `thraed-fiber` / `þraed-fiber` | thread-fiber |
| `Knit` | `cnyttung` | knotting/binding |
| `EntanglementFiber` | `sam-cnyttung-thraed` | co-knotting thread |
| `Textus` | `wisdome-webb` / `wisdōmes-webb` | web of knowledge |
| `Loom` | `wef-laga` | weaving law/protocol |

### 3.3 Old English Register Sentence

Proposed Old-English-inspired register, with `graf` as a deliberate modern
technical loan:

> Ne is hit racente, ne graf; hit is webb: þrǣdas, cnyttungas, gelōma,
> and wīsdōmes-webb.

Working Dutch gloss:

> Het is geen keten en geen graaf; het is een weefsel: draden, knopen,
> protocolgereedschap en een kennisweb.

## 4. Latin Register

### 4.1 Attested Anchor Words

| Form | Meaning | Textus use |
|---|---|---|
| `fibra` | fiber, filament | direct source layer for `Fiber` |
| `filum` | thread | data thread, payload line, causal thread |
| `nodus` | knot, node | `Knit` as local knot and graph node |
| `texo` / `texere` | to weave, plait, construct | protocol action: to weave relations |
| `textus` | woven fabric, cloth, framework, structure, web | best Latin source for `Textus` |
| `contextus` | woven together, joined together | condition/context layer |
| `plecto` / `plectere` | to plait, twine | entanglement and plexus layer |
| `plexus` | braided/interwoven network | graph of higher-order relations |
| `tela` | web, warp, woven structure | Loom/Textus support term |
| `rete` | net | queryable network surface |
| `cerebrum` | brain, seat of senses/intelligence | brain tissue bridge |
| `cutis` / `corium` | skin, hide, membrane | skin tissue bridge |

### 4.2 Proposed Latin System Names

| Modern term | Latin alias | Notes |
|---|---|---|
| `Fiber` | `Fibra` | direct and stable |
| `Knit` | `Nodus` or `Nexus localis` | `Nodus` is simpler; `Nexus` emphasizes binding |
| `Loom` | `Lex Texendi` | "law/rules of weaving"; good for protocol |
| `Textus` | `Textus Scientiae` | "woven structure of knowledge" |
| `Plexus` | `Plexus Scientiae` | higher-order knowledge graph |
| `EntanglementFiber` | `Fibra Symplectica` or `Fibra Implicationis` | `symplectic` is Greek-derived Latin; `implicatio` means folding-in |
| `ConditionFiber` | `Fibra Conditionis` | condition/context commitment |
| `SpatialFiber` | `Fibra Loci` | place/location commitment |
| `CommitmentHash` | `Sigillum Cryptographicum` | cryptographic seal |

### 4.3 Latin Register Sentence

> Non catena, non graphum; sed textus: fibrae, nodi, lex texendi, et plexus
> scientiae.

Working Dutch gloss:

> Geen keten, geen graaf, maar een textus: vezels, knopen, een weefwet en een
> kennisplexus.

## 5. Greek Register

### 5.1 Attested Anchor Words

| Form | Transliteration | Meaning | Textus use |
|---|---|---|---|
| `ἱστός` | histos | loom, web, warp; later tissue root in histology | biological tissue and loom bridge |
| `ὑφαίνω` | hyphaino | to weave; also to contrive/plan | weaving action and semantic construction |
| `ὑφή` / `ὕφος` | hyphe / hyphos | web, woven thing, texture | Textus as fabric/texture |
| `πλέκω` | pleko | to plait, twine, twist, weave, braid | Knit and Entanglement action |
| `πλέγμα` | plegma | plait, network, woven thing | Plexus/knowledge graph analogue |
| `μίτος` | mitos | thread of the warp, thread of destiny | Fiber as thread |
| `συμπλοκή` | symploke | interweaving, combination, entanglement | best Greek layer for EntanglementFiber |
| `δεσμός` | desmos | bond, binding | strict dependency relation |
| `ἐγκέφαλος` | enkephalos | brain, literally "in the head" | brain tissue bridge |
| `δέρμα` | derma | skin, hide, leather | skin tissue bridge |

### 5.2 Proposed Greek System Names

| Modern term | Greek alias | Transliteration | Notes |
|---|---|---|---|
| `Fiber` | `Μίτος` | Mitos | direct thread metaphor |
| `Knit` | `Πλέγμα` | Plegma | knot/plait relation |
| `Loom` | `Ἱστός` or `Νόμος Ὑφάνσεως` | Histos / Nomos Hyphanseos | loom or law of weaving |
| `Textus` | `Ὕφος Γνώσεως` | Hyphos Gnoseos | texture/web of knowledge |
| `Plexus` | `Πλέγμα Γνώσεως` | Plegma Gnoseos | knowledge network |
| `EntanglementFiber` | `Μίτος Συμπλοκῆς` | Mitos Symplokes | thread of interweaving |
| `ConditionFiber` | `Μίτος Περιστάσεως` | Mitos Peristaseos | thread of circumstance/context |
| `SpatialFiber` | `Μίτος Τόπου` | Mitos Topou | thread of place |
| `CommitmentHash` | `Σφραγίς` | Sphragis | seal/cryptographic mark |

### 5.3 Greek Register Sentence

> Οὐ σειρὰ, οὐδὲ γράφημα· ἀλλὰ ὕφος: μίτοι, πλέγματα, νόμος ὑφάνσεως,
> καὶ πλέγμα γνώσεως.

Transliteration:

> Ou seira, oude graphema; alla hyphos: mitoi, plegmata, nomos hyphanseos,
> kai plegma gnoseos.

Working Dutch gloss:

> Geen keten, geen graaf; maar een weefsel: draden, knopen, een weefwet en een
> kennisnetwerk.

## 6. Lexicon Entries for Future Machine Use

The following entries can later be converted to JSON-LD, RDF, YAML, or a database table.

```yaml
- id: fiber
  canonical: Fiber
  dutch: vezel
  role: atomic cryptographic data/value unit
  old_english:
    attested: [thraed, twin]
    proposed: thraed-fiber
  latin:
    attested: [fibra, filum]
    proposed: Fibra
  greek:
    attested: [mitos, hyphe]
    proposed: Mitos
  roots: ["*(h)uebh-", "*teks-"]

- id: knit
  canonical: Knit
  dutch: knoop
  role: signed local relation or transition between Fibers
  old_english:
    attested: [cnyttan, cnotta]
    proposed: cnyttung
  latin:
    attested: [nodus, nectere, plectere]
    proposed: Nodus
  greek:
    attested: [pleko, desmos]
    proposed: Plegma
  roots: ["*plek-", "*mezg-"]

- id: loom
  canonical: Loom
  dutch: protocol
  role: rules that constrain valid Fibers, Knits, and EntanglementFibers
  old_english:
    attested: [geloma, wefan]
    proposed: wef-laga
  latin:
    attested: [texere, tela, textrina]
    proposed: Lex Texendi
  greek:
    attested: [histos, hyphaino]
    proposed: Nomos Hyphanseos
  roots: ["*teks-", "*(h)uebh-", "*sta-"]

- id: textus
  canonical: Textus
  dutch: kennisweefsel
  role: the total queryable knowledge fabric
  old_english:
    attested: [webb, wefan]
    proposed: wisdomes-webb
  latin:
    attested: [textus, contextus, rete]
    proposed: Textus Scientiae
  greek:
    attested: [histos, hyphos, plegma]
    proposed: Hyphos Gnoseos
  roots: ["*teks-", "*(h)uebh-", "*plek-"]

- id: entanglement_fiber
  canonical: EntanglementFiber
  dutch: verstrengelingsvezel
  role: higher-order Fiber binding two Knits under a semantic constraint
  old_english:
    proposed: sam-cnyttung-thraed
  latin:
    proposed: Fibra Symplectica
  greek:
    attested: [symploke]
    proposed: Mitos Symplokes
  roots: ["*plek-"]
```

## 7. Review Guardrails

1. `Loom` is historically from Old English `geloma`, a general tool or implement; the
   specific weaving-machine sense is later.
2. `Knit` is historically a binding/knotting word; its textile-loop sense develops later.
3. `Textus` is the strongest Latin anchor because it already means woven fabric, structure,
   and web.
4. Greek `histos` gives the strongest bridge from loom/web to biological tissue through
   histology.
5. Dutch `brein` and `breien` should remain a metaphorical and biological association
   unless a specialist provides stronger etymological evidence.
6. `EntanglementFiber` should be described as data-wise entanglement, not physical quantum
   entanglement.

## Sources

- Bosworth-Toller, `wefan`: https://bosworthtoller.com/34960
- Bosworth-Toller, `cnyttan`: https://bosworthtoller.com/41982
- Bosworth-Toller, `twín`: https://bosworthtoller.com/31301
- Bosworth-Toller, `racente`: https://bosworthtoller.com/25430
- Bosworth-Toller, `brægen`: https://bosworthtoller.com/40811
- Bosworth-Toller, `hýd`: https://bosworthtoller.com/53654
- Online Etymology Dictionary, `loom`: https://www.etymonline.com/word/loom
- Online Etymology Dictionary, `weave`: https://www.etymonline.com/word/weave
- Online Etymology Dictionary, `*teks-`: https://www.etymonline.com/word/*teks-
- Online Etymology Dictionary, `*plek-`: https://www.etymonline.com/word/*plek-
- Online Etymology Dictionary, `mesh`: https://www.etymonline.com/word/mesh
- Online Etymology Dictionary, `histo-`: https://www.etymonline.com/word/histo-
- Online Latin Dictionary, `texo`: https://www.online-latin-dictionary.com/latin-english-dictionary.php?parola=texo
- Online Latin Dictionary, `textus`: https://www.online-latin-dictionary.com/latin-english-dictionary.php?lemma=TEXTUS100
- Latin is Simple, `fibra`: https://www.latin-is-simple.com/en/vocabulary/noun/9607/
- Latin is Simple, `plecto`: https://www.latin-is-simple.com/en/vocabulary/verb/5510/
- Latdict, `nodus`: https://www.latin-dictionary.net/search/latin/nodus
- Latdict, `cerebrum`: https://www.latin-dictionary.net/search/latin/cerebrum
- Latdict, `cutis`: https://www.latin-dictionary.net/search/latin/cutis
- LSJ, `hyphaino`: https://lsj.gr/wiki/%E1%BD%91%CF%86%CE%B1%CE%AF%CE%BD%CF%89
- Wiktionary, `pleko`: https://en.wiktionary.org/wiki/%CF%80%CE%BB%CE%AD%CE%BA%CF%89
- Wiktionary, `mitos`: https://en.wiktionary.org/wiki/%CE%BC%CE%AF%CF%84%CE%BF%CF%82
- Wiktionary, `enkephalos`: https://en.wiktionary.org/wiki/%E1%BC%90%CE%B3%CE%BA%CE%AD%CF%86%CE%B1%CE%BB%CE%BF%CF%82
- Mounce Greek Dictionary, `derma`: https://www.billmounce.com/greek-dictionary/derma
