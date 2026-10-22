/**
 * Metro config: Expo defaults + three.js on react-native-webgpu.
 *
 * - three's addons (`three/addons/*`) import bare `three`; on React Native that must
 *   resolve to the WebGPU build, or they'd pull in the WebGL core and a second copy of
 *   three. Alias `three` and `three/webgpu` to `build/three.webgpu.js`
 *   (react-native-webgpu docs → Integrations → Three.js).
 * - glb/hdr as assets for three's loaders (self-contained `.glb` only — release builds
 *   flatten asset paths, so a `.gltf` + `.bin` pair won't resolve).
 *
 * Part of the native carrier build: keep bundler config stable so later hologram work
 * ships as EAS Updates (see docs/plans/2026-10-15-feat-webgpu-holo-covers-plan.md).
 */
const path = require('node:path');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// three's `exports` doesn't expose `./package.json` (the docs' snippet throws), so anchor on
// the package entry, which lives in `build/` next to the WebGPU build.
const threeWebGPU = path.join(path.dirname(require.resolve('three')), 'three.webgpu.js');

const upstreamResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
	if (moduleName === 'three' || moduleName === 'three/webgpu') {
		return { filePath: threeWebGPU, type: 'sourceFile' };
	}
	return (upstreamResolveRequest ?? context.resolveRequest)(context, moduleName, platform);
};

config.resolver.assetExts = [...config.resolver.assetExts, 'glb', 'hdr'];

module.exports = config;
