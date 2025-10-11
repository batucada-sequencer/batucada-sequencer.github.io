const versions = {
	app: '1.04.12',
	static: '1.03',
};
const versionsPath = './versions.json';
const appCache = 'app';
const dataCache = 'data';

const assets = {
	app: [
		'./',
		'./index.html',
		'./style.css',
		'./config.json',
		'./modules/instruments.json',
		'./modules/interface.js',
		'./modules/presets.js',
		'./modules/sequencer.js',
		'./modules/service_worker.js',
		'./modules/toast_positioning.js',
		'./modules/url_state.js',
	],
	static: [
		'./favicon.svg',
		'./app/icon.svg',
		'./app/share.html',
		'./app/app.webmanifest',
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

const urls = Object.entries(assets).flatMap(([key, paths]) =>
	paths.map(path => {
		const url = new URL(path, self.registration.scope);
		if (key in versions) url.searchParams.set(key, versions[key]);
		return url.href;
	})
);

const versionsFile = new Response(JSON.stringify(versions), {
	headers: { 'Content-Type': 'application/json' }
});

self.addEventListener('message', event => {
	if (event.data?.action === 'skipWaiting') {
		self.skipWaiting();
	}
});

self.addEventListener('install', event => {
	console.log('Service worker: install');
	event.waitUntil(
		caches.open(appCache).then(cache => cache.addAll(urls))
	);
});

self.addEventListener('activate', event => {
	console.log('Service worker: activate');
	event.waitUntil(
		(async () => {
			const cache = await caches.open(appCache);
			const isUpdate = !!(await cache.match(versionsPath));
			const cachedRequests = await cache.keys();
			// Supprime les anciennes entrées du cache
			await Promise.all(
				cachedRequests.map(request => {
					if (!urls.includes(request.url)) {
						return cache.delete(request);
					}
				})
			);
			// Met à jour le fichier des versions dans le cache
			await cache.put('./versions.json', versionsFile);
			// Si c'est une mise à jour, prend le controle des clients et les avertit par message
			if (isUpdate) {
				await self.clients.claim();
				const clientsList = await self.clients.matchAll({ type: 'window' });
				clientsList.forEach(client => client.postMessage({ type: 'update' }));
			}
		})()
	);
});

self.addEventListener('fetch', event => {
	if (event.request.method !== 'GET') return;
	const url = new URL(event.request.url);
	const folder = url.pathname.split('/').slice(-2, -1)[0];
	if (folder === 'data') {
		event.respondWith(handleDataRequest(event.request));
	} else {
		event.respondWith(handleAppRequest(event.request));
	}
});

async function handleDataRequest(request) {
	const cache = await caches.open(dataCache);
	const noCache = request.headers.get('Cache-Control') === 'no-cache';
	if (noCache) {
		try {
			const networkResponse = await fetch(request);
			if (networkResponse.ok) {
				await cache.put(request, networkResponse.clone());
			}
			return networkResponse;
		} catch (error) {
			return Response.error();
		}
	} else {
		const cachedResponse = await cache.match(request);
		(async () => {
			try {
				const networkResponse = await fetch(request);
				if (networkResponse.ok) {
					await cache.put(request, networkResponse.clone());
				}
			} catch (error) {}
		})();
		return cachedResponse || (await fetch(request).catch(() => new Response(JSON.stringify([]), {
			headers: { 'Content-Type': 'application/json' }
		})));
	}
}

async function handleAppRequest(request) {
	const cache = await caches.open(appCache);
	const cachedResponse = await cache.match(request, { ignoreSearch: true });
	if (cachedResponse) return cachedResponse;
	const response = await fetch(request);
	cache.put(request, response.clone())
	return response;
}
