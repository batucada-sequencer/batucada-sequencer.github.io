export class ServiceWorker {
	#bus;
	#appCache;
	#versions;
	#versionsFile;
	#registration;
	#updateSearchParam;
	#hasUpdate = false;

	constructor({ bus, config }) {
		if (!('serviceWorker' in navigator)) return;

		this.#bus               = bus;
		this.#appCache          = config.appCache;
		this.#versionsFile      = config.versionsFile;
		this.#updateSearchParam = config.updateSearchParam;

		this.#cleanUpdateSearchParam();

		navigator.serviceWorker.addEventListener('message', ({ data })   => this.#readMessage(data));
		this.#bus.addEventListener('interface:findUpdate',  ({ detail }) => this.#update(detail));
		this.#bus.addEventListener('interface:getVersions', ({ detail }) => this.#sendVersions(detail));
		this.#bus.addEventListener('interface:install',     ({ detail }) => this.#install(detail));

		if ('requestIdleCallback' in window) {
			requestIdleCallback(() => this.#init());
		} else {
			//fallback pour Safari
			queueMicrotask(() => this.#init());
		}
	}

	async #init() {
		this.#versions = await this.#getInstalledVersion();
		this.#registration = await navigator.serviceWorker.register('./sw.js', { type: 'module' });
		this.#hasUpdate = !!(this.#registration.waiting && this.#registration.active);
		this.#registration.addEventListener('updatefound', () => {
			this.#registration.installing.addEventListener('statechange', () => this.#checkUpdate());
		});
	}

	#cleanUpdateSearchParam() {
		const params = new URLSearchParams(location.search);
		if (params.has(this.#updateSearchParam)) {
			params.delete(this.#updateSearchParam);
			history.replaceState(null, '', params.size ? `?${params}` : '.');
		}
	}

	async #getInstalledVersion() {
		const response = await caches.match(this.#versionsFile, { cacheName: this.#appCache });
		return response ? await response.json() : null;
	}

	#checkUpdate() {
		// Si un service worker est en attente alors qu'un service worker est déja actif,
		// alors il s'agit une mise à jour.
		if (this.#registration.waiting && this.#registration.active) {
			this.#hasUpdate = true;
			queueMicrotask(() => {
				this.#bus.dispatchEvent(new CustomEvent('serviceWorker:newVersion'));
			});
		}
	}

	async #readMessage(message) {
		if (message.type === 'update') {
			this.#reload();
		}
		else if (message.type === 'install') {
			this.#versions = await this.#getInstalledVersion();
		}
	}

	#update() {
		this.#registration?.update();
	}

	#install() {
		const { waiting } = this.#registration;
		if (waiting) {
			waiting.postMessage({ action: 'skipWaiting' });
			return;
		}
		this.#reload();
	}

	#reload() {
		const url = new URL(location.pathname, location.origin);
		url.searchParams.set(this.#updateSearchParam, Date.now());
		window.location.replace(url);
	}

	#sendVersions(callback) {
		callback({ ...this.#versions, hasUpdate: this.#hasUpdate });
	}

}
