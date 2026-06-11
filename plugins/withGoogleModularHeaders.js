const { withDangerousMod } = require('expo/config-plugins');
const fs = require('node:fs');
const path = require('node:path');

// Google Sign-In pulls AppCheckCore (a Swift pod) which depends on GoogleUtilities
// and RecaptchaInterop — neither defines a clang module, so `pod install` fails to
// integrate them as static libraries:
//   "The Swift pod `AppCheckCore` depends upon `GoogleUtilities` and `RecaptchaInterop`,
//    which do not define modules."
// Opt those transitive pods into modular headers (module-map generation for static
// libs — NOT use_frameworks!, so it's safe alongside Nitro). Surfaced when CocoaPods
// re-resolved to GoogleSignIn 9.1.0 / AppCheckCore 11.3.0 (Podfile.lock is gitignored,
// so pod versions float per build). See README "Builds & distribution".
const BLOCK = `
  # >>> google-modular-headers (managed by withGoogleModularHeaders.js)
  pod 'GoogleUtilities', :modular_headers => true
  pod 'RecaptchaInterop', :modular_headers => true
  # <<< google-modular-headers
`;

module.exports = function withGoogleModularHeaders(config) {
	return withDangerousMod(config, [
		'ios',
		async (cfg) => {
			const podfile = path.join(cfg.modRequest.platformProjectRoot, 'Podfile');
			let contents = fs.readFileSync(podfile, 'utf8');
			if (contents.includes('google-modular-headers')) return cfg; // idempotent

			// Insert inside the target block, right after `use_expo_modules!`.
			const anchor = /\n(\s*)use_expo_modules!\n/;
			const m = contents.match(anchor);
			if (!m) {
				// Fail LOUD — never write a Podfile that silently lacks the patch.
				throw new Error(
					'[withGoogleModularHeaders] no `use_expo_modules!` anchor in Podfile; update the plugin.',
				);
			}
			contents = contents.replace(anchor, (match) => match + BLOCK);
			if (!contents.includes('google-modular-headers')) {
				throw new Error('[withGoogleModularHeaders] injection failed; aborting.');
			}
			fs.writeFileSync(podfile, contents);
			return cfg;
		},
	]);
};
