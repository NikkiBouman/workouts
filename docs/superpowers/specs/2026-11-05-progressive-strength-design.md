# Progressief doel per krachtoefening ("Beter dan vorige keer")

Datum: 2026-11-05

## Doel

Per krachtoefening kiezen tussen twee doel-modi:

1. **Vast gewicht** (zoals nu) — je zet sets/reps/gewicht handmatig in de editor.
2. **Beter dan vorige keer** (progressief) — bij het starten van de oefening in de
   runner zie je je **volledige vorige sessie**, en de capture-velden starten op de
   **maxima van die sessie** (gewicht én reps/duur), zodat je ziet dat je dat in
   principe weer aan moet kunnen. Je kunt elk veld nog steeds aanpassen.

Voor oefeningen **per zijde** (perSide) gelden de maxima **per been**, zodat het
links/rechts-verschil zichtbaar is. Links en Rechts krijgen de grafiek-kleuren:
**Links = blauw `#3b82f6`, Rechts = oranje `#f59e0b`**.

## Beslissingen (uit brainstorm)

- **Toggle per oefening** (niet per workout).
- Geldt voor **gewogen én reps/duur** oefeningen. Bij bodyweight betekent
  progressief "meer reps / langere hold" (voorbeeld Nordic: 3×4 → volgende keer 3×6).
- Prefill = **max** van de vorige sessie (per zijde), voor elke set gelijk. Bewust:
  "je deed dit al, dus je zou het weer moeten kunnen". (Per-set-ramp is overwogen en
  afgewezen.)
- **+/− gewichtsstepper stapt met 2.5 kg** (de meeste apparaten werken zo). Typen van
  een vrije waarde blijft mogelijk. Reps-stepper blijft +1.
- De gekleurde zijde-badge geldt voor **alle** per-zijde krachtoefeningen in de
  runner, niet alleen progressieve.

## Datamodel

Eén nieuw veld per krachtoefening-entry in het workoutplan:

```
entry.progressive : boolean   // default false (= vast gewicht)
```

Geen verdere opslag. Alle doelen worden **at runtime** uit de sessiehistorie berekend,
dus ze kunnen nooit verouderen. Oude workouts laden als `false` — geen migratie nodig.

## Nieuwe/gewijzigde modules

### `src/progress.js` — `lastSessionTargets(sessions, exerciseId)`

Pure functie. Zoekt de **meest recente** sessie met deze oefening en levert de volledige
set-lijst plus maxima per zijde:

```js
{
  date,                 // ISO-datum van die sessie
  perSide,              // of die sessie per zijde was
  sets: [ { side, weight, reps, duration } ... ],   // in originele volgorde
  maxWeightL, maxWeightR, maxWeight,
  maxRepsL,   maxRepsR,   maxReps,
  maxDurL,    maxDurR,    maxDur,
}
```

- `side` valt terug op capture-volgorde (L,R,L,R…) als `set.side` ontbreekt — zelfde
  regel als bestaande `sideOf`/`maxW` in dit bestand.
- Niet-perSide: alle `*L`/`*R` zijn gelijk aan de totale max; `perSide=false`.
- Nooit eerder gedaan → `null`.

Unit tests in `test/progress.test.mjs`.

### `src/strength-ui.js` (nieuw) — pure HTML-renderers, DOM-vrij

Gedeeld door de echte runner (`index.html`) én de demo-pagina, zodat er één bron van
waarheid is en `index.html` niet verder groeit.

```js
export const WEIGHT_STEP = 2.5;

// De één metric waarop een oefening progresseert ("MAX"): gewicht bij gewogen, anders
// de gemeten metric (reps of duur). Secundaire metrics blijven het geplande doel.
export function primaryMetric(ex)             // -> 'weight' | 'reps' | 'duration'

// Doel-waarden voor één zijde (0=links,1=rechts) uit targets, gegeven ex-meta.
export function targetFor(targets, sideIndex, ex)
  // -> { weight, reps, duration }  (0 als er geen historie/metric is)

// Gekleurde zijde-badge, of '' als niet-perSide.
export function sideBadgeHtml(sideIndex, perSide, { colLeft, colRight })

// "Vorige keer"-paneel: datum-kopje + exact dezelfde set-tabel als de oefening-detail
// (hergebruikt `sessionSetTableHtml` uit chart.js), of een "geen vorige sessie"-notitie.
export function prevSessionPanelHtml(targets, ex, { colLeft, colRight })
```

