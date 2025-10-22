const versions = {
	app: '1.04.40',
	static: '1.03',
};

// En attendant la prise ne comptes des modules par firefox
// import config from './config/core_config.json' with { type: 'json' };
const config = {
	appCache: 'app',
	dataCache: 'data',
	versionsFile: "versions.json",
};

const assets = {
	app: [
		'./',
		'./index.html',
		'./style.css',
		'./favicon.svg',
		'./app/icon.svg',
		'./app/share.html',
		'./app/app.webmanifest',
		'./config/app_config.json',
		'./config/core_config.json',
		'./modules/instruments.json',
		'./modules/interface.js',
		'./modules/interface_about.js',
		'./modules/interface_animation.js',
		'./modules/interface_controls.js',
		'./modules/interface_presets.js',
		'./modules/interface_swap.js',
		'./modules/presets.js',
		'./modules/sequencer.js',
		'./modules/service_worker.js',
		'./modules/toast_positioning.js',
		'./modules/url_state.js',
	],
	static: [
		'./audio/default.ogg',
		'./audio/agogo.ogg',
		'./audio/agogo2.ogg',
		'./audio/campana.ogg',
		'./audio/campana2.ogg',
		'./audio/caixa.ogg',
		'./audio/caixa2.ogg',
		'./audio/caixa3.ogg',
		'./audio/chocalho.ogg',
		'./audio/chocalho2.ogg',
		'./audio/contra.ogg',
		'./audio/contra2.ogg',
		'./audio/couper.ogg',
		'./audio/couper2.ogg',
		'./audio/repenique.ogg',
		'./audio/repenique2.ogg',
		'./audio/surdo.ogg',
		'./audio/surdo2.ogg',
		'./audio/tamborim.ogg',
		'./audio/tamborim2.ogg',
	],
};

const urlMap = new Map();

Object.entries(assets).forEach(([key, paths]) => {
	paths.forEach(path => {
		const url = new URL(path, self.registration.scope);
		const entry = url.href
		if (key in versions) url.searchParams.set(key, versions[key]);
		urlMap.set(entry, url.href);
	});
});

const versionedUrls = [...urlMap.values()];

const versionsFile = new Response(JSON.stringify(versions), {
	headers: { 'Content-Type': 'application/json' }
});

let skipWaitingCalled = false;

self.addEventListener('message', event => {
	if (event.data?.action === 'skipWaiting') {
		self.skipWaiting();
		skipWaitingCalled = true;
	}
});

self.addEventListener('install', event => {
	console.log('Service worker: install');
	event.waitUntil(
		(async () => {
			const cache = await caches.open(config.appCache);
			await cache.addAll(versionedUrls);
		})()
	);
});

self.addEventListener('activate', event => {
	console.log('Service worker: activate');
	event.waitUntil(
		(async () => {
			const cache = await caches.open(config.appCache);
			const cachedRequests = await cache.keys();
			// Supprime les anciennes entrées du cache
			const obsoleteRequests = cachedRequests.filter(request => !versionedUrls.includes(request.url));
			await Promise.all(obsoleteRequests.map(request => cache.delete(request)));
			// Met à jour le fichier des versions dans le cache
			await cache.put(config.versionsFile, versionsFile);
			// Prend le controle des tous les clients
			await self.clients.claim();
			const clientsList = await self.clients.matchAll({ type: 'window' });
			// Avertit tous les client d'une premiere activation ou d'une mise à jour 
			clientsList.forEach(client => client.postMessage({ type: skipWaitingCalled ? 'update' : 'install' }));
		})()
	);
});

self.addEventListener('fetch', event => {
	if (event.request.method !== 'GET') return;
	const url = new URL(event.request.url);
	const folder = url.pathname.split('/').slice(-2, -1)[0];
	if (folder === config.dataCache) {
		event.respondWith(handleDataRequest(event.request));
	} else {
		event.respondWith(handleAppRequest(event.request));
	}
});

async function handleDataRequest(request) {
	const cache = await caches.open(config.dataCache);
	const noCache = request.headers.get('Cache-Control') === 'no-cache';
	// Force la récupération de la verions du réseau
	if (noCache) {
		// Récupération de la version du réseau et mise en cache
		return fetchAndCache(request, cache);
	} 
	// Stale-while-revalidate : utilisation du cache avec revalidation en arrière-plan.
	else {
		// Récupération de la version en cache
		const cachedResponse = await cache.match(request);
		// Mise en cache asynchrone pour la prochaine requête
		(async () => {
			await fetchAndCache(request, cache);
		})();
		// Retourne la version en cache, sinon la version du réseau, sinon un fichier vide ([])
		return cachedResponse || (await fetch(request).catch(() => new Response(JSON.stringify([]), {
			headers: { 'Content-Type': 'application/json' }
		})));
	}
}

async function handleAppRequest(request) {
	const cache = await caches.open(config.appCache);
	// Suppression des paramètres d'URL
	const url = new URL(request.url);
	url.search = '';
	// Ajout du paramètre de versioning 
	const versionedUrl = urlMap.get(url.href) || request.url;
	// Récupération de la version en cache
	const cachedResponse = await cache.match(versionedUrl);
	if (cachedResponse) return cachedResponse;
	// Si échec, récupération de la version du réseau et mise en cache
	return fetchAndCache(versionedUrl, cache);
}

async function fetchAndCache(request, cache) {
	try {
		const response = await fetch(request);
		if (response.ok) {
			cache.put(request, response.clone());
		}
		return response;
	} catch {
		return cache.match(request) || new Response(JSON.stringify([]), {
			headers: { 'Content-Type': 'application/json' }
		});
	}
}

