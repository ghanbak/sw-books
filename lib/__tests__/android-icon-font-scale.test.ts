import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// #441: at 200% system font scale, expo-symbols' Android SymbolView clips its glyph. It draws the
// Material Symbol as a `Text` with `fontSize: size` (sp, so scaled by fontScale) inside a fixed
// `size` × `size` View. The bitmap path (expo-font renderToImageAsync, used by the toolbar, tab bar
// and SFIcon) scales by display density only, so those icons stay whole. Rule: an Android symbol
// glyph is sized in dp and never depends on fontScale.
const ROOT = resolve(__dirname, '..', '..');

function read(rel: string) {
	const path = resolve(ROOT, rel);
	return existsSync(path) ? readFileSync(path, 'utf8') : '';
}

const UPSTREAM_VIEW = read('node_modules/expo-symbols/build/SymbolView.js');
const UPSTREAM_RENDER = read(
	'node_modules/expo-font/android/src/main/java/expo/modules/font/FontUtilsModule.kt',
);
const WRAPPER = read('components/ui/symbol-view.tsx');
const WRAPPER_ANDROID = read('components/ui/symbol-view.android.tsx');

describe('cause: expo-symbols draws Android glyphs as font-scaled text (#441)', () => {
	it('upstream SymbolView sets fontSize from size in a fixed size box, without disabling scaling', () => {
		expect(UPSTREAM_VIEW).toMatch(/\{\s*width:\s*size,\s*height:\s*size\s*\}/);
		expect(UPSTREAM_VIEW).toMatch(/fontSize:\s*size/);
		expect(UPSTREAM_VIEW).not.toMatch(/allowFontScaling/);
	});

	it('expo-font renders the glyph bitmap at size × density, not fontScale', () => {
		expect(UPSTREAM_RENDER).toMatch(
			/scalingFactor\s*=\s*context\.resources\.displayMetrics\.density/,
		);
		expect(UPSTREAM_RENDER).toMatch(/options\.size\s*\*\s*scalingFactor/);
		expect(UPSTREAM_RENDER).not.toMatch(/scaledDensity|fontScale|COMPLEX_UNIT_SP/);
	});
});

describe('Android SymbolView draws a dp-sized bitmap (#441)', () => {
	it('exists', () => {
		expect(WRAPPER_ANDROID).toMatch(/export function SymbolView\(/);
	});

	it('renders the Material glyph through useMaterialSymbolSource at `size`', () => {
		expect(WRAPPER_ANDROID).toMatch(
			/import \{ useMaterialSymbolSource \} from '@\/hooks\/useMaterialSymbolSource'/,
		);
		expect(WRAPPER_ANDROID).toMatch(
			/useMaterialSymbolSource\(\s*android\s*,\s*size\s*,\s*OPAQUE_SEED\s*\)/,
		);
		expect(WRAPPER_ANDROID).toMatch(/const OPAQUE_SEED = '#FFFFFF'/);
	});

	it('sizes the image and its box in dp from `size`, tinted with the token', () => {
		expect(WRAPPER_ANDROID).toMatch(/<Image\b[\s\S]*?width:\s*size,\s*height:\s*size/);
		expect(WRAPPER_ANDROID).toMatch(/tintColor\s*\}/);
	});

	it('never draws font-scaled text or reads fontScale', () => {
		expect(WRAPPER_ANDROID).not.toBe('');
		// Code only: the doc comment names the upstream `fontSize` it replaces.
		const code = WRAPPER_ANDROID.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
		expect(code).not.toMatch(/<Text\b|fontSize|fontScale|PixelRatio/);
	});

	it('keeps expo-symbols SymbolView on iOS (default file is a re-export)', () => {
		expect(WRAPPER.trim()).toBe("export { SymbolView } from 'expo-symbols';");
	});
});

describe('Characters sheet icons use the wrapper (#441)', () => {
	it.each([
		'components/ui/glass-icon-button.tsx',
		'components/enrichment/character-row.tsx',
		'app/characters/[id].tsx',
	])('%s imports SymbolView from @/components/ui/symbol-view', (rel) => {
		const src = read(rel);
		expect(src).toMatch(/import \{ SymbolView \} from '@\/components\/ui\/symbol-view';/);
		expect(src).not.toMatch(/import \{[^}]*\bSymbolView\b[^}]*\} from 'expo-symbols'/);
		expect(src).toMatch(/<SymbolView\b/);
	});
});
