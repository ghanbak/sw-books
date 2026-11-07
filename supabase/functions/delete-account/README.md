# delete-account

In-app account deletion (App Store guideline 5.1.1(v)) with Sign in with Apple token revocation ([TN3194](https://developer.apple.com/documentation/technotes/tn3194-handling-account-deletions-and-revoking-tokens-for-sign-in-with-apple)). The app calls it through `deleteAccount()` in `lib/account.ts`.

## Flow

1. `POST` only. `verify_jwt = true` (`supabase/config.toml`), and the handler checks the user JWT again with `@supabase/server`.
2. Re-auth guard: the access token's `iat` must be under 10 minutes old. The app refreshes its session right before calling, which needs the refresh token, so a leaked access token alone can't delete the account. There is no persistent rate limiter: deletion is terminal, and every call needs a valid, fresh session.
3. Apple users send a fresh `appleAuthorizationCode` from the Apple sheet. The function exchanges it at `/auth/token` with an ES256 `client_secret`, and checks that the `id_token` `sub` matches the account's Apple identity.
4. `auth.admin.deleteUser(id)`. `user_books` cascades through its foreign key.
5. Revoke the Apple refresh token at `/auth/revoke`.

Response: `{ ok: true, appleRevoked }` or `{ ok: false, code }`, where `code` is one of `method_not_allowed`, `unauthorized`, `reauth_required`, `bad_request` or `delete_failed`. Apple failures never block deletion; they return `appleRevoked: false` and log a warning that contains no tokens or user data.

If the Apple secrets are missing, the function skips revocation, logs `apple secrets not configured`, and still deletes the account.

## Secrets (owner)

| Secret | Value |
|---|---|
| `APPLE_TEAM_ID` | Apple Developer Team ID |
| `APPLE_KEY_ID` | Key ID of a key with **Sign in with Apple** enabled, set to the app's primary App ID |
| `APPLE_PRIVATE_KEY` | Contents of that `AuthKey_<KEYID>.p8`, PEM. Real newlines or `\n` escapes both work. |
| `APPLE_CLIENT_ID` | The iOS bundle ID `com.ghanbak.ossusarchives`. Native codes are issued to the bundle ID, not a Services ID. |

`SUPABASE_URL` and the publishable and secret keys are provided by the platform.

Set them from the project root. These commands are documented here; agents don't run them.

```bash
supabase secrets set APPLE_TEAM_ID=XXXXXXXXXX APPLE_KEY_ID=YYYYYYYYYY \
  APPLE_CLIENT_ID=com.ghanbak.ossusarchives
supabase secrets set APPLE_PRIVATE_KEY="$(cat ~/path/AuthKey_YYYYYYYYYY.p8)"
```

## Deploy (owner)

```bash
supabase functions deploy delete-account
```

## Local

```bash
supabase start
supabase functions serve delete-account   # Apple secrets optional: --env-file supabase/functions/.env
```

Pure logic lives in `../_shared/account-deletion.ts` and is shared with the app. Its tests are in `account-deletion.test.ts` (Vitest, `npm test`). The root `tsconfig.json` excludes `supabase/functions/*/index.ts`, because Deno entrypoints use `npm:` specifiers and the `Deno` global.
