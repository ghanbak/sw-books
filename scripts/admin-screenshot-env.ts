/**
 * Write admin/.env.screenshots.local (gitignored) from the LOCAL Supabase stack,
 * so the admin can sign in as the seeded dev admin without the hosted project.
 *
 *   npm run admin:screenshot-env
 *
 * Reads `supabase status -o json` for the stack configured in supabase/config.toml
 * and exits non-zero if the stack is down or its API URL isn't loopback. Never
 * prints key values. See admin/README.md ("Signed-in screenshots").
 */
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildScreenshotEnv, parseStatusJson, renderEnvFile } from '../lib/admin-screenshot-env';

const ROOT = resolve(__dirname, '..');
const OUT = resolve(ROOT, 'admin', '.env.screenshots.local');

function main(): void {
	let raw: string;
	try {
		raw = execFileSync('supabase', ['status', '-o', 'json', '--workdir', ROOT], {
			encoding: 'utf-8',
			stdio: ['ignore', 'pipe', 'ignore'],
		});
	} catch {
		throw new Error('`supabase status` failed — start the local stack first (`supabase start`).');
	}
	const vars = buildScreenshotEnv(parseStatusJson(raw));
	writeFileSync(OUT, renderEnvFile(vars), { mode: 0o600 });
	console.log(`Wrote ${OUT} (auth + DB → ${vars.NEXT_PUBLIC_SUPABASE_URL}).`);
}

try {
	main();
} catch (err) {
	console.error(err instanceof Error ? err.message : err);
	process.exit(1);
}
