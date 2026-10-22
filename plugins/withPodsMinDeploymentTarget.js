const { withDangerousMod } = require('expo/config-plugins');
const fs = require('node:fs');
const path = require('node:path');

// Xcode 27 refuses to build any target whose IPHONEOS_DEPLOYMENT_TARGET is below iOS 15
// ("… set to 9.0, but the range of supported deployment target versions is 15.0 to 27.0.x").
// Several pods still declare old minimums on their resource-bundle targets — GoogleSignIn /
// GTMAppAuth / AppAuth / GTMSessionFetcher / GoogleUtilities / Promises (*_Privacy), RNSVG
// (RNSVGFilters), AsyncStorage (_resources) — so the whole build fails with error 65. On
// older Xcode these were only warnings.
//
// Raise every pod target that's below the app's own deployment target up to it. The app
// already requires 16.4 (expo-build-properties), so this changes nothing about where the app
// runs. ios/ is generated, so this lives in a config plugin to survive prebuild + EAS.
const BLOCK = `
    # >>> pods-min-deployment-target (managed by withPodsMinDeploymentTarget.js)
    app_min = podfile_properties['ios.deploymentTarget'] || '16.4'
    installer.pods_project.targets.each do |t|
      t.build_configurations.each do |c|
        current = c.build_settings['IPHONEOS_DEPLOYMENT_TARGET']
        if current && Gem::Version.new(current) < Gem::Version.new(app_min)
          c.build_settings['IPHONEOS_DEPLOYMENT_TARGET'] = app_min
        end
      end
    end
    # <<< pods-min-deployment-target
`;

module.exports = function withPodsMinDeploymentTarget(config) {
	return withDangerousMod(config, [
		'ios',
		async (cfg) => {
			const podfile = path.join(cfg.modRequest.platformProjectRoot, 'Podfile');
			let contents = fs.readFileSync(podfile, 'utf8');
			if (contents.includes('pods-min-deployment-target')) return cfg; // idempotent

			// Insert at the top of the existing post_install block (Podfiles allow only one).
			const anchor = /\n(\s*)post_install do \|installer\|\n/;
			if (!anchor.test(contents)) {
				// Fail LOUD — never write a Podfile that silently lacks the fix.
				throw new Error(
					'[withPodsMinDeploymentTarget] no `post_install do |installer|` anchor in Podfile; update the plugin.',
				);
			}
			contents = contents.replace(anchor, (match) => match + BLOCK);
			if (!contents.includes('pods-min-deployment-target')) {
				throw new Error('[withPodsMinDeploymentTarget] injection failed; aborting.');
			}
			fs.writeFileSync(podfile, contents);
			return cfg;
		},
	]);
};
