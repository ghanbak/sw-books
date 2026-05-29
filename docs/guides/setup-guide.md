# External Services Setup Guide

Step-by-step setup for all external services needed by the SW Books app. Organized by **when** each service becomes required during development.

---

## Prerequisites (Before You Start)

These must be installed on your machine before any development. **No accounts needed** — everything in Phase 1 runs locally without signing up for anything.

### 1. Node.js + pnpm

```bash
# Install Node.js 20+ (LTS)
# https://nodejs.org or via nvm:
nvm install 20
nvm use 20

# Install pnpm
npm install -g pnpm
```

### 2. Docker Desktop

Required for running Supabase locally.

1. Download Docker Desktop from https://www.docker.com/products/docker-desktop
2. Install and launch it
3. Verify: `docker --version`

### 3. Supabase CLI

No Supabase account needed. The CLI runs a local stack via Docker — no cloud connection required.

```bash
# Install via Homebrew (macOS)
brew install supabase/tap/supabase

# Verify
supabase --version
```

### 4. Expo CLI

```bash
# Comes with npx, no global install needed. Verify:
npx expo --version
```

### 5. Physical Devices (Recommended)

- **iOS testing:** iPhone with Expo Go app installed (no account needed — just install from App Store), or Xcode for simulator
- **Android testing:** Android phone with Expo Go (no account needed — install from Play Store), or Android Studio for emulator

---

## Phase 1: Local Development

Everything in Phase 1 runs locally. No cloud accounts needed.

### Supabase Local Stack

The Supabase CLI runs a full Postgres + Auth + Storage stack via Docker containers on your machine.

**Step 1: Initialize Supabase in the project**

```bash
cd /path/to/sw-books
supabase init
```

This creates the `supabase/` directory with `config.toml`.

**Step 2: Start the local stack**

```bash
supabase start
```

First run downloads Docker images (~2-3 minutes). Subsequent starts are fast.

On success, it prints several sections:

```
╭──────────────────────────────────────╮
│ 🔧 Development Tools                 │
├─────────┬────────────────────────────┤
│ Studio  │ http://127.0.0.1:54323     │  ← Admin dashboard (browser)
│ Mailpit │ http://127.0.0.1:54324     │  ← Email testing inbox
│ MCP     │ http://127.0.0.1:54321/mcp │
╰─────────┴────────────────────────────╯

╭──────────────────────────────────────────────────────╮
│ 🌐 APIs                                              │
├────────────────┬─────────────────────────────────────┤
│ Project URL    │ http://127.0.0.1:54321              │  ← Use this for EXPO_PUBLIC_SUPABASE_URL
│ REST           │ http://127.0.0.1:54321/rest/v1      │
│ GraphQL        │ http://127.0.0.1:54321/graphql/v1   │
│ Edge Functions │ http://127.0.0.1:54321/functions/v1 │
╰────────────────┴─────────────────────────────────────╯

╭───────────────────────────────────────────────────────────────╮
│ ⛁ Database                                                    │
├─────┬─────────────────────────────────────────────────────────┤
│ URL │ postgresql://postgres:postgres@127.0.0.1:54322/postgres │
╰─────┴─────────────────────────────────────────────────────────╯

╭──────────────────────────────────────────────────────────────╮
│ 🔑 Authentication Keys                                       │
├─────────────┬────────────────────────────────────────────────┤
│ Publishable │ eyJ...                                         │  ← Use this for EXPO_PUBLIC_SUPABASE_ANON_KEY
│ Secret      │ eyJ...                                         │  ← service_role key (NEVER put in app code)
╰─────────────┴────────────────────────────────────────────────╯

╭───────────────────────────────────────────────────────────────────╮
│ 📦 Storage (S3)                                                   │
├────────────┬──────────────────────────────────────────────────────┤
│ URL        │ http://127.0.0.1:54321/storage/v1/s3                 │
│ Access Key │ ...                                                  │  ← Not needed for the app
│ Secret Key │ ...                                                  │  ← Not needed for the app
│ Region     │ local                                                │
╰────────────┴──────────────────────────────────────────────────────╯
```

The two keys you need for the app:
- **Publishable** = the anon key (safe to use in client code)
- **Secret** = the service_role key (admin access, never ship in the app — only for server-side scripts like the seed)

The Storage S3 keys are for direct S3-compatible access and are not needed for this project.

**Step 3: Save the local keys to your `.env`**

Create a `.env` file at the project root (this is gitignored):

