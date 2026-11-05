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

// Doel-waarden voor één zijde (0=links,1=rechts) uit targets, gegeven ex-meta.
export function targetFor(targets, sideIndex, ex)
  // -> { weight, reps, duration }  (0 als er geen historie/metric is)

// Gekleurde zijde-badge, of '' als niet-perSide.
export function sideBadgeHtml(sideIndex, perSide, { colLeft, colRight })

// Volledige "vorige sessie"-paneel, of een "geen vorige sessie"-notitie.
export function prevSessionPanelHtml(targets, ex, { colLeft, colRight })
```

Unit tests in `test/strength-ui.test.mjs` (badge-kleur per zijde, paneel-inhoud,
`targetFor` per zijde, lege-historie-pad).

## UI-wijzigingen in `index.html`

### Editor (`renderStrengthEditor`, ~1686)

Boven de velden een twee-staps toggle (bestaande `.toggle-group`/`.toggle-opt` stijl):

```
Doel:  [ Vast gewicht ]  [ Beter dan vorige keer ]
```

- **Vast gewicht**: huidige Sets/Reps/Gewicht-velden.
- **Beter dan vorige keer**: alleen **Sets** blijft (aantal kies je zelf); Reps en
  Gewicht verborgen; notitie "🎯 Gewicht & reps komen van je vorige sessie". De
  `↔ Per zijde`-notitie blijft. Schrijft `editorEntries[ei].progressive`.

### Runner (`runnerStrengthMode` HTML + `updateStrengthUI`, ~2350)

- Nieuw `<div id="strPrevSession">` boven `#strCapture`. In progressieve modus toont
  het `prevSessionPanelHtml(...)`; anders leeg/verborgen.
- Zijde-indicator wordt `sideBadgeHtml(...)` — blauw "Links" / oranje "Rechts" — voor
  **alle** per-zijde krachtoefeningen.
- Prefill in progressieve modus: capture-velden starten op `targetFor(targets, side, ex)`
  (gewicht, reps) resp. de timer op de doel-duur. `strDetail` ("Doel: X reps") toont de
  historie-max.
- **Carry-forward per zijde**: een kleine runtime-map onthoudt je werkelijk ingevoerde
  waarde per zijde, zodat set 2 Links start waar je set 1 Links eindigde (niet terug naar
  de historie-max). Startwaarde van de map = de historie-doelen.
- `bumpCap`: gewichtsstap wordt **2.5** (was 0.5); reps blijft 1.

### Geen historie

Eerste keer (geen vorige sessie): paneel toont "Geen vorige sessie — zet je eigen
gewicht"; prefill valt terug op geplande/0-waarden.

## Demo-pagina

`demo-progressive.html` (zelfstandig, naar model van `demo.html`): importeert
`lastSessionTargets` uit `progress.js` en de renderers uit `strength-ui.js`, met
dummy-sessies voor o.a. een per-zijde gewogen oefening en een bodyweight reps-oefening
(Nordic 3×4 → 3×6). Je kunt met ▶/✓ door de sets klikken en zo het paneel, de gekleurde
badge, de 2.5-stepper, de prefill en de carry-forward controleren — zonder Firebase.

## Testen

- `npm test` (node:test) voor `progress.js` en `strength-ui.js`.
- Handmatige check in `demo-progressive.html`.
```
