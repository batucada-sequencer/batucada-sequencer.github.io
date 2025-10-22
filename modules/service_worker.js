export class ServiceWorker {
	#bus;
	#appCache;
	#startUrl;
	#versions;
	#versionsFile;
	#registration;
	#hasUpdate = false;

	constructor({ bus, core_config }) {
		if (!('serviceWorker' in navigator)) return;
		this.#bus = bus;
		this.#appCache = core_config.appCache;
		this.#versionsFile = core_config.versionsFile;
		navigator.serviceWorker.addEventListener('message', ({ data }) => this.#readMessage(data));
		this.#bus.addEventListener('interface:findUpdate', ({ detail }) => this.#update(detail));
		this.#bus.addEventListener('interface:getVersions', ({ detail }) => this.#sendVersions(detail));
		this.#bus.addEventListener('interface:install', ({ detail }) => this.#install(detail));
		this.#init();
	}

	async #init() {
		this.#startUrl = location.origin + location.pathname;
		this.#versions = await this.#getInstalledVersion();
		this.#registration = await navigator.serviceWorker.register('./sw.js');
		this.#hasUpdate = !!(this.#registration.waiting && this.#registration.active);
		this.#registration.addEventListener('updatefound', () => {
			this.#registration.installing.addEventListener('statechange', () => this.#checkUpdate());
		});
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
			this.#bus.dispatchEvent(new CustomEvent('serviceWorker:newVersion'));
		}
	}

	async #readMessage(message) {
		if (message.type === 'update') {
			window.location.replace(this.#startUrl);
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
		window.location.replace(this.#startUrl);
	}

	#sendVersions(callback) {
		callback({ ...this.#versions, hasUpdate: this.#hasUpdate });
	}

}
