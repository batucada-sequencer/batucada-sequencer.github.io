const versions = {
	app: '1.19.46',
	static: '1.06'
};

const dataCache = 'data';
const appCache = versions.app;

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
		'./modules/toast_positioning.js',
	],
	static: [
		'./favicon.svg',
		'./app/icon.svg',
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
		'./audio/surdo.ogg',
		'./audio/surdo2.ogg',
		'./audio/tamborim.ogg',
	],
};

self.addEventListener('install', event => {
	console.log('Service worker: install');
	self.skipWaiting();
	const URLs = Object.entries(assets).flatMap(([key, paths]) =>
		paths.map(path => path + ((key in versions) ? '?' + key + '=' + versions[key] : ''))
	);
	event.waitUntil(
		caches.open(appCache).then(cache => cache.addAll(URLs))
	);
});

self.addEventListener('activate', event => {
	console.log('Service worker: activate');
	event.waitUntil(
		caches.keys().then((keyList) => {
			return Promise.all(
				keyList.map((key) => {
					if (key === appCache || key === dataCache) {
						return;
					}
					return caches.delete(key);
				}),
			);
		}),
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
