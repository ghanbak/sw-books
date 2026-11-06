---
name: new-expo-app
description: >-
  Set up a new Expo / React Native mobile app from scratch — project scaffold,
  EAS Build/Submit config, iOS & Android build workarounds, and App Store Connect
  + Google Play Console release steps. Use whenever the user is starting a new
  Expo or React Native app, setting up or debugging EAS builds, writing eas.json,
  preparing a TestFlight / App Store or Google Play submission, or hitting iOS
  CocoaPods / `pod install` or Android Gradle build failures in an Expo project —
  even if they don't say "Expo" explicitly.
---

# new-expo-app

Set up a production-bound Expo app the way that survives contact with real builds.
The defaults here (CNG/prebuild, EAS, config plugins, Biome, Vitest) and the
pitfalls list come from shipping a real app through the iOS toolchain wringer — read
the references rather than rediscovering them at 20 minutes per failed cloud build.

## When to use this

Starting a new Expo/RN app, adding EAS, authoring `eas.json`, prepping a store
release, or debugging a native build (`pod install`, CocoaPods modular-header errors,
Gradle, Xcode/Swift compiler crashes). It's fine to use just one section — e.g. only
the store steps, or only the pitfalls — without doing a full from-scratch setup.

## Operating principles (why the defaults are what they are)

- **CNG / prebuild is the model.** `ios/` and `android/` are generated from `app.json`
  and should be **gitignored**. Never hand-edit native projects — they get blown away on
  the next `prebuild`. Express native config through **app config + config plugins**.
- **`npx expo install`, not `npm install`,** for any native or Expo-versioned package —
  it picks versions matched to the installed SDK. Plain `npm install` is only for pure-JS
  dev deps. Always prefix Expo CLI with `npx` (`npx expo …`), never a bare `expo`.
- **Verify native changes locally before a cloud build.** EAS builds cost ~15-20 min
  each; a local `prebuild` + `pod install` catches Podfile/plugin mistakes in seconds.
- **Spike the *real* build config.** A Debug simulator build compiles with `-Onone` and
  hides Release-only compiler failures. Validate native dependency choices with an actual
  EAS (or local Release archive) build before declaring them good.
- **Read the raw logs.** Native build failures surface as "unknown error" in summaries;
  the real `error:` is in the raw Xcode/Gradle log (xcpretty truncates it).

## Workflow

### 1. Scaffold

```bash
npx create-expo-app@latest <app-name>        # TypeScript + Expo Router template by default
cd <app-name>
npx expo install expo-router                  # if not already in the template
```

Then establish the toolchain this skill assumes:
- **TypeScript strict** (`"strict": true` in tsconfig).
- **Biome** for lint + format (not ESLint/Prettier): `npm i -D --save-exact @biomejs/biome && npx biome init`. Biome defaults to **tab** indentation — let it normalize JSON/TS consistently.
- **Vitest** for unit tests of pure logic (`environment: 'node'`, `@` path alias mirroring tsconfig). Keep native-coupled modules behind a thin boundary so logic stays testable without a device (see `references/pitfalls.md` → "Testable boundaries").

### 2. App config (`app.json` / `app.config.ts`)

Set: `ios.bundleIdentifier`, `android.package`, `scheme`, `newArchEnabled`,
icon/splash, and the plugins you need. Common plugins: `expo-router`,
`expo-build-properties` (e.g. `ios.deploymentTarget`), `expo-camera`, auth plugins.
For native settings with no plugin surface, write a small `withDangerousMod` config
plugin under `plugins/` (see `references/pitfalls.md` for a battle-tested example).

### 3. EAS Build + Submit

Install/init, then author the three-profile `eas.json`. **Full config, commands, and
device registration are in `references/eas-and-builds.md`** — read it before writing
`eas.json` or running a build.

```bash
npm i -g eas-cli   # or: npx eas-cli@latest
eas login
eas build:configure
```

### 4. Generate the project's own README

Drop **`assets/project-readme-template.md`** into the new repo as `README.md` (or merge
its **Setup & Build** section into an existing one), then fill the `<…>` placeholders. It
gives future-you the Expo commands, install conventions, and the iOS/Android build
workarounds in-repo, so they travel with the project.

### 5. Store submission (when ready to ship)

- **iOS / TestFlight / App Store** → `references/app-store-connect.md` (manual Apple steps + the `eas.json` `submit` values to collect).
- **Android / Google Play** → `references/google-play-console.md` (manual Google steps + the service-account JSON for `eas submit`).

## Reference files

Read the one(s) relevant to the task:

- **`references/eas-and-builds.md`** — `eas.json` profiles (`development`/`preview`/`production`), `appVersionSource`/`autoIncrement`, build & submit commands (with/without `--auto-submit`), `eas device:create`, OTA `eas update`.
- **`references/pitfalls.md`** — the hard-won gotchas: floating Podfile.lock pod versions, CocoaPods modular-header errors (Google/Firebase Swift pods), `withDangerousMod` plugin pattern, native-lib-vs-toolchain maturity (the VisionCamera/Nitro/Xcode-26 saga and the Apple-Vision swap), deployment-target as load-bearing, dev-build-not-Expo-Go, `npm overrides` for vuln patches, testable boundaries.
- **`references/app-store-connect.md`** — Apple Developer Program, app record, TestFlight, App Store listing + privacy/export-compliance/account-deletion.
- **`references/google-play-console.md`** — Play Developer account, service account for EAS, testing tracks, Data Safety + content rating, Play App Signing.

## Asset

- **`assets/project-readme-template.md`** — the Setup & Build README to drop into each new project (Expo commands, `npx expo install` conventions, iOS `pod install` workarounds, Android/Gradle workarounds).
