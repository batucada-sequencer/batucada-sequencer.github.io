import versions from '../versions.js';

export default class InterfaceAbout {
	#ui;
	#bus;
	#about =              document.querySelector('#about');
	#contact =            document.querySelector('#contact');
	#dataDate =           document.querySelector('#about time');
	#updateButton =       document.querySelector('[command="--update"]');
	#applicationVersion = document.querySelector('#applicationVersion');
	#instrumentsVersion = document.querySelector('#instrumentsVersion');

	constructor({ bus, parent }) {
		this.#bus = bus;
		this.#ui = parent;
		this.#contact.textContent = parent.config.email;
		this.#contact.href = `mailto:${parent.config.email}`;
		this.#about.addEventListener('command', (event) => this.#update(event));
		this.#applicationVersion.textContent = versions.app;
		this.#instrumentsVersion.textContent = versions.static;
		this.#dataDate.textContent = this.#getDate();
	}

	showUpdateButton() {
		this.#updateButton.hidden = false;
	}

	#update({ command }) {
		if (command === 'show-modal') {
			this.#dataDate.textContent = this.#getDate();
			this.#bus.dispatchEvent(new CustomEvent('interface:findUpdate'));
		}
		else if (command === '--update') {
			this.#about.close();
			document.body.inert = true;
			this.#bus.dispatchEvent(new CustomEvent('interface:install'));
		}
	}

	#getDate() {
		return this.#ui.presetsDate?.toLocaleString('fr-FR', { hour12: false }) ?? '-';
	}

}