-- Local seed, applied by `supabase db reset` / a fresh `supabase start` (config.toml [db.seed]).
-- Never run against the hosted project. The catalog itself loads separately
-- (`npm run catalog:restore` or `npm run db:seed`).
--
-- Dev admin for the catalog admin's local-auth mode (admin/README.md, "Signed-in screenshots").
-- Email/password sign-in on the local stack only. The id must match DEV_ADMIN_ID in
-- lib/admin-screenshot-env.ts, which `npm run admin:screenshot-env` writes to ADMIN_USER_IDS.
-- Dev-only password: ossus-dev-admin
insert into auth.users (
	instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
	raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
	confirmation_token, recovery_token, email_change, email_change_token_new,
	email_change_token_current, reauthentication_token
) values (
	'00000000-0000-0000-0000-000000000000', '00000000-0000-4000-a000-00000000ad01',
	'authenticated', 'authenticated', 'admin@ossus.test',
	extensions.crypt('ossus-dev-admin', extensions.gen_salt('bf')), now(),
	'{"provider": "email", "providers": ["email"]}', '{"name": "Dev Admin"}', now(), now(),
	'', '', '', '', '', ''
)
on conflict (id) do nothing;

insert into auth.identities (
	id, user_id, provider_id, provider, identity_data, last_sign_in_at, created_at, updated_at
) values (
	'00000000-0000-4000-a000-00000000ad02', '00000000-0000-4000-a000-00000000ad01',
	'00000000-0000-4000-a000-00000000ad01', 'email',
	'{"sub": "00000000-0000-4000-a000-00000000ad01", "email": "admin@ossus.test", "email_verified": true}',
	now(), now(), now()
)
on conflict do nothing;
