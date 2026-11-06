# EAS Build + Submit

Cloud build/submit for Expo via [EAS](https://docs.expo.dev/build/introduction/).

## `eas.json` — three profiles

```jsonc
{
  "cli": {
    "version": ">= 18.0.0",
    "appVersionSource": "remote"   // EAS owns the build number; don't hand-bump it
  },
  "build": {
    "development": {
      "developmentClient": true,    // dev client (Metro), not a standalone app
      "distribution": "internal",
      "ios": { "simulator": true }  // runs on the iOS simulator
    },
    "preview": {
      "distribution": "internal",   // ad-hoc device build, no store
      "ios": { "resourceClass": "m-medium" }
    },
    "production": {
      "distribution": "store",
      "autoIncrement": true,        // bumps build number each build (paired with remote appVersionSource)
      "ios": { "resourceClass": "m-medium" }
    }
  },
  "submit": {
    "production": {
      "ios": {
        "appleId": "<apple-id-email>",
        "ascAppId": "<app-store-connect-numeric-app-id>",
        "appleTeamId": "<10-char-team-id>"
      },
      "android": {
        "serviceAccountKeyPath": "./google-service-account.json",  // gitignored
        "track": "internal"
      }
    }
  }
}
```

Notes:
- **`appVersionSource: "remote"` + `autoIncrement`** = EAS is the source of truth for build
  numbers. Don't edit `ios.buildNumber` / `android.versionCode` by hand.
- **Pin the build image only when you must** (e.g. to work around a toolchain bug). Add
  `"image": "<name>"` to a profile's `ios`. Available images + their Xcode versions:
  https://docs.expo.dev/build-reference/infrastructure/ — and remove the pin once the
  reason for it is gone (it's scaffolding, not config).
- Keep secret keys (Android service account, etc.) **gitignored**.

## Build commands

```bash
# Dev client (simulator)
eas build --profile development --platform ios

# Preview: real device build to smoke-test before shipping (Release config — exercises the
# same archive path as production). Install via the link/QR EAS prints.
eas build --profile preview --platform ios

# First time on a given iPhone: register its UDID, or an internal build won't install
eas device:create
```

## Production → store

```bash
# Build + submit in one step
eas build --profile production --platform ios --auto-submit

# Or build, then submit separately (lets you inspect the build first)
eas build --profile production --platform ios
eas submit --profile production --platform ios
```

Android is the same with `--platform android`. After upload, App Store Connect takes
~10-30 min to process before a build appears in TestFlight; Google Play similar for tracks.

## OTA updates (JS-only changes)

For pure JS/asset changes with no native change, ship over-the-air instead of a full build:

```bash
eas update --branch production --message "<what changed>"
```

Use a full build for anything touching native code, new native deps, config plugins, app
icon/splash, or store metadata.

## Pre-build local verification (cheap insurance)

Before spending a ~15-20 min cloud build on a native/config change:

```bash
npx expo prebuild -p ios --clean        # regenerate ios/ from app config + plugins
pod install --project-directory=ios     # confirm pods integrate (see pitfalls for UTF-8 fix)
# optional: confirm a setting resolved, e.g.
xcodebuild -showBuildSettings -target <Pod> | grep <SETTING>
```
