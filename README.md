# Lift — 5/3/1 Tracker

A Wendler 5/3/1 training log built for two people who train wherever they land.
It began as a port of a 5/3/1 spreadsheet — same maths, same numbers — but it
remembers where you left off, progresses your accessories, and fits on a phone.

## What it does

- **Two profiles.** Each person signs in with their own Google account. Logs are
  private to that account — nothing is shared between them.
- **Training maxes.** Enter an estimated 1RM per lift; the training max is a
  configurable percentage (85% by default), rounded to whatever you can load.
- **Any 5/3/1 variant.** FSL 5×5, FSL AMRAP, SSL, BBB (flat or ramping), BBS,
  Widowmaker, 5's PRO, or main work only. Every week percentage, rep target,
  warm-up and supplemental setting is editable, and edits save as your own
  template.
- **Picks up where you left off.** Opens on the next workout you owe, mid-set if
  that's where you stopped.
- **Accessories that progress themselves.** Per-day plans with sets, rep ranges,
  target weight and rest. Each shows what you did last time, and clearing the top
  of the range on every set raises the target for next time automatically.
- **Supersets.** Group adjacent accessories in the plan and they run back to
  back in the workout, with one rest after the round instead of between them.
- **Undo.** Every edit during a workout is reversible from the header, and a
  swap can always be put back to what the plan asked for.
- **Equipment swaps.** Tell it what today's gym has and swap any lift — main or
  accessory — for a same-pattern alternate. The load converts automatically so
  the cycle keeps moving, and a swap never destroys the weight you had. When a dumbbell prescription exceeds the heaviest bell
  on hand, the weight holds at the cap and the rep target rises to match, which
  is what the spreadsheet's Apartment tab did.
- **Pounds or kilograms.** Weights are stored once and converted for display, so
  switching units mid-cycle is lossless. Rounding always happens in the unit
  you're actually loading, with per-implement increments and a plate calculator.
- **Planning and sharing.** The whole four-week cycle on one screen, a print view
  for PDF or the fridge, and one-tap text export of a day, a week or a cycle.
- **End of cycle.** Reviews every rep record, estimates a new 1RM, and offers
  both Wendler's flat increment and the AMRAP-derived training max per lift —
  including a reset to 90% when you missed reps.
- **Works offline.** Installable to the home screen; logging a set never waits on
  a network.
- **Tells you which build you're on.** Settings shows version, build date and
  commit. A new deploy is offered as a banner rather than applied on its own, so
  a reload never lands in the middle of a set.

## Running it

```bash
npm install
npm run dev
```

It works immediately with no setup — that's **local mode**, where everything is
stored in the browser and nothing syncs. Good for trying it out. Add Firebase to
sync between phones.

Other commands:

```bash
npm test
```

```bash
npm run build
```

## Connecting Firebase

All free tier. You need to do steps 1–4 yourself since they involve signing into
your Google account.

1. **Create the project.** Go to <https://console.firebase.google.com>, click
   *Add project*, name it (e.g. `lift-531`). Google Analytics is not needed.
2. **Turn on Google sign-in.** In *Build → Authentication → Get started*, pick
   the *Google* provider, enable it, set a support email, save.
3. **Create the database.** In *Build → Firestore Database → Create database*,
   choose a region near you, and start in **production mode** — the rules in
   `firestore.rules` replace the defaults in step 6.
4. **Register the web app.** In *Project settings → General → Your apps*, click
   the web icon (`</>`), give it a nickname, skip hosting for now. Copy the
   `firebaseConfig` values it shows you.
5. **Paste them in.** Copy `.env.example` to `.env.local` and fill in the six
   values. Restart `npm run dev`. The sign-in screen should now offer Google.

   These values are not secrets — Firebase web config is public by design, and
   access is enforced by security rules, not by hiding the keys.

6. **Publish the security rules.** Either paste `firestore.rules` into the
   *Rules* tab in the console and publish, or:

   ```bash
   npx firebase-tools deploy --only firestore:rules
   ```

   Without this, the default production rules deny everything and the app will
   fail to load a profile.

7. **Your partner signs in.** Same URL, their own Google account, own profile.
   Nothing else to configure.

## Deploying

```bash
npm run build && npx firebase-tools deploy --only hosting
```

Bump `version` in `package.json` when you deploy something you want to be able
to point at. The build stamp shown in Settings is that version plus the build
date and the commit it was built from (`+` means the tree had uncommitted
changes), so you can always tell a phone's build from what's on GitHub.

Installed copies pick up a deploy within half an hour, or immediately via
Settings → Version → Check. The new build is never applied without being asked.

The first deploy asks you to pick the project. You'll get a
`https://<project>.web.app` URL — open it on each phone and use *Add to Home
Screen* to install it as an app.

Add that domain under *Authentication → Settings → Authorized domains* if Google
sign-in is rejected there.

## How the numbers work

The engine is pure and unit-tested against the original spreadsheet — see
[`src/lib/engine.test.ts`](src/lib/engine.test.ts), which pins every training max
and working weight the sheet produced.

- **Training max** = `round(estimated 1RM × TM% / increment) × increment`
- **Working weight** = `round(training max × set% / increment) × increment`,
  rounded in the display unit
- **Estimated 1RM** from a rep record uses Epley: `weight × (1 + reps / 30)`
- **Dumbbell cap**: when the prescription exceeds your heaviest bell, reps become
  `(estimated 1RM ÷ cap − 1) × 30`, clamped — the inverse of the same formula
- A cycle **freezes** its training maxes at the start, so editing a max never
  moves the weights of a week you're partway through

## Layout

```
src/
  lib/          pure domain logic — no React
    units.ts        kg canonical, display conversion, plate math
    engine.ts       warm-ups, main sets, supplemental, dumbbell cap
    templates.ts    the built-in 5/3/1 variants
    progression.ts  rep records, next training max, accessory suggestions
    exercises.ts    exercise library, pattern-based alternates, load conversion
    cycle.ts        building cycles, hydrating sessions, finding what's next
    share.ts        text export
  data/         Firebase init, auth, and the storage layer (local or Firestore)
  state/        the single Zustand store
  components/   shared UI, rest timer, exercise swap sheet
  screens/      Today, Cycle, Lifts, Plan, Settings
```