```bash
EXPO_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321          # Project URL from the APIs section
EXPO_PUBLIC_SUPABASE_ANON_KEY=eyJ...                      # Publishable key from Authentication Keys
```

**Step 4: Access Supabase Studio**

Open http://127.0.0.1:54323 in your browser. This is the local admin dashboard — same UI as cloud Supabase. Use it to:
- Browse tables and data
- Edit rows (this is your admin interface for managing books)
- View auth users
- Test RLS policies

**Step 5: Run migrations**

```bash
supabase db reset
```

This applies all migrations in `supabase/migrations/` and runs `supabase/seed.sql`.

**Step 6: Generate TypeScript types**

```bash
supabase gen types typescript --local > lib/types.ts
```

Re-run this whenever you change the schema.

**Useful commands:**

| Command | Purpose |
|---|---|
| `supabase start` | Start local stack |
| `supabase stop` | Stop local stack |
| `supabase db reset` | Drop all tables, re-run migrations + seed |
| `supabase db diff --local` | Generate migration from manual Studio changes |
| `supabase gen types typescript --local` | Regenerate TS types |
| `supabase status` | Show local URLs and keys |

### Expo Dev Server

```bash
# Start the dev server
npx expo start

# Or start with cache cleared
npx expo start --clear
```

Scan the QR code with Expo Go on your phone, or press `i` for iOS simulator / `a` for Android emulator.

### Local Auth Bypass (for development without OAuth)

During Phase 1 you don't have Google/Apple OAuth configured. To develop the app UI without a real login:

**Option A: Disable auth gate temporarily**

In your root layout, skip the auth check during development:

```typescript
// app/_layout.tsx — during development only
const DEV_SKIP_AUTH = __DEV__; // true in development

if (!session && !DEV_SKIP_AUTH) {
  return <Redirect href="/(auth)/login" />;
}
```

**Option B: Create a test user via Supabase Studio**

1. Open http://127.0.0.1:54323
2. Go to Authentication > Users
3. Click "Add user" > "Create new user"
4. Enter any email/password (e.g., `test@test.com` / `password`)
5. Use `supabase.auth.signInWithPassword()` in development

Either way, the catalog, shelves, scanner, and 3D covers can all be built and tested without OAuth.

---

## Phase 2: Google Sign-In Setup

Required before testing Google authentication on a device. This involves the Google Cloud Console and the Supabase Auth dashboard.

### Google Cloud Console

**Step 1: Create a Google Cloud project**

1. Go to https://console.cloud.google.com
2. Click the project dropdown (top-left) > "New Project"
3. Name: `SW Books` (or similar)
4. Click "Create"
5. Select the new project from the dropdown

**Step 2: Configure the OAuth consent screen**

1. Navigate to **APIs & Services > OAuth consent screen**
2. Select **External** user type > click "Create"
3. Fill in:
   - App name: `SW Books`
   - User support email: your email
   - Developer contact: your email
4. Scopes: click "Add or Remove Scopes" > add `email` and `profile` > Save
5. Test users: add your own email (while app is in "Testing" status, only listed users can sign in)
6. Click "Back to Dashboard"

**Step 3: Create OAuth Client IDs**

You need **three** client IDs: Web, iOS, and Android.

**Web Client ID** (required — Supabase uses this to verify tokens):

1. Go to **APIs & Services > Credentials**
2. Click **"+ Create Credentials" > "OAuth client ID"**
3. Application type: **Web application**
4. Name: `SW Books Web`
5. Authorized redirect URIs: add `https://<YOUR_SUPABASE_PROJECT>.supabase.co/auth/v1/callback` (add this later when you have a cloud Supabase project; for now just create the client)
6. Click "Create"
7. **Save the Client ID and Client Secret** — you'll need both for Supabase

**iOS Client ID:**

1. Click **"+ Create Credentials" > "OAuth client ID"**
2. Application type: **iOS**
3. Name: `SW Books iOS`
4. Bundle ID: your iOS bundle identifier (e.g., `com.yourname.swbooks` — must match `app.json`)
5. Click "Create"
6. **Save the Client ID** — you'll need the reversed version for the URL scheme

**Android Client ID:**

1. Click **"+ Create Credentials" > "OAuth client ID"**
2. Application type: **Android**
3. Name: `SW Books Android`
4. Package name: your Android package (e.g., `com.yourname.swbooks` — must match `app.json`)
5. SHA-1 certificate fingerprint:
   ```bash
   # For debug keystore:
   keytool -list -v -keystore ~/.android/debug.keystore -alias androiddebugkey -storepass android -keypass android | grep SHA1
   
   # For EAS Build, get it from:
   eas credentials
   ```
