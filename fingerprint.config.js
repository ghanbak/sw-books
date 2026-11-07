/**
 * Runtime-version fingerprint (app.json `runtimeVersion.policy: "fingerprint"`).
 *
 * Skip sources that never reach the native binary, so tooling-only edits
 * (npm scripts, .gitignore) don't strand OTA updates on a new runtime.
 *
 * react-native-webgpu's podspec copies the Dawn xcframework into its own
 * libs/ folder during `pod install`. EAS fingerprints after pod install and
 * the local CLI before it, so that copy made the two disagree and failed the
 * 1.4.0 build at "Configure expo-updates". The copy comes from the pinned
 * react-native-webgpu-dawn version, so ignoring it hides no native change.
 */
const { SourceSkips } = require('expo/fingerprint');

/** @type {import('expo/fingerprint').Config} */
module.exports = {
	sourceSkips:
		SourceSkips.PackageJsonAndroidAndIosScriptsIfNotContainRun |
		SourceSkips.PackageJsonScriptsAll |
		SourceSkips.GitIgnore,
	ignorePaths: ['node_modules/react-native-webgpu/libs/**'],
};
