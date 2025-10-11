export class ServiceWorker {
	#bus;
	#installed;
	#registration;
	#versions = null;
	#appCache = 'app';
	#versionsFile = 'versions.json';

	constructor(bus) {
		if (!('serviceWorker' in navigator)) return;
		this.#bus = bus;
		navigator.serviceWorker.addEventListener('message', ({ data }) => this.#readMessage(data));
		this.#bus.addEventListener('interface:findUpdate', ({ detail }) => this.#update(detail));
		this.#bus.addEventListener('interface:getVersions', ({ detail }) => this.#sendVersions(detail));
		this.#bus.addEventListener('interface:install', ({ detail }) => this.#install(detail));
		this.#init();
	}

	async #init() {
		this.#registration = await navigator.serviceWorker.register('./sw.js');
		if (this.#registration.waiting && this.#registration.active) {
			this.#bus.dispatchEvent(new CustomEvent('serviceWorker:newVersion'));
		}
		this.#registration.addEventListener('updatefound', () => {
			const newWorker = this.#registration.installing;
			newWorker.addEventListener('statechange', async () => {
				const versionsExists = await caches.match(this.#versionsFile, { cacheName: this.#appCache });
				if (newWorker.state === 'installed' && versionsExists) {
					this.#bus.dispatchEvent(new CustomEvent('serviceWorker:newVersion'));
				}
			});
		});
	}

	#readMessage(message) {
		if (message.type === 'update') {
			window.location.reload();
		}
	}

	#update() {
		this.#registration.update();
	}

	#install() {
		this.#registration.waiting.postMessage({ action: 'skipWaiting' });
	}

	async #sendVersions(callback) {
		if (this.#versions === null) {
			const response = await caches.match(this.#versionsFile, { cacheName: this.#appCache });
			if (response?.ok) {
				this.#versions = await response.json();
			}
		}
		callback(this.#versions);
	}

}