6. Click "Create"
7. **Save the Client ID**

**Step 4: Note your credentials**

You should now have:

| Credential | Where it goes |
|---|---|
| Web Client ID | Supabase Auth dashboard + `app.json` (`webClientId` for Google Sign-In) |
| Web Client Secret | Supabase Auth dashboard only (never in app code) |
| iOS Client ID | `app.json` (for URL scheme) |
| Android Client ID | `app.json` |

### Supabase Auth Dashboard (Google)

This step requires a **cloud Supabase project** (see "Cloud Supabase" section below). If you're still on local-only, skip to configuring local auth.

1. Go to https://supabase.com/dashboard > your project
2. Navigate to **Authentication > Providers**
3. Find **Google** and toggle it on
4. Enter:
   - Client ID: your **Web Client ID**
   - Client Secret: your **Web Client Secret**
5. Save

**For local Supabase:** Edit `supabase/config.toml`:

```toml
[auth.external.google]
enabled = true
client_id = "your-web-client-id"
secret = "your-web-client-secret"
```

Then restart: `supabase stop && supabase start`

### Configure the Expo App

**`app.json` (or `app.config.ts`):**

```json
{
  "expo": {
    "plugins": [
      [
        "@react-native-google-signin/google-signin",
        {
          "iosUrlScheme": "com.googleusercontent.apps.YOUR_IOS_CLIENT_ID"
        }
      ]
    ]
  }
}
```

**In your Google Sign-In component:**

```typescript
import { GoogleSignin } from '@react-native-google-signin/google-signin';

GoogleSignin.configure({
  webClientId: 'YOUR_WEB_CLIENT_ID',  // Always the WEB client ID, even on mobile
});
```

---

## Phase 2: Apple Sign-In Setup

Required before testing Apple authentication on iOS.

### Apple Developer Account

1. Go to https://developer.apple.com
2. Click "Account" and sign in (or enroll — $99/year)
3. You need the **Apple Developer Program** membership (not just a free account)

### Register an App ID

1. Go to **Certificates, Identifiers & Profiles > Identifiers**
2. Click **"+"** to register a new identifier
3. Select **App IDs** > Continue
4. Select **App** > Continue
5. Description: `SW Books`
6. Bundle ID: **Explicit** > enter your bundle ID (e.g., `com.yourname.swbooks`)
7. Scroll down to **Capabilities** > check **"Sign in with Apple"**
8. Click Continue > Register

### Create a Service ID (for Supabase)

1. Go to **Identifiers** > click **"+"**
2. Select **Services IDs** > Continue
3. Description: `SW Books Auth`
4. Identifier: `com.yourname.swbooks.auth` (must be different from the App ID)
5. Click Continue > Register
6. Click on the newly created Service ID
7. Check **"Sign in with Apple"** > click **Configure**
8. Primary App ID: select your app
9. Domains: add your Supabase project domain (e.g., `yourproject.supabase.co`)
10. Return URLs: add `https://yourproject.supabase.co/auth/v1/callback`
11. Save

### Create a Key

1. Go to **Keys** > click **"+"**
2. Key Name: `SW Books Auth Key`
3. Check **"Sign in with Apple"** > click **Configure** > select your Primary App ID
4. Click Continue > Register
5. **Download the key file** (`.p8`) — you can only download it once
6. Note the **Key ID** shown on screen

### Supabase Auth Dashboard (Apple)

