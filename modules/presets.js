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
	#shareSearchParam;
	#shared;
	#shareList;
	#sharedList;
	#shareButton;
	#checkBoxShare;
	#checkBoxMaster;
	#checkBoxCurrent;
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
		this.#shareSearchParam = references.shareSearchParam;
		this.#titleSearchParam = references.titleSearchParam;
		this.#shared = references.shared;
		this.#shareList = references.shareList;
		this.#sharedList = references.sharedList;
		this.#shareButton = references.shareButton;
		this.#checkBoxMaster = references.checkBoxMaster;
		this.#checkBoxCurrent = references.checkBoxCurrent;
		this.#presetsSelection = references.presetsSelection;
		this.#presetsSelectionInit = this.#presetsSelection.cloneNode(true);
		this.#headUntitled = references.headUntitled;
		this.#headTitlePrefix = document.title.replace(this.#headUntitled, '');
		this.load = (event) => this.#loadSelectedPreset(event.target);
		this.openSettings = event => this.#openSettings(event);
	}

	async init() {
		this.#getSearchParams();
		this.#showShared();
		addEventListener('popstate', () => this.#toggleShared());
		addEventListener('locationSaved', () => {
			this.#getSearchParams();
			this.#setPresetSelection();
		});
		document.addEventListener('submit', (event) => this.#submitDialog(event));
		this.#shared.addEventListener('close', (event) => this.#clearShared(event));
		this.#sharedList.addEventListener('click', (event) => this.#loadSharedPreset(event));
		this.#checkBoxMaster.form.addEventListener('change', (event) => this.#checkValues(event));
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

	#loadSharedPreset(event) {
		const url = event.target.href;
		if (!url) return;
		event.preventDefault();
		const params = new URL(url).searchParams;
		const name = params.get(this.#titleSearchParam) || '';
		const value = params.get(this.#setSearchParam) || '0';
		const returnValue = JSON.stringify({ name, value });
		this.#shared.requestClose(returnValue);
	}

	#loadSelectedPreset(preset) {
		this.#index = preset.selectedIndex - 1;
		this.#loadPreset(this.#presets[this.#index]);
	}

	#loadPreset(preset) {
		this.#params.set(this.#setSearchParam, preset.value);
		this.#params.set(this.#titleSearchParam, preset.name);
		history.replaceState({}, '', `?${this.#params}`);
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
		const preset = this.#params.get(this.#setSearchParam);
		const title = this.#params.get(this.#titleSearchParam);
		this.#index = this.#presets.findIndex(({ value, name }) =>
			preset ? value === preset : value === '0' && name === title
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
		else if (event.submitter.name === 'share_list') {
			this.#showShareList(event.submitter.popoverTargetElement);
		}
		else if (event.submitter.name === 'share') {
			this.#sharePresets(event.target);
		}
	}

	#showShareList(dialog) {
		const items = this.#presets.map(({ name }, index) => {
			const li = document.createElement('li');
			const label = document.createElement('label');
			const checkBox = Object.assign(document.createElement('input'), {
				type: 'checkbox',
				name: 'index',
				value: index,
				checked: index === this.#index,
			});
			label.append(checkBox, document.createTextNode(name));
			li.append(label);
			return { checkBox, li };
		});
		this.#shareList.replaceChildren(...items.map(item => item.li));
		this.#checkBoxShare = items.map(item => item.checkBox);
		this.#checkBoxMaster.disabled = !this.#presets.length;
		this.#checkBoxCurrent.disabled = this.#index !== -1 || !this.#params.get(this.#setSearchParam);
		this.#checkBoxCurrent.checked = !this.#checkBoxCurrent.disabled;
		this.#checkValues();
		dialog.showModal();
		this.#checkBoxShare[this.#index]?.scrollIntoView({ behavior: 'instant', block: 'center' });
	}

	#checkValues(event) {
		if (event && event.target === this.#checkBoxMaster) {
			this.#checkBoxShare.forEach(checkbox => checkbox.checked = this.#checkBoxMaster.checked);
		}
		const checkedCount = this.#checkBoxShare.filter(checkbox => checkbox.checked).length;
		this.#checkBoxMaster.checked = checkedCount > 0 && checkedCount === this.#checkBoxShare.length;
		this.#shareButton.disabled = checkedCount === 0 && !this.#checkBoxCurrent.checked;
	}

	async #sharePresets(form) {
		const data = new FormData(form);
		const indexes = new Set(data.getAll('index').map(Number));
		const selection = this.#presets
			.filter((item, index) => indexes.has(index))
			.map(({ name, value }) => value === '0' ? { name } : { name, value });
		if (this.#checkBoxCurrent.checked) {
			selection.unshift({ value: this.#params.get(this.#setSearchParam) });
			console.log(selection)
		}
		if (selection.length === 0) return;
		const url = new URL(location.origin + location.pathname);
		if (selection.length > 1) {
			url.searchParams.set(this.#shareSearchParam, encodeURIComponent(JSON.stringify(selection)));
		} else {
			const { name, value } = selection[0];
			if (name) url.searchParams.set(this.#titleSearchParam, name);
			if (value) url.searchParams.set(this.#setSearchParam, value);
		}
		if (navigator.share) {
			try {
				await navigator.share({ title: this.#headTitlePrefix + 'Morceaux partagés', url });
				return;
			} catch {}
		}
		else {
			await navigator.clipboard.writeText(url);
			this.#showToastMessage('Lien de partage copié dans le presse-papier.');
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
			const value = this.#params.get(this.#setSearchParam) || '0';
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
		forms.modify.hidden = isSelected || !this.#params.has(this.#setSearchParam) || !this.#presets.length;
		forms.rename.hidden = !isSelected;
		forms.delete.hidden = !isSelected || !this.#presets.length;
		if (!forms.add.hidden) {
			forms.add.elements['name'].value = index !== -1 ? '' : title;
		}
		if (!forms.rename.hidden) {
			forms.rename.elements['name'].value = title;
		}
		if (!forms.delete.hidden) {
			forms.delete.elements['name'].value = this.#presets[this.#index].name;
		}
		if (!forms.modify.hidden) {
			updateSelectOptions(forms.modify.elements['name']);
		}
		this.#settingsDialog.showModal();
	}

	#setTitle(value) {
		this.#title.textContent = value;
		value ? this.#params.set(this.#titleSearchParam, value) : this.#params.delete(this.#titleSearchParam);
		document.title = this.#headTitlePrefix + (value ? value : this.#headUntitled);
		history.replaceState(null, '', this.#params.size ? `?${this.#params}` : '.');
	}

	#applyChanges(data, title, message, cancel = false) {
		this.#setTitle(title);
		this.#createOptions(data);
		this.#showToastMessage(message, cancel);
	}

	#showShared(data) {
		if (!this.#params.has(this.#shareSearchParam)) return;
		const encoded = decodeURIComponent(data || this.#params.get('share'));
		const presets = JSON.parse(encoded);
		if (!presets.length) return
		this.#sharedList.replaceChildren(
			...presets.map(({ name, value }) => {
				const a = document.createElement('a');
				const li = document.createElement('li');
				const url = new URL(location.origin + location.pathname);
				if (name) url.searchParams.set(this.#titleSearchParam, name);
				if (value) url.searchParams.set(this.#setSearchParam, value);
				a.href = url.href;
				a.textContent = name || 'Morceau sans titre';
				li.appendChild(a);
				return li;
			})
		);
		this.#shared.showModal();
		this.#sharedList.focus();
		this.#sharedList.blur();
	}

	#clearShared() {
		if (this.#params.has(this.#shareSearchParam)) {
			this.#params.delete(this.#shareSearchParam);
			history.pushState(null, '', this.#params.size ? `?${this.#params}` : '.');
		}
		if (this.#shared.returnValue) {
			const preset = JSON.parse(this.#shared.returnValue);
			this.#loadPreset(preset);
			this.#setPresetSelection();
		}
	}

	#toggleShared() {
		const shared = this.#params.has(this.#shareSearchParam);
		this.#getSearchParams();
		shared ? this.#shared.close() : this.#showShared();
	}


}

