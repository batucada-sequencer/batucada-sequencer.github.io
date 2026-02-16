export class Presets {
	#bus;
	#local;
	#params;
	#fileName;
	#cacheName;
	#setSearchParam;
	#shareSearchParam;
	#titleSearchParam;
	#defaultSetValue;
	#defaultTitleValue;
	#index              = -1;
	#presets            = null;
	#lastAction         = null;
	#userFileName       = null;
	#sharedPresets      = null;
	#isPersistedStorage = null;

	constructor({ bus, config }) {
		this.#bus               = bus;
		this.#local             = config.local;
		this.#fileName          = config.presetsFile;
		this.#cacheName         = config.dataCache;
		this.#setSearchParam    = config.setSearchParam;
		this.#shareSearchParam  = config.shareSearchParam;
		this.#titleSearchParam  = config.titleSearchParam;
		this.#defaultSetValue   = config.defaultSetValue;
		this.#defaultTitleValue = config.defaultTitleValue;

		this.#params = new Map(new URLSearchParams(location.search));
		this.#softUpdatePresets();

		addEventListener('focus', () => this.#softUpdatePresets());
		this.#bus.addEventListener('interface:reset',          ({ detail }) => this.#reset(detail));
		this.#bus.addEventListener('interface:settingsSave',   ({ detail }) => this.#settingsSave(detail));
		this.#bus.addEventListener('interface:settingsCancel', ({ detail }) => this.#settingsCancel(detail));
		this.#bus.addEventListener('interface:presetSelected', ({ detail }) => this.#presetSelected(detail));
		this.#bus.addEventListener('interface:presetsShare',   ({ detail }) => this.#presetsShare(detail));
		this.#bus.addEventListener('interface:presetsImport',  ({ detail }) => this.#presetsImport(detail));
		this.#bus.addEventListener('interface:getPresetsDate', ({ detail }) => this.#sendPresetsDate(detail));
		this.#bus.addEventListener('urlState:changed',         ({ detail }) => this.#updateParams(detail));
		this.#bus.addEventListener('urlState:openShared',      ({ detail }) => this.#openShared(detail));
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

	#presetSelected(detail) {
		this.#index = detail.index;
		this.#bus.dispatchEvent(new CustomEvent('presets:presetSelected', { detail }));
	}

	#reset() {
		const changes = {};
		if (this.#index !== -1) {
			this.#index = -1;
			changes.index = this.#index;
		}
		if (
			this.#params.has(this.#titleSearchParam) 
			&& this.#params.get(this.#titleSearchParam) !== this.#defaultTitleValue
		) {
			this.#params.delete(this.#titleSearchParam);
			changes.title = this.#defaultTitleValue;
		}
		this.#params.delete(this.#setSearchParam);
		this.#dispatchChanges(changes);
	}

	#updateParams(params) {
		if (this.#params.get(this.#setSearchParam) !== params.get(this.#setSearchParam)) {
			this.#params = params;
			this.#updatePresets();
		}
	}

	#updatePresets(presets = null, title = null) {
		const changes = {};
		if (presets !== null && JSON.stringify(presets) !== JSON.stringify(this.#presets)) {
			this.#presets = presets;
			changes.presets = presets;
		}
		const setValue    = this.#params.get(this.#setSearchParam)   || this.#defaultSetValue;
		const titleValue  = this.#params.get(this.#titleSearchParam) || this.#defaultTitleValue;
		const targetTitle = title !== null ? title : titleValue;
		const hasTitle    = targetTitle !== this.#defaultTitleValue;
		const isEmpty     = setValue === this.#defaultSetValue && !hasTitle;
		const index       = (this.#presets === null || isEmpty) 
			? -1
			: this.#presets.findIndex(({ value, name }) => 
				value === setValue && (!hasTitle || name === targetTitle)
			);
		//on passe toujours l'index si presets a été modifié
		if ('presets' in changes || index !== this.#index) {
			this.#index = index;
			changes.index = index;
		}
		if (title === null) {
			title = titleValue || this.#presets?.[this.#index]?.name || this.#defaultTitleValue;
		}
		if (title !== titleValue) {
			this.#params.set(this.#titleSearchParam, title);
			changes.title = title;
		}
		this.#dispatchChanges(changes);
	}

	#dispatchChanges(changes) {
		if (Object.keys(changes).length) {
			this.#bus.dispatchEvent(new CustomEvent('presets:updateData', { detail: changes }));
			if ('title' in changes) {
				this.#bus.dispatchEvent(new CustomEvent('presets:changed', { detail: { title: changes.title } }));
			}
		}
	}

	#resolveTitle(title) {
		return title || 
			this.#params.get(this.#titleSearchParam) || 
			this.#presets?.[this.#index]?.name || 
			this.#defaultTitleValue;
	}

	#resolveIndex(title) {
		const presetParam = this.#params.get(this.#setSearchParam) || this.#defaultSetValue;
		const isEmpty = presetParam === this.#defaultSetValue && title === this.#defaultTitleValue;
		if (this.#presets === null || isEmpty) return -1;
		return this.#presets.findIndex(({ value, name }) => value === presetParam && name === title);
	}


	async #settingsSave({ action, name, promise }) {
		try {
			const data = await this.#fetchData(true);
			const value = this.#params.get(this.#setSearchParam) || this.#defaultSetValue;
			const isNewName = ['newOne', 'rename'].includes(action);
			const customValidity = isNewName ? this.#validateNewName(data, name) : 'valid';
			this.#bus.dispatchEvent(new CustomEvent('presets:reportNameValidity', { detail: { action, customValidity } }));
			if (customValidity !== 'valid') return;
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
				data:  this.#presets,
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
			return 'empty';
		}
		else if (existingNames.has(name)) {
			return 'duplicated';
		}
		return 'valid';
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

	async #presetsShare({ presetsIndex, promise }) {
		if (presetsIndex.length === 0) return;
		const selection = presetsIndex.map(i => {
			const index = Number(i);
			if (index === -1) {
				return { value: this.#params.get(this.#setSearchParam) }
			}
			const { name, value } = this.#presets[index];
			return value === '0' ? { name } : { name, value };
		});
		const url = new URL(location.origin + location.pathname);
		if (selection.length > 1) {
			url.searchParams.set(this.#shareSearchParam, encodeURIComponent(JSON.stringify(selection)));
		} else {
			const { name, value } = selection[0];
			if (name)  url.searchParams.set(this.#titleSearchParam, name);
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