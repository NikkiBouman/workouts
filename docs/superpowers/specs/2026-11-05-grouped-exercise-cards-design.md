# Gegroepeerde oefeningkaarten + edit/delete in detail-view

**Datum:** 2026-11-05
**Status:** Goedgekeurd ontwerp

## Doel

De oefeningenlijst op het home-scherm groeperen in categorieën (Legs, Core,
Plyometrics, Stretch, Cardio), de kaartjes omzetten naar een verticale layout
met 3 kolommen op mobiel, en de ✏️/🗑-knoppen van de kaart naar de detail-view
verplaatsen. Verwijderen en riskante aanpassingen krijgen een waarschuwing over
de impact op eerdere sessies.

## Achtergrond / huidige situatie

- Oefeningen staan hardcoded in `DEFAULT_EXERCISES` (`index.html:717`) en worden
  één keer per gebruiker naar Firestore geseed via `seedDefaults` (`src/db.js:57`),
  met `DEFAULTS_VERSION` als gate. Daarna leeft de lijst per-gebruiker in Firestore.
- `renderExerciseList()` (`index.html:842`) rendert één platte lijst van
  horizontale `.exercise-card`'s, elk met een ✏️- en 🗑-knop.
- Het bestaande `type`-veld (`cardio` / `strength` / `stretch`) stuurt interne
  logica aan (set- vs. timer-scherm, of gewicht mogelijk is, welk icoon) en is
  **niet** gelijk aan de gewenste groepen. Voorbeelden: Box Jump is
  `type:'strength'` maar hoort in **Plyometrics**; Back Extension / Chinese Plank /
  Glute-Ham Isometric zijn `type:'strength'` maar horen in **Core**.
- Een gelogde sessie bewaart een **snapshot** van `{exerciseId, name, type,
  measureBy, weighted, perSide, sets}` (`index.html:2623`). De ruwe set-data blijft
  dus altijd bewaard.
- **Maar** de detail-view/grafiek interpreteert álle sessies met de **huidige**
  oefening-flags: `seriesForExercise(loadHistory(), id, !!ex.perSide, metric)`
  (`index.html:1039`) en `metricFor(ex)` (`src/progress.js:3-8`). Het wijzigen van
  `perSide` / `weighted` / `measureBy` / `type` herinterpreteert daarmee de
  geschiedenis in de weergave.
- `deleteExercise(id)` (`index.html:871`) verwijdert alleen de oefening; sessies
  die ernaar verwijzen blijven bestaan maar worden onbereikbaar via de detail-view
  (`getExercise` → undefined → `renderExerciseDetail` stopt), en workouts die de
  oefening bevatten tonen `'?'` (`index.html:826`).

## Scope

### 1. Groepering (vaste mapping in code)

Nieuwe constante bovenin `index.html`, los van `type`. De array bepaalt alleen
**lidmaatschap** en **groepsvolgorde**; de volgorde binnen een groep wordt bij het
renderen alfabetisch op naam gesorteerd.

```js
const EXERCISE_GROUPS = [
  { name: 'Legs', ids: [
    'ex_ball_hamstring_curl','ex_bulgarian_split_squat','ex_deadlift',
    'ex_hamstring_curl','ex_leg_extension','ex_lunges','ex_nordic_hamstring_curl',
    'ex_one_leg_calf_raise','ex_single_leg_calf_press','ex_single_leg_deadlift',
    'ex_single_leg_press','ex_sliding_leg','ex_split_squat','ex_squat','ex_step_up',
  ]},
  { name: 'Core', ids: [
    'ex_back_extension','ex_chinese_plank','ex_glute_ham_isometric','ex_plank',
  ]},
  { name: 'Plyometrics', ids: ['ex_box_jump'] },
  { name: 'Stretch', ids: [
    'ex_leg_up_hamstring_stretch','ex_lying_glute_stretch','ex_kneeling_hip_flexor',
    'ex_seated_hamstring_stretch','ex_extended_leg_hip_bridge','ex_quadriceps_lying_stretch',
  ]},
  { name: 'Cardio', ids: [
    'ex_hardlopen','ex_cross_trainer','ex_cycling','ex_rope_jump',
  ]},
];
```

- **Groepsvolgorde:** Legs → Core → Plyometrics → Stretch → Cardio.
- **Binnen groep:** alfabetisch op naam bij het renderen.
- **"Overig":** elke oefening-id uit `loadExercises()` die in geen enkele groep
  voorkomt (bv. een later toegevoegde custom oefening) wordt verzameld in een
  extra "Overig"-groep **onderaan**. Zo verdwijnt niets. Deze groep wordt alleen
  getoond als er zulke oefeningen zijn.
- Als een id in de mapping niet (meer) in `loadExercises()` zit (bv. verwijderd),
  wordt die simpelweg overgeslagen.

### 2. Nieuwe oefening "Plank" (Core)

Toevoegen aan `DEFAULT_EXERCISES` en `DEFAULTS_VERSION` ophogen van `2` → `3`,
zodat de oefening bij de bestaande gebruiker wordt geseed (merge).

