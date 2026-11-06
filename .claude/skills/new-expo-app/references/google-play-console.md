# Android release — Google Play Console (manual steps)

EAS automates the *build + upload*; these are the **human** steps in Google's portals.
(Note: this project's Android path was deferred, so treat specifics as current-best-guidance
and verify against https://docs.expo.dev/submit/android/ — the shape is stable, exact UI labels drift.)

## One-time account + app setup

1. **Google Play Developer account** — register ($25 one-time):
   https://play.google.com/console/signup. Identity verification can take a day or two.
2. **Create the app** in Play Console → Create app: name, default language, app vs game,
   free/paid, declarations.
3. **App signing** — use **Play App Signing** (default): Google holds the app signing key;
   EAS uploads with an *upload* key. Let EAS manage the upload keystore (it generates/stores
   one on first `eas build`).
4. **Service account for `eas submit`** — Play submission is API-based:
   - Google Cloud Console → create a **service account** → create a **JSON key**.
   - Play Console → Users & permissions → invite the service account email, grant release
     permissions (at least "Release to testing tracks" / "Release to production").
   - Save the JSON locally (e.g. `google-service-account.json`), **gitignore it**, and point
     `eas.json` `submit.production.android.serviceAccountKeyPath` at it.
   - Full guide: https://docs.expo.dev/submit/android/.

## Per-release: testing tracks → production

Play promotes through tracks (each can require its own setup):
- **Internal testing** — fastest, up to 100 testers by email list; near-instant.
- **Closed testing** — larger invited groups; newer accounts may need a minimum number of
  testers for a period before production is unlocked.
- **Open testing** — public opt-in.
- **Production** — public.

Build/submit: `eas build --profile production --platform android --auto-submit` (set the
target `track` in `eas.json` submit config), or `eas submit --platform android`.

## Store listing + required declarations

Play won't let you release until these are complete (Play Console → your app):
- **Store listing** — title, short + full description, app icon, **feature graphic**, phone
  screenshots (tablet if supported).
- **Content rating** questionnaire (IARC).
- **Data safety** form — what data you collect/share and why (the Android analog of Apple's
  App Privacy).
- **Target audience & content** (ages), **ads** declaration, **government apps** if relevant.
- **Privacy Policy URL** (required, especially with accounts or sensitive permissions).
- **App access** — if features are behind login, provide test credentials for review.

## Gotchas

- The **first upload** for a new app sometimes must be done so Play registers the package; EAS
  submit with the service account handles this once permissions are granted.
- `android.package` in `app.json` is the permanent application ID — choose carefully; it can't
  change after publishing.
- `versionCode` is integer and must increase each upload — let EAS `autoIncrement` own it.
- Newer personal developer accounts face stricter closed-testing-before-production rules; check
  current Play policy if production is locked.
