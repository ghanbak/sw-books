# iOS release — App Store Connect (manual steps)

EAS automates the *build + upload*; these are the **human** steps in Apple's portals that
EAS can't do for you. Do the one-time setup once per app, then the per-release steps each ship.

## One-time account + app setup

1. **Apple Developer Program** — enroll ($99/yr): https://developer.apple.com/programs/.
   Required for TestFlight and the App Store (a free account can't distribute).
2. **Bundle ID** — either let EAS create/manage it during `eas build` (it offers to), or
   create it manually at developer.apple.com → Certificates, IDs & Profiles → Identifiers.
   Must match `ios.bundleIdentifier` in `app.json`.
3. **Create the app record** in App Store Connect (https://appstoreconnect.apple.com) →
   My Apps → **+** → New App:
   - Platform iOS, primary language, the bundle ID, an **SKU** (any unique string), name.
4. **Collect the three `eas.json` submit values:**
   - `appleId` — your Apple account email.
   - `appleTeamId` — 10-char Team ID (developer.apple.com → Membership).
   - `ascAppId` — the **numeric** App ID from the app record (App Store Connect → App
     Information → "Apple ID", a number like `6766580620`).
5. **Signing credentials** — let EAS manage them (recommended): it creates/stores the
   distribution cert + provisioning profile on first `eas build`. Just log in when prompted.

## Per-release: TestFlight (beta)

- After `eas build --profile production --platform ios --auto-submit` (or `eas submit`), the
  build lands in App Store Connect → TestFlight after ~10-30 min of processing.
- **Export compliance**: set `ios.infoPlist.ITSAppUsesNonExemptEncryption: false` in
  `app.json` if you only use standard HTTPS — avoids being asked every build.
- **Internal testers** (up to 100, members of your team): no review, available immediately.
- **External testers** (up to 10k via public link/groups): require a **Beta App Review**
  (usually quick) before the first build is testable.

## Per-release: App Store submission

App Store Connect → your app → prepare a version. Apple requires:
- **Screenshots** for required device sizes (6.7"/6.9" iPhone at minimum; iPad if you support it).
- **Description, keywords, support URL, marketing URL** (optional).
- **Privacy Policy URL** (required).
- **App Privacy** questionnaire ("nutrition labels") — declare data collection/usage.
- **Age rating** questionnaire.
- **Account deletion** — if the app has accounts, you must provide an in-app way to delete the
  account (Apple guideline 5.1.1(v)). TestFlight doesn't require it; the App Store does.
- Pricing & availability, then **Submit for Review**.

## Gotchas

- The numeric `ascAppId` ≠ the bundle ID — submit needs the number.
- First submission can't be auto-created by EAS if the app record doesn't exist — create the
  record (step 3) first.
- Build processing "stuck" >1h usually means an export-compliance or missing-metadata hold —
  check the build's status in the TestFlight tab.