1. Go to Supabase Dashboard > **Authentication > Providers**
2. Find **Apple** and toggle it on
3. Enter:
   - Client ID: your **Service ID** identifier (e.g., `com.yourname.swbooks.auth`)
   - Secret Key: paste the contents of the `.p8` key file
   - Key ID: the Key ID from the previous step
   - Team ID: your Apple Developer Team ID (find it at https://developer.apple.com/account > Membership Details)
4. Save

### Expo Configuration

Apple Sign-In works via `expo-apple-authentication` with no additional config plugin — just install the package. The only requirement is that your app's bundle ID matches the App ID registered above.

```bash
npx expo install expo-apple-authentication
```

---

## Cloud Supabase Project

Required before deploying to production or testing auth with real OAuth providers (instead of local).

### Create the Project

1. Go to https://supabase.com and sign up / sign in
2. Click **"New project"**
3. Organization: create one or select existing
4. Project name: `sw-books`
5. Database password: generate a strong password and **save it securely**
6. Region: choose closest to your users
7. Pricing plan: **Free** is sufficient for V1 (500MB database, 1GB storage, 50K monthly active users)
8. Click "Create new project" — provisioning takes ~2 minutes

### Get Your API Keys

1. Go to **Project Settings > API**
2. Note:
   - **Project URL**: `https://yourproject.supabase.co`
   - **anon public key**: safe to use in the app
   - **service_role key**: never put this in the app — only for server-side / Edge Functions

### Link Your Local Project

```bash
supabase link --project-ref YOUR_PROJECT_REF
```

The project ref is the subdomain of your Supabase URL (e.g., if URL is `https://abcdefgh.supabase.co`, ref is `abcdefgh`).

### Push Migrations to Cloud

```bash
supabase db push
```

This applies all local migrations to the cloud database.

### Seed the Cloud Database

The seed script needs to target the cloud database:

```bash
# Set environment variables for the cloud project
export SUPABASE_URL=https://yourproject.supabase.co
export SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# Run the seed script
npx tsx scripts/seed.ts
```

### Update App Environment

Create `.env.production` (or update `.env`):

```bash
EXPO_PUBLIC_SUPABASE_URL=https://yourproject.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

### Generate Types from Cloud

```bash
supabase gen types typescript --project-id YOUR_PROJECT_REF > lib/types.ts
```

---

## Phase 3: EAS Build + Distribution

Required before building for App Store / Play Store distribution.

### Expo Account

1. Go to https://expo.dev and create an account
2. Sign in via CLI:
   ```bash
   npx eas login
   ```

### EAS Build Setup

**Step 1: Install EAS CLI**

```bash
npm install -g eas-cli
```

**Step 2: Configure EAS**

```bash
eas build:configure
```

This creates `eas.json` with build profiles. Customize:

```json
{
  "build": {
    "development": {
      "developmentClient": true,
      "distribution": "internal"
    },
    "preview": {
      "distribution": "internal"
    },
    "production": {}
  }
}
```

**Step 3: Configure app identifiers**

In `app.json`:

```json
{
  "expo": {
    "name": "SW Books",
    "slug": "sw-books",
    "version": "1.0.0",
    "ios": {
      "bundleIdentifier": "com.yourname.swbooks"
    },
    "android": {
      "package": "com.yourname.swbooks"
    }
  }
}
```

### Build for iOS (TestFlight)

```bash
# First build — EAS will prompt for Apple credentials
eas build --platform ios --profile production
```

EAS will:
1. Prompt for your Apple Developer credentials
2. Auto-generate certificates and provisioning profiles
3. Build in the cloud (~15-20 minutes)
4. Provide a download link for the `.ipa`

**Submit to TestFlight:**

```bash
eas submit --platform ios
```

### Build for Android (Internal Testing)

```bash
eas build --platform android --profile production
```

This produces an `.aab` file. For internal testing, use the `preview` profile which produces an `.apk`:

```bash
eas build --platform android --profile preview
```

### Account Deletion Edge Function

Before App Store submission, deploy the account deletion Edge Function:

```bash
# Create the function
supabase functions new delete-account

# Deploy
supabase functions deploy delete-account
```

---

## Quick Reference: What's Needed When

| Phase | Service | Account Required? | Notes |
|---|---|---|---|
| **Phase 1** (local dev) | Docker Desktop | No | Just install |
| | Supabase CLI | No | Runs locally via Docker, no cloud account |
| | Node.js + pnpm | No | Just install |
| | Expo Go (phone app) | No | Install from App/Play Store, no login |
| | Xcode / Android Studio | No | Optional, for simulators |
| | Supabase cloud account | No | Not needed until Phase 3 |
| | expo.dev account | No | Not needed until Phase 3 |
| **Phase 2** (auth) | Google Cloud Console | Yes (free) | Google account needed |
| | Apple Developer Program | Yes ($99/yr) | For Apple Sign-In on iOS |
| | Supabase cloud or local config | Local works | Configure OAuth in `config.toml` |
| **Phase 3** (ship) | Supabase cloud account | Yes (free tier) | For production database |
| | expo.dev account | Yes (free tier) | For EAS cloud builds |
| | Apple Developer Program | Yes ($99/yr) | For App Store + TestFlight |
| | Google Play Console | Yes ($25 one-time) | For Play Store |
