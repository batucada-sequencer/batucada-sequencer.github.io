export default class InterfaceAbout {
	#bus;
	#about =              document.querySelector('#about');
	#contact =            document.querySelector('#contact');
	#dataDate =           document.querySelector('#dataDate');
	#aboutButton =        document.querySelector('footer button');
	#updateButton =       document.querySelector('#update');
	#applicationVersion = document.querySelector('#applicationVersion');
	#instrumentsVersion = document.querySelector('#instrumentsVersion');

	constructor({ bus, email }) {
		this.#bus = bus;
		this.#contact.textContent = email;
		this.#contact.href = `mailto:${email}`;

		this.#aboutButton. addEventListener('click', () => this.#openAbout());
		this.#updateButton.addEventListener('click', () => this.#update());
	}

	showUpdateButton() {
		this.#updateButton.hidden = false;
	}

	#update() {
		this.#about.close();
		document.body.inert = true;
		this.#bus.dispatchEvent(new CustomEvent('interface:install'));
	}

	async #openAbout() {
		try {
			this.#bus.dispatchEvent(new CustomEvent('interface:findUpdate'));
			const lastModified = await new Promise(resolve => {
				this.#bus.dispatchEvent(new CustomEvent('interface:getPresetsDate', { detail: resolve }));
			});
			if (lastModified) {
				const date = new Date(lastModified);
				const localeOpts = { hour12: false };
				dataDate.textContent =
					`${date.toLocaleDateString('fr-FR')} ${date.toLocaleTimeString('fr-FR', localeOpts)}`;
			}
			const versions = await new Promise(resolve => {
				this.#bus.dispatchEvent(new CustomEvent('interface:getVersions', { detail: resolve }));
			});
			if (versions) {
				this.#applicationVersion.textContent = versions.app;
				this.#instrumentsVersion.textContent = versions.static;
				this.#updateButton.hidden = !versions.hasUpdate;
			}
		} catch {}
		this.#about.showModal();
		this.#about.focus();
	}
}