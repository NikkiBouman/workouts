# Hartslag bijhouden tijdens workouts — ontwerp

Datum: 2026-10-29

## Doel

Tijdens een oefening de live hartslag op het workout-scherm tonen, en de hartslag
opslaan per set, per oefening en per workout — zónder rustmomenten mee te tellen.
Uiteindelijk een hartslag-curve per workout kunnen tekenen (dashboard).

Buiten scope: hartslag uit Google Health / Health Connect halen (onderzocht, niet
haalbaar voor een web-app; zie gesprek). Handmatig HR invoeren achteraf. Cardio
per-blok HR-uitsplitsing (cardio krijgt alleen HR op sessieniveau).

## Uitgangspunt (bestaande code)

- HR-koppeling bestaat al: standaard Heart Rate Service `0x180D` / meting `0x2A37`,
  via `hrConnect()` / `onHeartRate()`; live waarde in `currentHR`.
- Live HR wordt nu alleen getoond op het cardio-scherm (`runHrValue`) en in de bovenbalk.
- HR wordt nergens opgeslagen.
- Sessie-datamodel: `sessions/{id}` = `{ date, workoutId, workoutName, totalSeconds,
  exercises: [{ exerciseId, name, type, measureBy, weighted, perSide,
  sets: [{ weight, reps, duration, speed, side }] }] }`.
- Begeleide flow (`runnerStrengthMode`):
  - **Duur-oefeningen**: expliciete timer (`strStartTimer` → `strTimerActive` →
    einde bij `rem <= 0`). Actieve periode is exact bekend.
  - **Rep-oefeningen**: geen start/stop van de fysieke set. Scherm toont "Set 1/3",
    gebruiker tikt ✓ (`strCheckBtn` → `strNextSet()`). Lifting en rust zijn nu niet
    te onderscheiden.

## De rust-vraag

Rust uitsluiten kan alleen als de app weet wanneer een set actief is.

- Duur + cardio: al bekend (timer / run-timeline).
- Rep-oefeningen: **niet** bekend → we voegen een expliciet startsignaal toe.

## Oplossing

### 1. Start-set-knop voor rep-oefeningen

Alleen wanneer een HR-monitor verbonden is: rep-oefeningen tonen eerst de ▶-knop
(net als duur-oefeningen die al hebben). Flow:

- ▶ "start set" → HR-sampling aan, ▶ verbergen, ✓ tonen.
- reps/kg aanpassen met de bestaande steppers.
- ✓ → HR-sampling uit, aggregaten berekenen, set loggen (`strNextSet()`).

Zónder HR-monitor blijft de oude flow (meteen ✓, geen extra tik, `hr: null`).

### 2. Live HR op het krachtscherm

Nieuw element `strHrValue` (naast `strWeight`), stijl zoals `runHrValue`
(❤ + bpm, rood). Alleen zichtbaar als HR verbonden. Wordt bijgewerkt in `onHeartRate()`.

### 3. Eén HR-sampler voor alle actieve periodes

Een actief "segment" wordt gestart/gestopt door:

- rep-set: ▶ → start, ✓ → stop
- duur-set: timer start → start, timer-einde → stop
- cardio-run: run start → start, run stop → stop

In `onHeartRate()`: als er een actief segment is én sinds de laatste meting ≥ 2 s
verstreken is, push `[tRelSec, bpm]` (tRelSec = seconden sinds segmentstart).
Downsamplen op ~1 meting per 2 s houdt de opslag klein. Bij pauze (`togglePause`)
pauzeert sampling. Bij HR-disconnect midden in een segment: segment netjes afsluiten
met wat er is; geen samples → `hr: null`.

### 4. Datamodel-uitbreiding

Per set (optioneel veld, weggelaten/`null` als er geen HR is):

```
hr: {
  avg: number,            // gemiddelde bpm over het actieve venster
  max: number,
  min: number,
  startOffsetSec: number, // seconden vanaf workout-start (voor de curve)
  samples: [[tRelSec, bpm], ...]
}
```

Per oefening (`session.exercises[i]`): afgeleid bij opslaan → `hrAvg`, `hrMax`.
Per sessie: afgeleid → `hrAvg`, `hrMax`. Cardio-run: `hr` op sessieniveau
(zelfde vorm), want cardio heeft `blocks` i.p.v. `sets`.

Opslag-inschatting: rep-set ~30 s → ~15 paren; 20 sets → ~300 paren → enkele KB's.
Rust wordt niet gesampled, dus C is hiermee juist goedkoop.

### 5. HR in de historie

In de recente-sessies / detail-weergave (waar sets al getoond worden) HR avg/max
per oefening en per workout tonen waar beschikbaar.

### 6. HR-curve per workout (de "C"-opbrengst)

In de sessie/grafiek-detailweergave een lijngrafiek van de samples. De curve wordt
gestikt uit de set-samples via `startOffsetSec + tRelSec`; rustpauzes verschijnen als
gaten op de tijdas (losse actieve segmenten). Stijl volgt de bestaande grafieken.

## Architectuur / modulegrenzen

Pure HR-rekenlogica in een nieuw `src/hr.js` (aggregaten uit samples, curve stitchen),
met unit-tests in `test/hr.test.mjs` — zelfde patroon als `src/progress.js` +
`test/progress.test.mjs`. De BLE/DOM-glue (sampler, knoppen, live display) blijft in
`index.html`.

## Volgorde (incrementeel, elk los werkend)

1. Live HR op het krachtscherm.
2. Start-set ▶ voor rep-oefeningen (gated op HR verbonden).
3. Eén HR-sampler voor actieve periodes.
4. `src/hr.js` + tests: aggregaten en curve-stitching.
5. HR aan sets/oefeningen/sessie hangen bij opslaan.
6. HR avg/max in de historie tonen.
7. HR-curve per workout in de detailweergave.

## Edge cases

- Geen HR verbonden → alles werkt, `hr: null`, rep-sets houden één-tik-flow.
- HR-disconnect midden in set → partiële samples behouden of `null`.
- Handmatige sessie-invoer (niet-begeleid) → geen HR.
- Pauze → sampling pauzeert, telt niet als actief.
