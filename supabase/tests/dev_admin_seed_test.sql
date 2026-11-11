-- Self-checking test for the local dev admin seed (issue #185): supabase/seed.sql creates
-- admin@ossus.test with a confirmed email, the dev-only password, and an email identity,
-- so the admin's local-auth mode can sign in. Read-only. Raises on any failed assertion;
-- prints "dev_admin_seed test: PASS" on success. Run via scripts/verify-db.sh.

do $$
declare
	uid constant uuid := '00000000-0000-4000-a000-00000000ad01';
begin
	if not exists (
		select 1 from auth.users
		where id = uid
			and email = 'admin@ossus.test'
			and email_confirmed_at is not null
			and encrypted_password = extensions.crypt('ossus-dev-admin', encrypted_password)
	) then
		raise exception 'dev admin user missing, unconfirmed, or wrong password';
	end if;

	if not exists (
		select 1 from auth.identities
		where user_id = uid and provider = 'email' and provider_id = uid::text
	) then
		raise exception 'dev admin has no email identity';
	end if;

	raise notice 'dev_admin_seed test: PASS';
end
$$;