Unit tests in `test/strength-ui.test.mjs` (badge-kleur per zijde, hergebruikte tabel,
`primaryMetric`, `targetFor` per zijde, lege-historie-pad).

## UI-wijzigingen in `index.html`

### Editor (`renderStrengthEditor`) — hele-rij MAX-toggle

Eén toggle voor de hele rij in plaats van een aparte toggle bovenaan:

```
┌─────────────────────────────────┐      ┌─────┐
│ SETS   HERHALINGEN   GEWICHT(KG) │  of  │ MAX │
└─────────────────────────────────┘      └─────┘
     manueel (blauw gevuld = actief)       MAX (blauw gevuld = actief)
```

- De **MAX**-metric is de `primaryMetric(ex)`: gewicht bij gewogen, anders reps/duur.
  MAX = "beter dan vorige keer" → die metric komt uit de historie-max. Secundaire velden
  (bv. reps bij een gewogen lift) blijven het geplande doel.
- **MAX aangetikt** → `entry.progressive = true`; nog eens tikken togglet terug.
- **Focus/tik in het manuele vak** (ergens — label, rand of input) → terug naar manueel
  (`setEntryFixed`). De actieve kant is een blauw vlak met witte labels (inputs houden
  hun eigen uiterlijk); updates gebeuren in-place zodat focus behouden blijft.
- Grijze **"of"** tussen de twee kanten; "of" + MAX rechts uitgelijnd (`margin-left:auto`)
  zodat MAX bij elke oefening op dezelfde plek staat.
- `↔ Per zijde` staat onder de oefening-titel in de blok-kop (niet in de velden-rij).
- Alleen strength-oefeningen krijgen MAX; stretches houden gewone velden.

### Runner (`runnerStrengthMode` HTML + `updateStrengthUI`)

- Nieuw `<div id="strPrevSession">`: in progressieve modus toont het
  `prevSessionPanelHtml(...)` — de **exact dezelfde tabel** als de oefening-detail —
  anders leeg/verborgen.
- Zijde-indicator wordt een gekleurde badge `sideBadgeHtml(...)` — blauw "Links" /
  oranje "Rechts" — voor **alle** per-zijde krachtoefeningen.
- Doel/prefill (`strGoalFor`): geplande waarden, met alleen de `primaryMetric` vervangen
  door de historie-max per zijde. `strDetail`/`strWeight` tonen dat doel.
- **Carry-forward per zijde**: een kleine runtime-map onthoudt je werkelijk ingevoerde
  waarde per zijde, zodat set 2 Links start waar je set 1 Links eindigde.
- `bumpCap`: gewichtsstap wordt **2.5** (was 0.5); reps blijft 1.
- De ✓-knop verhuist naar de onderste knoppenrij als groene **"✓ Voltooid"** (naast Skip
  en Stop); **▶ Start** staat daar ook en verschijnt alleen voor duur/hartslag-sets. De
  oefening-gif is kleiner zodat alles past.

### Geen historie

Eerste keer (geen vorige sessie): paneel toont "Geen vorige sessie — zet je eigen
gewicht"; prefill valt terug op geplande/0-waarden.

## Demo

In plaats van een losse demo-pagina breiden we de bestaande demo-modus
(`index.html?demo`, gevoed door `src/demo-db.js`) uit — dat draait de **echte runner**
en is dus de meest getrouwe check. Toegevoegd: een krachtworkout "Krachttraining
(demo · beter dan vorige keer)" met drie progressieve oefeningen (per-zijde gewogen
Single Leg Press, bodyweight Nordic 3×4 → 3×6, en gewogen Squat) plus twee eerdere
sessies als historie. Zo zie je in de runner het "vorige keer"-paneel, de gekleurde
been-badge, de 2.5 kg-stepper, de prefill en de carry-forward — zonder Firebase.

## Testen

- `npm test` (node:test) voor `progress.js` en `strength-ui.js`.
- Handmatige check in `index.html?demo`.
