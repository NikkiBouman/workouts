# Instellingen-scherm + contextuele verbindingsbalken — ontwerp

Datum: 2026-11-05

## Doel

Het maan-icoontje (thema-toggle) op het homescherm vervangen door een
instellingen-icoontje (⚙). Achter dat icoon komt een instellingen-scherm met de
dark/light-toggle én het verbinden met loopband en HR. De twee globale
verbindingsbalken verdwijnen van het homescherm (en overal waar ze nu globaal
staan); de rest van het home schuift omhoog. Verbinden kan voortaan via
Instellingen, en daarnaast contextueel op de "Start Workout"-pagina en tijdens de
run.

## Uitgangspunt (bestaande code)

- `#globalConn` (index.html ~406) is een **globale singleton**: twee `.conn`-rijen
  (Loopband + HR) die boven *elk* scherm staan, want het blok staat buiten alle
  `.view`'s, direct in `.app`. Puur statische markup — geen enkele JS toont/verbergt
  het (alleen regel 406 refereert eraan). Verwijderen is dus schoon.
- De home-header (index.html ~426–429) is een flex-rij: links de uitlog-knop
  (`#authSignOutBtn`), rechts de thema-toggle (`#themeToggle`, 🌙). `toggleTheme()`
  (index.html ~3515) zet de tekst van `#themeToggle` naar ☀️/🌙 (regel 3512).
- Verbindingsstatus wordt naar **vaste ID's** geschreven:
  - Loopband: `updateConnUI(connected)` (index.html ~3105) → `dot`, `connLabel`,
    `btnConn`, `btnDisc`.
  - HR: updater (index.html ~3447) → `hrDot`, `hrLabel`, `btnHrConn`, `btnHrDisc`;
    plus de live-BPM-regel (index.html ~3478) die `hrLabel` overschrijft met
    `❤ {bpm} bpm`.
- Een workout heeft een **hardloop-sessie** als één van zijn entries een oefening
  heeft waarvoor `usesTreadmill(ex)` waar is (cardio + `bleConnectable`). De preview
  laadt de workout in `renderPreview()` (index.html ~2071) met `w.entries`.
- De runner (`#viewRunner`, index.html ~278) is een **vaste 100dvh flex-layout**:
  `#runnerChart` (max 28vh), `#runnerControls` (flex:1), `#runBtnRow` (sticky
  bottom); in landscape wordt `#runnerLayout` een `row wrap`. De runner heeft z'n
  eigen HR-weergave (`runHrDisplay`/`runHrValue`) en eigen verbind-prompts
  (promptModal), dus hij leunt niet op de bovenbalken voor status.

## Reikwijdte

Verbindingsbalken verschijnen voortaan op precies drie plekken:

| Scherm | HR-balk | Loopband-balk |
|---|---|---|
| Instellingen | altijd | altijd |
| Start Workout (preview) | altijd | alleen als de workout een hardloop-sessie heeft |
| Runner (tijdens de workout) | altijd | alleen als de workout een hardloop-sessie heeft |

- Op de preview staan de balk(en) **direct boven de ▶ Start Workout-knop**.
- Op home, de editors en de oefening-detailpagina staan **geen** balken meer.

Buiten scope: de demo-preview `demo.html`; de onderliggende BLE/HR-verbindingslogica
zelf (alleen waar de UI wordt bijgewerkt verandert); het gedrag van `toggleTheme()`
behalve de verplaatsing van de knop.

## De kern-wijziging: balken synchroniseren via class i.p.v. ID