```js
{ id:'ex_plank', name:'Plank', imageUrl:'images/plank.png', type:'strength',
  perSide:false, measureBy:'duration', weighted:false, bleConnectable:false },
```

Afbeelding `images/plank.png` is al toegevoegd.

### 3. Kaart-layout (verticaal, 3 kolommen op mobiel)

Alleen de kaarten in de **home-lijst** (`renderExerciseList`) veranderen. De
horizontale kaarten in de **workout-picker** (`index.html:1638`) blijven ongemoeid.

- `#exerciseList` wordt een grid:
  - mobiel: `grid-template-columns: repeat(3, 1fr)`
  - breder scherm (media query, bv. ≥600px): `repeat(auto-fill, minmax(130px, 1fr))`
  - `gap: ~0.5rem`
- Nieuwe verticale kaart-structuur (nieuwe CSS-klasse, bestaande `.exercise-card`
  voor de picker blijft bestaan):
  1. Afbeelding/gif bovenin — vult de kaartbreedte, vaste verhouding,
     `object-fit: cover`. Fallback naar 💪/🧘/🏃-placeholder als er geen `imageUrl` is
     (zoals nu via `onerror`).
  2. **Naam** — mag wrappen tot **max 2 regels**; rijen krijgen gelijke hoogte
     zodat het grid netjes uitlijnt.
  3. Regel 2: `💪 Kracht` / `🧘 Stretch` / `🏃 Cardio` (icoon + mensvriendelijk type).
  4. Regel 3: kleine badges **per zijde** en/of **gewicht**, alleen getoond als
     van toepassing (`ex.perSide`, `ex.weighted`).
- **Geen ✏️/🗑 op de kaart meer.** De hele kaart blijft klikbaar naar de detail-view.

### 4. Edit/delete in de detail-view + history-waarschuwingen

In `#exDetailHeader` (`index.html:966`) komen ✏️ en 🗑 **rechts uitgelijnd op
dezelfde hoogte als de naam**.

**✏️ Aanpassen** opent dezelfde editor als nu (`openExerciseEditor(id)`). Bij
**opslaan** (`saveExercise`) wordt gecontroleerd of de wijziging riskant is:

- **Veilig** (geen waarschuwing): wijziging van `name` en/of `imageUrl`.
- **Riskant** (waarschuwing + bevestiging) als er **≥1 sessie** voor deze oefening
  bestaat **én** minstens één van deze velden wijzigt t.o.v. het opgeslagen record:
  `perSide`, `weighted`, `measureBy`, `type`.
  - Reden: deze flags bepalen hoe de grafiek/tabellen álle eerdere sessies
    interpreteren. Bv. reps→duur zet de grafiek op een veld dat in oude sets leeg
    is (platte/lege grafiek); per-zijde aanzetten splitst oude niet-per-zijde sets
    verkeerd in links/rechts. De ruwe data blijft bewaard, alleen de weergave wijzigt.
  - Melding (`confirm`): *"Je hebt al N sessie(s) met deze oefening. Je wijzigt
    [per zijde / gewicht / meeteenheid / type]. Dat kan de grafiek en tabellen van
    eerdere sessies anders of leeg tonen (de data zelf blijft bewaard). Toch opslaan?"*
    De opgesomde velden zijn de daadwerkelijk gewijzigde riskante velden.
  - Bij annuleren: terug naar de editor, niets opgeslagen.

**🗑 Verwijderen** telt eerst de sessies en workouts die de oefening gebruiken:

- `sessionCount` = aantal sessies met een entry `exerciseId === id` (`loadHistory()`).
- `workoutCount` = aantal workouts met een entry `exerciseId === id` (`loadWorkouts()`).
- Met gebruik (`confirm`): *"'<naam>' verwijderen? Gebruikt in N sessie(s) en M
  workout(s). De geschiedenis blijft bewaard maar is daarna niet meer te openen via
  deze oefening, en die workouts tonen '?' op die plek. Zeker weten?"*
  (sessie/workout-deel alleen tonen als het aantal > 0 is.)
- Zonder gebruik: *"'<naam>' verwijderen? Zeker weten?"*
- Na bevestigen: `window.DB.deleteExercise(id)` en terug naar home (`showView('viewHome')`).
- `ex_hardlopen` blijft onverwijderbaar (geen 🗑 tonen), zoals nu.

### 5. Expliciet buiten scope / niet aangeraakt

- Het `type`-veld en de set/timer-logica.
- De Firestore-structuur en datamodel van sessies.
- De grafiek zelf (`src/chart.js`, `src/progress.js`).
- De workout-picker-kaarten.

## Testen

- Bestaande tests (`test/*.mjs`) moeten blijven slagen.
- Handmatige verificatie in de app: groepen in juiste volgorde, 3 kolommen op
  mobiel, Plank verschijnt in Core, edit/delete-knoppen in detail rechts naast de
  naam, riskante edit toont waarschuwing, delete toont sessie/workout-telling.

## Open punten

Geen. Alle ontwerpkeuzes zijn bevestigd.
