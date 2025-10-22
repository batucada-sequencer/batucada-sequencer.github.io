export class Presets {
	#bus;
	#local;
	#index = -1;
	#presets = null;
	#params;
	#lastAction = null;
	#fileName;
	#cacheName;
	#userFileName = null;
	#isPersistedStorage = null;
	#setSearchParam;
	#shareSearchParam;
	#titleSearchParam;
	#defaultSetValue;
	#defaultTitleValue;
	#sharedPresets = null;

	constructor({ bus, app_config, core_config }) {
		this.#bus = bus;
		this.#local = app_config.local;
		this.#fileName = core_config.presetsFile;
		this.#cacheName = core_config.dataCache;
		this.#setSearchParam = core_config.setSearchParam;
		this.#shareSearchParam = core_config.shareSearchParam;
		this.#titleSearchParam = core_config.titleSearchParam;
		this.#defaultSetValue = core_config.defaultSetValue;
		this.#defaultTitleValue = core_config.defaultTitleValue;
		this.#params = new Map(new URLSearchParams(location.search));
		this.#softUpdatePresets();
		addEventListener('focus', () => this.#softUpdatePresets());
		this.#bus.addEventListener('interface:reset', ({ detail }) => this.#reset({ detail }));
		this.#bus.addEventListener('interface:settingsSave', ({ detail }) => this.#settingsSave(detail));
		this.#bus.addEventListener('interface:settingsCancel', ({ detail }) => this.#settingsCancel(detail));
		this.#bus.addEventListener('interface:presetsShare', ({ detail }) => this.#presetsShare(detail));
		this.#bus.addEventListener('interface:presetsImport', ({ detail }) => this.#presetsImport(detail));
		this.#bus.addEventListener('interface:getPresetsDate', ({ detail }) => this.#sendPresetsDate(detail));
		this.#bus.addEventListener('urlState:changed', ({ detail }) => this.#updateParams(detail));
		this.#bus.addEventListener('urlState:openShared', ({ detail }) => this.#openShared(detail));
	}

	async #fetchData() {
		if (!this.#userFileName) {
			const user = new URLSearchParams(location.search).get('user')?.trim() || '0';
			this.#userFileName = `./${this.#cacheName}/preset.php?user=${user}&filename=${this.#fileName}`;
		}
		const cache = await caches.open(this.#cacheName);
		if (this.#local) {
			let response = await cache.match(this.#userFileName);
			if (response) return await response.json();
			// Mise en cache d’un tableau vide si absent
			response = this.#jsonResponse([]);
			await cache.put(this.#userFileName, response);
			return [];
		} else {
			// Cache fetch au premier appel puis network fetch pour les suivants
			const options = this.#presets !== null ? { headers: { 'Cache-Control': 'no-cache' } } : {};
			const response = await fetch(this.#userFileName, options);
			if (!response.ok) throw new Error(`Échec du fetch : ${response.status}`);
			// Ajout au cache uniquement si non présent
			if (!(await cache.match(this.#userFileName))) {
				await cache.put(this.#userFileName, response.clone());
			}
			return response.json();
		}
	}

	async #saveData(data) {
		let response;
		const cache = await caches.open(this.#cacheName);
		if (this.#local) {
			response = this.#jsonResponse(data);
			if (this.#isPersistedStorage === null) {
				this.#isPersistedStorage = await navigator.storage.persist();
				console.log(`Persisted storage granted: ${this.#isPersistedStorage}`);
			}
		} else {
			response = await fetch(this.#userFileName, { method: 'PUT', body: JSON.stringify(data) });
		}
		await cache.put(this.#userFileName, response);
	}

	#jsonResponse(json) {
		return new Response(JSON.stringify(json), {
			status: 200,
			statusText: 'OK',
			headers: {
				'Content-Type': 'application/json',
				'Last-Modified': new Date().toUTCString()
			}
		});
	}

	async #softUpdatePresets() {
		try {
			const presets = await this.#fetchData();
			this.#updatePresets(presets);
		} catch {
			if (this.#presets === null) this.#presets = [];
		}
	}

	#reset() {
		this.#updatePresets(null, this.#defaultTitleValue);
	}

	#updateParams(params) {
		this.#params = params;
		this.#updatePresets();
	}

	#updatePresets(presets = null, title = null) {
		const changes = {}
		if (presets !== null && JSON.stringify(presets) !== JSON.stringify(this.#presets)) {
			this.#presets = presets;
			changes.presets = presets;
		}
		const presetParam = this.#params.get(this.#setSearchParam) || this.#defaultSetValue;
		const titleParam = this.#params.get(this.#titleSearchParam) || this.#defaultTitleValue;
		const isEmpty =  presetParam === this.#defaultSetValue && titleParam === this.#defaultTitleValue;
		const index = (this.#presets === null || isEmpty) 
			? -1
			: this.#presets.findIndex(({ value, name }) => value === presetParam && (!titleParam || name === titleParam));
		if (index !== this.#index) {
			this.#index = index;
			changes.index = index;
		}
		if (title === null) {
			title = titleParam || this.#presets?.[this.#index]?.name || this.#defaultTitleValue;
		}
		if (title !== null && title !== titleParam) {
			this.#params.set(this.#titleSearchParam, title)
			changes.title = title;
		}
		if (Object.keys(changes).length > 0) {
			this.#bus.dispatchEvent(new CustomEvent('presets:changed', { detail: changes }));
		}
	}

	async #settingsSave({ action, name, promise }) {
		try {
			const data = await this.#fetchData(true);
			const value = this.#params.get(this.#setSearchParam) || this.#defaultSetValue;
			const isNewName = ['newOne', 'rename'].includes(action);
			const customValidity = isNewName ? this.#validateNewName(data, name) : '';
			this.#bus.dispatchEvent(new CustomEvent('presets:reportNameValidity', { detail: { action, customValidity } }));
			if (customValidity !== '') return;
			const indexName = action === 'rename' ? this.#params.get(this.#titleSearchParam) : name;
			const index = data.findIndex(preset => preset.name === indexName);
			switch (action) {
				case 'newOne': data.push({ name, value }); break;
				case 'modify': data[index].value = value; break;
				case 'rename': data[index].name = name; break;
				case 'delete': data.splice(index, 1); break;
			}
			if (['newOne', 'rename'].includes(action)) {
				data.sort((a, b) => a.name.localeCompare(b.name));
			}
			await this.#saveData(data);
			this.#lastAction = {
				data: this.#presets,
				title: this.#params.get(this.#titleSearchParam) || this.#defaultTitleValue,
			};
			this.#updatePresets(data, action === 'delete' ? this.#defaultTitleValue : name);
			promise.resolve();
		} 
		catch (error) {
			promise.reject(error);
		}
	}

	#validateNewName(data, name) {
		const existingNames = new Set(data.map(item => item.name));
		existingNames.delete(this.#params.get(this.#titleSearchParam));
		if (!/\S/.test(name)) {
			return 'Doit contenir au moins un caractère.';
		}
		else if (existingNames.has(name)) {
			return 'Ce nom existe déjà.';
		}
		return '';
	}

	async #settingsCancel(promise) {
		try {
			if (!this.#lastAction) throw new Error();
			const { data, title } = this.#lastAction;
			this.#lastAction = null;
			await this.#saveData(data);
			this.#updatePresets(data, title)
			promise.resolve();
		} 
		catch (error) {
			promise.reject(error);
		}
	}

	#openShared(data) {
		try {
			const encoded = decodeURIComponent(data);
			const presets = JSON.parse(encoded);
			if (!presets.length) return
			const links = presets.map(({ name, value }) => {
				const url = new URL(location.origin + location.pathname);
				if (name) url.searchParams.set(this.#titleSearchParam, name);
				if (value) url.searchParams.set(this.#setSearchParam, value);
				return { name, url:url.href };
			});
			this.#sharedPresets = presets;
			this.#bus.dispatchEvent(new CustomEvent('presets:openShared', { detail: links }));
		} catch {
			this.#sharedPresets = null;
		}
	}

	async #presetsImport(promise) {
		try {
			const data = await this.#fetchData();
			const dataMap = new Map(data.map(preset => [preset.name, { ...preset }]));
			for (const { name = this.#defaultTitleValue, value = this.#defaultSetValue } of this.#sharedPresets) {
				dataMap.set(name, { name, value });
			}
			const newData = Array.from(dataMap.values());
			newData.sort((a, b) => a.name.localeCompare(b.name));
			await this.#saveData(newData);
			this.#lastAction = { data };
			this.#updatePresets(newData, null);
			promise.resolve();
		} 
		catch (error) {
			promise.reject(error)
		}
		finally {
			this.#sharedPresets = null;
		}
	}

	async #presetsShare({ presetsIndex, hasCurrent, promise }) {
		const selection = presetsIndex.map(i => {
			const { name, value } = this.#presets[Number(i)];
			return value === '0' ? { name } : { name, value };
		});
		if (hasCurrent) {
			selection.unshift({ value: this.#params.get(this.#setSearchParam) });
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
				await navigator.share({ url });
				return;
			} catch {}
			promise.resolve();
		}
		else {
			await navigator.clipboard.writeText(url);
			promise.reject();
		}
	}

	async #sendPresetsDate(callback) {
		const response = await caches.match(this.#userFileName, { cacheName: this.#cacheName });
		if (!response) return callback(null);
		const lastModified = response.headers.get('last-modified');
		callback(lastModified ? new Date(lastModified) : null);
	}

}