Omdat dezelfde balk nu op meerdere plekken tegelijk in de DOM kan staan (bv.
Instellingen is een aparte view, maar preview + runner kunnen beide een HR-balk
hebben, en we willen geen dubbele ID's), worden de balk-elementen op **classes**
gezet en updaten de update-sites álle instanties.

- Markup gebruikt classes i.p.v. ID's:
  - Loopband: `.js-conn-dot`, `.js-conn-label`, `.js-btn-conn`, `.js-btn-disc`.
  - HR: `.js-hr-dot`, `.js-hr-label`, `.js-btn-hr-conn`, `.js-btn-hr-disc`.
- `updateConnUI(connected)` en de HR-updater worden herschreven naar
  `document.querySelectorAll('.js-...').forEach(el => …)` voor dot-class, label-tekst
  en `.hidden`-toggle op de verbind/verbreek-knoppen.
- De live-BPM-regel (3478) zet alle `.js-hr-label` naar `❤ {bpm} bpm`.
- **Controle vóór wijzigen:** grep op `connLabel`, `hrLabel`, `btnConn`, `btnDisc`,
  `btnHrConn`, `btnHrDisc`, `'dot'`, `'hrDot'` om zeker te zijn dat er buiten de
  genoemde regels geen andere `getElementById`-referenties zijn (bv. knop
  disablen tijdens verbinden). Zo ja, meeverhuizen naar de class-aanpak.

### Balken staan statisch in elke view → sync is automatisch

Cruciaal: de balk-markup staat **permanent in de DOM** in elk van de drie containers
(`#viewSettings`, de preview-container, de runner-container), niet dynamisch
opnieuw gerenderd. Daardoor raken de class-updaters (die op alle `.js-...` draaien)
elke instantie bij elke statuswijziging — er is geen "status opnieuw toepassen bij
renderen"-stap nodig. Het enige per-view dynamische is het togglen van de
Loopband-balk op `hasRun`.

Om duplicatie te beperken mag één helper de markup leveren
(`connBarHtml('treadmill'|'hr', { slim })` → `.conn`/`.conn-slim`-markup met de
sync-classes), inline geplaatst bij het laden. Statische inline-markup (zoals het
oude `#globalConn`) is ook prima; de invariant is: permanent in de DOM + sync-classes.

## Instellingen-scherm (`#viewSettings`)

Nieuwe `.view` in lijn met de bestaande editor/preview-schermen en de History-API
(`showView('viewSettings')` doet de pushState al generiek).

- Header: `← Instellingen` (back-knop `onclick="showView('viewHome')"`, zelfde
  patroon als de editor-header).
- **Thema-rij:** label "Thema" + een toggle-knop die het huidige thema toont
  (🌙 Donker / ☀️ Licht) en `toggleTheme()` aanroept. Dit is de knop die van de
  home-header hierheen verhuist.
- **Loopband-balk** (altijd) via `connBarHtml('treadmill')`.
- **HR-balk** (altijd) via `connBarHtml('hr')`.

### `toggleTheme()` verhuist

De thema-knop krijgt in Instellingen een nieuw ID (bv. `#themeToggle`, verplaatst —
niet gedupliceerd). `toggleTheme()` blijft `#themeToggle` bijwerken; alleen de knop
staat nu in `#viewSettings`. De 🌙→⚙ op home is een **andere** knop.

## Home-header: ⚙ vervangt 🌙

De `#themeToggle`-knop in de home-header wordt vervangen door een gear-knop
(`⚙`, zelfde ronde 36px-styling) met `onclick="showView('viewSettings')"`. De
uitlog-knop blijft ongewijzigd. De thema-toggle zit nu in Instellingen (zie boven).

## Preview: balken boven de Start-knop

In `renderPreview()` (index.html ~2071) wordt `hasRun` bepaald:

```js
const hasRun = entries.some(e => usesTreadmill(getExercise(e.exerciseId)));
```

In de preview-markup komt vlak boven de ▶ Start Workout-knop een container met:
- de HR-balk (altijd zichtbaar);
- de Loopband-balk, waarvan de zichtbaarheid wordt getoggled op `hasRun`.

De balken erven de huidige verbindingsstatus via de class-sync, dus ze tonen
meteen correct of er al verbonden is.

## Runner: slanke herverbind-balk bovenaan

Bovenaan `#runnerLayout` (vóór `#runnerChart`) komt een `flex:0 0 auto`-container met
dezelfde balken in een **slanke** variant (`.conn-slim`: kleinere padding/tekst, geen
`margin-bottom`), zodat de vaste layout niet verschuift. HR altijd; Loopband alleen
als de workout een hardloop-sessie heeft (zelfde `hasRun`).

- Nieuwe CSS `.conn-slim` naast `.conn` (compacter).
- In landscape krijgt de container `flex:0 0 100%` zodat hij de bovenrand beslaat en
  de bestaande `row wrap`-verdeling van chart/controls/knoppen intact blijft.
- Welke workout in de runner draait is bekend (de runner start vanuit de preview met
  `previewWorkoutId`); `hasRun` wordt daar bepaald en de Loopband-balk navenant
  getoond/verborgen bij het betreden van de runner.

## Verwijderen van `#globalConn`

Het globale blok (index.html ~406–419) wordt verwijderd. De balk-instanties leven
voortaan in `#viewSettings`, de preview en de runner. Omdat niets `#globalConn`
programmatisch aanstuurt, zijn er verder geen JS-aanpassingen nodig voor de
verwijdering zelf.

## Edge cases

- **Kracht-only workout** (geen hardloop-sessie): preview en runner tonen alleen de
  HR-balk; geen Loopband-balk. Instellingen toont beide (voor algemeen verbinden).
- **Al verbonden vóór openen van een scherm:** de balken staan permanent in de DOM, dus
  de class-updater houdt ze continu in sync — bij het openen van een scherm tonen ze
  meteen de juiste status zonder extra re-render.
- **Live BPM tijdens de run:** de HR-balk-labels tonen `❤ {bpm} bpm` (regel 3478 →
  alle `.js-hr-label`), naast de eigen HR-kaart van de runner. Bewust geaccepteerde
  dubbeling.
- **Lange preview:** de balken staan boven de Start-knop (bewuste keuze), dus bij veel
  blokken kunnen ze onder de vouw vallen — geaccepteerde trade-off t.o.v. bovenaan.

## Volgorde (incrementeel)

1. **Class-refactor:** `connBarHtml()`-helper + `updateConnUI()`/HR-updater/live-BPM
   herschrijven naar class-sync. Eerst grep-controle op alle ID-referenties.
2. **Instellingen-view:** `#viewSettings` toevoegen (thema-rij + beide balken);
   thema-knop verhuizen; `toggleTheme()` ongemoeid (zelfde ID, nieuwe plek).
3. **Home-header:** 🌙-knop vervangen door ⚙ → `showView('viewSettings')`.
4. **Globale balk verwijderen:** `#globalConn` weg.
5. **Preview:** `hasRun` + balken-container boven de Start-knop; Loopband togglen.
6. **Runner:** `.conn-slim`-CSS + slanke balk bovenaan `#runnerLayout`; Loopband op
   `hasRun`.
7. Handmatig verifiëren: home (geen balken, ⚙ opent Instellingen, thema-toggle werkt),
   preview kracht-only vs. met run, runner met/zonder run, verbinden op één plek →
   status klopt op de andere.
