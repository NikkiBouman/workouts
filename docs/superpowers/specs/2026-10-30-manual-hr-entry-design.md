# Handmatige hartslag per set/blok invoeren — ontwerp

Datum: 2026-10-30

## Doel

Bij het handmatig loggen van een sessie (een workout die je net hebt gedaan) een
hartslag-waarde per set/blok kunnen intikken. Voorbeeld: bij 5 km/h was het 60, bij
12 km/h was het 120. Dit vult het gat dat in het eerste HR-ontwerp (2026-10-29)
expliciet buiten scope stond ("Handmatig HR invoeren achteraf").

## Uitgangspunt (bestaande code)

- Handmatig loggen gebeurt per oefening op de detailpagina via `toggleManualAdd()` /
  `buildManualAddForm()` / `renderManualRows()` / `saveManualLog()` (index.html).
  Elke regel is een set (kracht) of blok (cardio). Kolommen komen uit
  `manualColsFor(ex, isDur)`: kg/reps, duur, of per-been L/R, plus bij cardio snelheid.
  Er is **geen** HR-veld.
- HR-datamodel per set: `hr = { avg, max, min, startOffsetSec, samples: [[tRelSec, bpm]] }`,
  of afwezig/`null`. Aggregatie set→oefening→sessie via `window.HR.combineHr()` (pooldt
  samples). De curve komt uit `window.HR.buildHrCurve()` → per segment een polyline in
  `hrCurveSvg()` in de historielijst (tik op ❤).
- Bij bewerken behoudt `carrySetHr()` eerder live-gesamplede HR op de herbouwde sets.
- `combineHr()` geeft nu `null` als er geen samples zijn — dus een HR-object zonder
  samples telt niet mee in de aggregatie.

## Reikwijdte

- HR-veld per regel voor **cardio én kracht** (bevestigd).
- Handmatige HR voedt **altijd** het ❤ gem/max in de historie, **en** voor cardio een
  stap-curve (bevestigd). Kracht heeft geen tijd-as → alleen gem/max, geen curve.

Buiten scope: duur-gewogen gemiddelde (het gemiddelde is het ongewogen gemiddelde over
de blokken/sets), de demo-preview `demo.html`, en de set-/vergelijkingstabel (tonen geen HR).

## Datamodel — hoe één getal zich gedraagt

Per set, als een HR-waarde `b` is ingevoerd:

- **Cardio-blok** (heeft een duur): `{ avg: b, max: b, min: b, startOffsetSec: O,
  samples: [[0, b], [dur, b]] }`, waarbij `O` = som van de duren (sec) van de
  voorgaande cardio-blokken in dezelfde oefening. Twee gelijke samples over de blokduur
  → een horizontaal lijnstuk op niveau `b`. Opeenvolgende blokken = losse vlakke
  segmenten op oplopende/dalende hoogte → de stap-curve.
- **Kracht-set** (geen tijd-as): `{ avg: b, max: b, min: b }` — **zonder** `samples` en
  `startOffsetSec`. Voedt gem/max, maar `buildHrCurve()` slaat sample-loze hr over →
  geen curve voor kracht.

## Pure logica in `src/hr.js` (+ tests)

- Nieuwe `manualHr(bpm, { startOffsetSec = null, durationSec = null } = {})`:
  - `null` bij `bpm` leeg/`NaN`/`<= 0`.
  - anders `{ avg, max, min }` met `b = Math.round(bpm)`; als `startOffsetSec != null`
    ook `startOffsetSec` + `samples` (`[[0,b],[durationSec,b]]`, of `[[0,b]]` als
    `durationSec` niet `> 0`).
- `combineHr()` krijgt één fallback: een hr-object zonder bruikbare samples maar met een
  numerieke `avg` telt als één meetpunt `[0, avg]`. Zo blijven set→oefening→sessie
  aggregaten kloppen, ook voor sample-loze (kracht-)HR.
- Nieuwe unit-tests: `manualHr` (cardio-vorm met samples, kracht-vorm zonder, leeg→null),
  en `combineHr` dat sample-loze objecten meetelt en mengt met sample-objecten.

## UI — HR-kolom in het formulier

- `manualColsFor()`: voor elk type een extra kolom `{ key: 'hr', label: '❤ bpm', w: ~56 }`.
- `renderManualRows()` rendert deze generiek al (number-input → `updateManualRow(i,'hr',…)`);
  placeholder "bpm". Bij per-been-mét-gewicht (al 4 velden) moet de regel kunnen
  wrappen/scrollen op smalle schermen.
- Per-been oefeningen: één HR-getal per regel geldt voor **beide** kanten (L én R set).

## Opslaan (`saveManualLog`)

- Bij elke set `hr` hangen via `manualHr(...)`:
  - cardio: `startOffsetSec` = lopende som van voorgaande blokduren; `durationSec` = deze blokduur.
  - kracht: geen offset/duur (sample-loos).
- Aggregatie `newEx.hrAvg/hrMax` (via `combineHr(sets.map(s => s.hr))`) en
  `session.hrAvg/hrMax` nu **ook** in de nieuwe-sessie-tak (die zet nu geen HR).
- **Bewerken van een live-gesamplede sessie:** het veld toont de huidige `avg`. Verander
  je het getal niet (gelijk aan de via `carrySetHr` herstelde `avg`), dan blijven de echte
  samples en de fijne curve behouden. Verander je het wél, dan vervangt de handmatige
  waarde die set-hr. Zo wordt een echte meting nooit per ongeluk overschreven.

## `setsToRows()`

Vult het HR-veld terug bij bewerken uit `set.hr.avg` (van welke kant dan ook bij per-been).

## Demo

Draaien via `index.html?demo` (in-memory `demo-db.js`, geen Firebase). `demo-db.js` krijgt
één voorbeeld-cardiosessie met per-blok HR, zodat de historie meteen een ❤ gem/max + de
stap-curve toont; de gebruiker kan daarnaast zelf via "+ Sessie toevoegen" een sessie met
HR invoeren.

## Edge cases

- Leeg HR-veld → `hr` afwezig voor die set; werkt zoals nu (`null`).
- Alleen sommige regels HR ingevuld → aggregaat over de ingevulde regels; curve toont de
  ingevulde cardio-blokken.
- Kracht-only sessie met HR → ❤ gem/max in historie, "Te weinig hartslag-data voor een
  curve." bij uitklappen (verwacht, geen tijd-as).
- Bewerken zonder het HR-veld aan te raken → bestaande (live) HR blijft intact.

## Volgorde (incrementeel)

1. `src/hr.js`: `manualHr()` + `combineHr()`-fallback, met tests.
2. `manualColsFor()` + `renderManualRows()`: HR-kolom tonen.
3. `saveManualLog()`: HR per set hangen + aggregatie in beide takken + edit-precedentie.
4. `setsToRows()`: HR terugvullen bij bewerken.
5. `demo-db.js`: voorbeeldsessie met HR; demo starten.
