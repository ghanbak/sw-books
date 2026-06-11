const { withDangerousMod } = require('expo/config-plugins');
const fs = require('node:fs');
const path = require('node:path');

// swift-frontend SIGSEGVs in the LLVM IR "verify" pass when compiling the VisionCamera
// pod with -O -whole-module-optimization (Release archive) on Xcode 26.x. Confirmed via
// EAS build #7 bafddfd5 ("Global is external, but doesn't have external or weak linkage!").
// Disabling Swift optimization on the VisionCamera/Nitro pods removes that *optimizer*
// crash — BUT build #9 e78ad801 showed VisionCamera then crashes a second way, in IRGen
// type-metadata emission (emitLazyTypeMetadata), which runs even at -Onone. So -Onone is
// necessary-not-sufficient: kept because it's harmless and cheap, but the real fix is a
// newer toolchain (Xcode 26.4 / Swift 6.3) or dropping VisionCamera. These pods are
// camera/bridge glue, so the -Onone runtime cost is negligible (heavy OCR is ML Kit C++). Scope note: start_with?('Nitro') also covers react-native-nitro-image
// (a separate top-level dep) — intentional: identical -O -whole-module compile, pre-empts
// the same crash there. CNG/prebuild project (ios/ is gitignored), so this must patch the
// generated Podfile via a dangerous mod rather than a committed Podfile.
// See docs/plans/2026-06-10-fix-visioncamera-xcode26-ios-build-plan.md.
const BLOCK = `
  # >>> vision-camera-no-optimizer (managed by withVisionCameraNoOptimizer.js)
  installer.pods_project.targets.each do |target|
    if target.name.start_with?('VisionCamera', 'Nitro')
      target.build_configurations.each do |config|
        config.build_settings['SWIFT_OPTIMIZATION_LEVEL'] = '-Onone'
      end
    end
  end
  # <<< vision-camera-no-optimizer
`;

module.exports = function withVisionCameraNoOptimizer(config) {
	return withDangerousMod(config, [
		'ios',
		async (cfg) => {
			const podfile = path.join(cfg.modRequest.platformProjectRoot, 'Podfile');
			let contents = fs.readFileSync(podfile, 'utf8');
			if (contents.includes('vision-camera-no-optimizer')) return cfg; // idempotent

			const anchor = /post_install do \|installer\|\n/;
			if (!anchor.test(contents)) {
				// Fail LOUD — never write a Podfile that silently lacks the patch.
				throw new Error(
					'[withVisionCameraNoOptimizer] no `post_install do |installer|` anchor in Podfile; update the plugin.',
				);
			}
			// Insert at the top of `post_install`. Build settings are last-writer-wins,
			// and no Expo/RN post_install hook (react_native_post_install, expo-build-
			// properties) writes SWIFT_OPTIMIZATION_LEVEL, so our value is not clobbered.
			// If that ever changes, move this to run *after* react_native_post_install.
			contents = contents.replace(anchor, (m) => m + BLOCK);
			if (!contents.includes('vision-camera-no-optimizer')) {
				throw new Error('[withVisionCameraNoOptimizer] injection failed; aborting.');
			}
			fs.writeFileSync(podfile, contents);
			return cfg;
		},
	]);
};
