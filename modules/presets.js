export class Presets {
	#local;
	#title;
	#index = -1;
	#presets = [];
	#params;
	#lastAction = null;
	#cacheName = 'data';
	#fileName = 'presets.json';
	#settingsDialog;
	#toast;
	#toastMessage;
	#toastButton;
	#setSearchParam;
	#titleSearchParam;
	#volumeSearchParam;
	#presetsSelection;
	#presetsSelectionInit;
	#headUntitled;
	#headTitlePrefix;
	#isPersistedStorage = null;
	static load;
	static openSettings;

	constructor(references, config) {
		this.#local = config.local;
		this.#title = references.title;
		this.#settingsDialog = references.settingsDialog;
		this.#toast = references.toast;
		this.#toastMessage = references.toastMessage;
		this.#toastButton = references.toastButton;
		this.#setSearchParam = references.setSearchParam;
		this.#titleSearchParam = references.titleSearchParam;
		this.#volumeSearchParam = references.volumeSearchParam;
		this.#presetsSelection = references.presetsSelection;
		this.#presetsSelectionInit = this.#presetsSelection.cloneNode(true);
		this.#headUntitled = references.headUntitled;
		this.#headTitlePrefix = document.title.replace(this.#headUntitled, '');
		this.load = (event) => this.#loadPreset(event.target);
		this.openSettings = event => this.#openSettings(event);
	}

	async init() {
		this.#getSearchParams();
		addEventListener('locationSaved', () => {
			this.#getSearchParams();
			this.#setPresetSelection();
		});
		this.#settingsDialog.addEventListener('submit', (event) => this.#submitDialog(event));
		this.#toast.addEventListener('animationend', this.#toast.hidePopover);
		this.#toastButton.addEventListener('click', () => this.#toastFunction());
		const updateDataNeeded = this.#updateData();
		if (updateDataNeeded) {
			document.addEventListener('visibilitychange', updateDataNeeded);
		}
		const user = this.#params.get('user')?.trim() || '0';
		this.#fileName = `./${this.#cacheName}/preset.php?user=${user}&filename=${this.#fileName}`;
		this.#fetchData().then(data => this.#createOptions(data));
	}

	#fetchData() {
		const getResponse = this.#local
			? caches.open(this.#cacheName).then(cache => cache.match(this.#fileName))
			: fetch(this.#fileName);
		return getResponse
			.then(response => response && response.ok ? response.json() : []);
	}

	#getSearchParams() {
		this.#params = new URLSearchParams(location.search);
	}

	#saveData(data) {
		const body = JSON.stringify(data);
		const response = new Response(body, {
			status: 200,
			statusText: 'OK',
			headers: { 'Content-Type': 'application/json' }
		});
		const cacheResponse = (response) => caches.open(this.#cacheName).then(cache => cache.put(this.#fileName, response));
		if (this.#local) return cacheResponse(response);
		return fetch(this.#fileName, { method: 'PUT', body }).then((response) => cacheResponse(response));
	}

	#updateData() {
		if (this.#local) return null;
		let lastCall = 0;
		const delay = 600000;
		return () => {
			const now = Date.now();
			if (now - lastCall > delay) {
				lastCall = now;
				this.#fetchData().then(data => this.#createOptions(data));
			}
		};
	}

	#loadPreset(preset) {
		this.#index = preset.selectedIndex - 1;
		const { value, name } = this.#presets[this.#index];
		this.#params.set(this.#setSearchParam, value);
		this.#params.set(this.#titleSearchParam, name);
		const volume = this.#params.get(this.#volumeSearchParam);
		if (volume) {
			this.#params.set(this.#volumeSearchParam, volume.slice(0, value.split('-').filter(Boolean).length));
		}
		history.replaceState({}, '', `?${this.#params.toString()}`);
		dispatchEvent(new CustomEvent('locationChanged'));
	}

	#createOptions(presets) {
		if (!Array.isArray(presets)) return;
		this.#presets = presets;
		if (presets.length) {
			const fragment = document.createDocumentFragment();
			fragment.appendChild(this.#presetsSelection.options[0].cloneNode(true));
			presets.forEach(({ name, value }) => fragment.appendChild(new Option(name, value)));
			this.#presetsSelection.replaceChildren(fragment);
		} else {
			this.#presetsSelection.replaceChildren(...this.#presetsSelectionInit.cloneNode(true).options);
		}
		this.#setPresetSelection();
		console.log('Presets loaded');
	}

	#setPresetSelection() {
		const preset = this.#params.get(this.#setSearchParam) || '0';
		const title = this.#params.get(this.#titleSearchParam);
		this.#index = this.#presets.findIndex(({ value, name }) =>
			preset === '0'
				? value === '0' && name === title
				: value === preset
		);
		this.#presetsSelection.selectedIndex = 1 + this.#index;
		if (this.#index !== -1 && !title) {
			this.#setTitle(this.#presets[this.#index].name);
		}
	}

	#showToastMessage(message, button = false) {
		this.#toastButton.hidden = !button;
		this.#toastMessage.textContent = message;
		this.#toast.showPopover();
	}

	#submitDialog(event) {
		if (['add', 'modify' ,'rename' ,'delete'].includes(event.target.id)) {
			event.preventDefault();
			this.#grantPersistedStorage().then(() => this.#saveSettings(event.target));
		}
	}

	async #grantPersistedStorage() {
		if (!this.#local || this.#isPersistedStorage !== null) return;
		this.#isPersistedStorage = await navigator.storage.persist();
		console.log(`Persisted storage granted: ${this.#isPersistedStorage}`);
	}

	async #saveSettings(form) {
		try {
			const data = await this.#fetchData();
			const { id: action, elements, dataset } = form;
			const nameInput = elements['name'];
			const name = nameInput?.value.trim();
			const oldName = this.#presets[this.#index]?.name;
			const value = this.#params.get(this.#setSearchParam);
			const isNewName = ['add', 'rename'].includes(action);
			if (isNewName && !this.#validateNewName(nameInput, data, name, oldName)) return;
			this.#settingsDialog.close();
			const indexName = action === 'rename' ? oldName || '' : name;
			const index = data.findIndex(preset => preset.name === indexName);
			this.#lastAction = { data: structuredClone(data), title: this.#title.textContent };
			switch (action) {
				case 'add': data.push({ name, value }); break;
				case 'modify': data[index].value = value; break;
				case 'rename': data[index].name = name; break;
				case 'delete': data.splice(index, 1); break;
			}
			if (isNewName) {
				data.sort((a, b) => a.name.localeCompare(b.name));
			}
			await this.#saveData(data);
			this.#applyChanges(data, action === 'delete' ? '' : name, dataset.success, true);
		} 
		catch (error) {
			this.#showToastMessage('⚠️ La modification a échoué.');
		}
	}
	
	#validateNewName(nameInput, data, newName, oldName) {
		const existingNames = new Set(data.map(item => item.name));
		existingNames.delete(oldName);
		if (!/\S/.test(newName)) {
			nameInput.setCustomValidity('Doit contenir au moins un caractère.');
		}
		else if (existingNames.has(newName)) {
			nameInput.setCustomValidity('Ce nom existe déjà.');
		}
		if (!nameInput.checkValidity()) {
			nameInput.reportValidity();
			nameInput.addEventListener('input', () => {
				nameInput.setCustomValidity('');
			}, { once: true });
			return false;
		}
		return true;
	}

	async #toastFunction() {
		if (!this.#lastAction) return;
		const { data, title } = this.#lastAction;
		try {
			await this.#saveData(data);
			this.#applyChanges(data, title, 'La modification a été annulée.');
		} catch {
			this.#showToastMessage('⚠️ La modification ne peut être annulée.');
		} finally {
			this.#lastAction = null;
		}
	}

	#openSettings(event) {
		const title = this.#title.textContent;
		const isSelected = this.#index !== -1;
		const isEmpty = isSelected || this.#presets[this.#index] === '0';
		const index = this.#presets.findIndex(({ name }) => name === title);
		const updateSelectOptions = (select) => {
			select.replaceChildren(select.options[0], ...this.#presets.map(({ name }) => new Option(name)));
			select.selectedIndex = 1 + index;
		};
		const forms = {
			add: document.forms['add'],
			modify: document.forms['modify'],
			rename: document.forms['rename'],
			delete: document.forms['delete']
		};
		forms.add.hidden = isSelected;
		forms.rename.hidden = !isSelected;
		forms.modify.hidden = isEmpty || !this.#presets.length;
		forms.delete.hidden = !isEmpty || !this.#presets.length;
		forms.add.elements['name'].value = index !== -1 ? '' : title;
		forms.rename.elements['name'].value = title;
		updateSelectOptions(forms.delete.elements['name']);
		updateSelectOptions(forms.modify.elements['name']);
		this.#settingsDialog.showModal();
	}

	#setTitle(value) {
		this.#title.textContent = value;
		value ? this.#params.set(this.#titleSearchParam, value) : this.#params.delete(this.#titleSearchParam);
		document.title = this.#headTitlePrefix + (value ? value : this.#headUntitled);
		history.replaceState(null, '', this.#params.size ? `?${this.#params.toString()}` : '.');
	}

	#applyChanges(data, title, message, cancel = false) {
		this.#setTitle(title);
		this.#createOptions(data);
		this.#showToastMessage(message, cancel);
	}

}
