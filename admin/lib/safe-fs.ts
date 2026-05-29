import 'server-only';
import { promises as fs } from 'node:fs';
import path from 'node:path';

// Resolve the canonical data/ directory once (admin runs with cwd = admin/).
const DATA_ROOT_REAL = await fs.realpath(path.resolve(process.cwd(), '../data'));

/**
 * Write `contents` to a path relative to data/, atomically (temp file +
 * rename). Rejects absolute paths and any target that escapes data/ via a
 * symlink. Used by the export action to write books.csv + override JSONs.
 */
export async function safeWrite(rel: string, contents: string): Promise<void> {
	if (path.isAbsolute(rel)) throw new Error('absolute path rejected');
	const target = path.resolve(DATA_ROOT_REAL, rel);
	const parentReal = await fs.realpath(path.dirname(target));
	if (parentReal !== DATA_ROOT_REAL && !parentReal.startsWith(DATA_ROOT_REAL + path.sep)) {
		throw new Error('path escape via symlink');
	}
	const tmp = `${target}.${process.pid}.tmp`;
	await fs.writeFile(tmp, contents, { mode: 0o600 });
	await fs.rename(tmp, target);
}
