/**
 * Runtime-version fingerprint (app.json `runtimeVersion.policy: "fingerprint"`).
 *
 * Skip sources that never reach the native binary, so tooling-only edits
 * (npm scripts, .gitignore) don't strand OTA updates on a new runtime.
 */
const { SourceSkips } = require('expo/fingerprint');

/** @type {import('expo/fingerprint').Config} */
module.exports = {
	sourceSkips:
		SourceSkips.PackageJsonAndroidAndIosScriptsIfNotContainRun |
		SourceSkips.PackageJsonScriptsAll |
		SourceSkips.GitIgnore,
};
