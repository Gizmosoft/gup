const { getDefaultConfig } = require('expo/metro-config');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

// expo-sqlite on web: treat .wasm as an asset
config.resolver.assetExts.push('wasm');

// SharedArrayBuffer requires COEP/COOP (dev server)
config.server.enhanceMiddleware = (middleware) => {
	return (req, res, next) => {
		res.setHeader('Cross-Origin-Embedder-Policy', 'credentialless');
		res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
		middleware(req, res, next);
	};
};

module.exports = config;
