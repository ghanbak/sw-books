# <app-name>

<one-line description>

Built with Expo (React Native) + <backend, e.g. Supabase>.

## Stack

- **Framework:** Expo SDK <NN> (managed / CNG workflow), Expo Router, React Native <x.y>, TypeScript (strict)
- **Lint / format:** Biome (not ESLint/Prettier)
- **Test:** Vitest
- **Builds:** EAS Build + Submit

## Setup & Build

### Install conventions

- **`npx expo install <pkg>`** for any native or Expo-versioned package — it pins
  SDK-compatible versions. Do **not** use plain `npm install` for those.
- `npm install` / `npm i -D <pkg>` only for pure-JS dev dependencies.
- Always prefix the Expo CLI with **`npx`** (`npx expo …`) — never a bare `expo`.
- Transitive-dependency CVEs: pin the fix via `package.json` `overrides`, then
  `npm install` and `npm audit` to confirm. Example:
  ```jsonc
  "overrides": { "shell-quote": "1.8.4" }
  ```

### Day-to-day Expo commands

```bash
npx expo start                 # Metro; open the dev build (NOT Expo Go — see note)
npx expo run:ios               # build + install the dev client on the iOS simulator
npx expo run:android           # build + install on an Android emulator/device
npx expo prebuild --clean      # regenerate ios/ + android/ from app.json (they're gitignored)
npx expo-doctor                # diagnose dependency / config issues
```

> **This app needs a dev build, not Expo Go.** It ships custom native modules, and Expo Go
> only bundles Expo's own native code (you'd get `RN<Module> could not be found`). Build the
> dev client once with `npx expo run:ios`, then iterate with `npx expo start`. On this setup,
> use the **iOS simulator** (a physical device can't reach the Metro dev server).

### iOS / CocoaPods workarounds

```bash
# Regenerate native iOS project + install pods (ios/ is gitignored / CNG):
npx expo prebuild -p ios --clean
pod install --project-directory=ios
```

- **`Encoding::CompatibilityError` during `pod install`** → your shell locale isn't UTF-8.
  One-shot fix: prefix the command with `LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8`. Permanent:
  add those `export`s to `~/.zshrc`.
- **Stale podspecs** (a pod "not found" that should exist) → `pod repo update`, then retry.
- **Clean slate** → `npx expo prebuild --clean` regenerates `ios/` from scratch (faster/safer
  than hand-deleting Pods, since `ios/` isn't tracked).
- **"Swift pod X depends on Y/Z which do not define modules"** → opt the offending pods into
  modular headers via a `withDangerousMod` config plugin (`:modular_headers => true`). See
  `plugins/` for the pattern if present.
- **Verify before a cloud build:** a local `prebuild` + `pod install` catches Podfile/plugin
  mistakes in seconds instead of a ~15-20 min EAS failure.

### Android / Gradle workarounds

> General guidance — adjust to your environment.

- **Prereqs:** Android Studio + SDK, **JDK 17**, with `ANDROID_HOME` and `JAVA_HOME` set.
- Build/run: `npx expo run:android` (emulator running or device via USB + debugging on).
- **Gradle resets:** `cd android && ./gradlew clean` (or `--no-build-cache`); stop a stuck
  daemon with `./gradlew --stop`. Regenerate native project: `npx expo prebuild --clean -p android`.
- **SDK licenses:** `sdkmanager --licenses` (accept all) if a build complains about licenses.
- **Version mismatches:** align `compileSdk` / `buildToolsVersion` / JDK with the Expo SDK's
  expectations (`npx expo-doctor` flags drift).

### EAS builds

```bash
# Device build to test before shipping (Release config). First time on a new iPhone:
eas device:create
eas build --profile preview --platform ios

# Production:
eas build --profile production --platform ios --auto-submit      # build + TestFlight/App Store
eas build --profile production --platform android --auto-submit   # build + Play track
```

- `appVersionSource: "remote"` + `autoIncrement` → EAS owns build numbers; don't bump by hand.
- JS-only change? Ship OTA: `eas update --branch production`. Native change → full build.

## Project layout

```
app/            Expo Router routes (file-based)
components/     Shared components
hooks/          Custom hooks
lib/            Clients, types, pure logic (unit-tested)
plugins/        Expo config plugins (native config — never hand-edit ios/ or android/)
```

## Conventions

- `ios/` and `android/` are **gitignored** — regenerated from `app.json` on every prebuild.
  Do native config through `app.json` + config plugins, never by editing the native projects.
- Biome for lint/format; `npx biome check --write .`.
- Pure logic lives behind thin native-adapter boundaries so it's testable without a device.
