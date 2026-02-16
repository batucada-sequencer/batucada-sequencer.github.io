export class UrlState {
	#bus;
	#worker;
	#searchParams;
	#setSearchParam;
	#titleSearchParam;
	#tempoSearchParam;
	#volumeSearchParam;
	#shareSearchParam;
	#defaultSetValue;
	#defaultTitleValue;

	constructor({ bus, config, instruments }) {
		this.#bus               = bus;
		this.#searchParams      = new URLSearchParams(location.search);
		this.#setSearchParam    = config.setSearchParam;
		this.#titleSearchParam  = config.titleSearchParam;
		this.#tempoSearchParam  = config.tempoSearchParam;
		this.#volumeSearchParam = config.volumeSearchParam;
		this.#shareSearchParam  = config.shareSearchParam;
		this.#defaultSetValue   = config.defaultSetValue;
		this.#defaultTitleValue = config.defaultTitleValue;

		this.#worker = new Worker(new URL('./url-state_worker.js', import.meta.url));
		this.#worker.onmessage = (event) => this.#handleWorkerMessage(event.data);

		this.#bus.addEventListener('audio:state',             ({ detail }) => this.#cacheState(detail));
		this.#bus.addEventListener('audio:changed',           ({ detail }) => this.#encodeURL(detail));
		this.#bus.addEventListener('presets:changed',         ({ detail }) => this.#encodeURL(detail));
		this.#bus.addEventListener('presets:presetSelected',  ({ detail }) => this.#presetSelected(detail));
		this.#bus.addEventListener('interface:reset',         ({ detail }) => this.#reset());
		this.#bus.addEventListener('interface:moveTrack',     ({ detail }) => this.#moveTrack(detail));
		this.#bus.addEventListener('interface:presetClicked', ({ detail }) => this.#presetClicked(detail));
		this.#bus.addEventListener('interface:sharedClosed',  ({ detail }) => this.#sharedClosed(detail));

		this.#init(instruments, config);
	}

	#init(instrumentsList, config) {
		this.#searchParams.delete(config.updateSearchParam);

		const hasToDecodeNow = this.#searchParams.size > 0 && !this.#sharedOpen();

		const workerConfig = {
			resolution:        config.resolution,
			emptyStroke:       config.emptyStroke,
			tracksLength:      config.tracksLength,
			tempoStep:         config.tempoStep,
			defaultGain:       config.defaultGain,
			defaultBars:       config.defaultBars,
			defaultBeats:      config.defaultBeats,
			defaultSteps:      config.defaultSteps,
			defaultTempo:      config.defaultTempo,
			defaultOrder:      config.defaultOrder,
			defaultPhrase:     config.defaultPhrase,
			defaultSetValue:   config.defaultSetValue,
			defaultTitleValue: config.defaultTitleValue,
			defaultInstrument: config.defaultInstrument,
			setSearchParam:    config.setSearchParam,
			tempoSearchParam:  config.tempoSearchParam,
			titleSearchParam:  config.titleSearchParam,
			volumeSearchParam: config.volumeSearchParam,
			barsIndex:         [config.defaultBars,   ...config.barsValues  .filter(value => value !== config.defaultBars)],
			beatsIndex:        [config.defaultBeats,  ...config.beatsValues .filter(value => value !== config.defaultBeats)],
			stepsIndex:        [config.defaultSteps,  ...config.stepsValues .filter(value => value !== config.defaultSteps)],
			phraseIndex:       [config.defaultPhrase, ...config.phraseValues.filter(value => value !== config.defaultPhrase)],
			instrumentsIndex:  instrumentsList.map(({ id, files }) => ({ id, base: files.length + 1 })),
			hasToDecodeNow,
		}

		this.#postMessage('init', workerConfig);
	}

	#handleWorkerMessage(data) {
		const { action, payload } = data;
		if (action === 'encoded') {
			this.#searchParams = new URLSearchParams(payload);
			history.replaceState(null, '', this.#searchParams.size ? `?${this.#searchParams}` : '.');
			this.#bus.dispatchEvent(new CustomEvent('urlState:changed', { detail: new Map(this.#searchParams) }));
		}
		else if (action === 'decoded') {
			this.#bus.dispatchEvent(new CustomEvent('urlState:decoded', { detail: payload }));
		}
	}

	#presetSelected({ name, value }) {
		this.#searchParams.set(this.#setSearchParam, value  || this.#defaultSetValue);
		this.#searchParams.set(this.#titleSearchParam, name || this.#defaultTitleValue);
		this.#decodePreset();
	}

	#presetClicked(href) {
		const url = new URL(href);
		this.#searchParams = new URLSearchParams(url.search);
		this.#decodePreset();
	}

	#decodePreset() {
		history.replaceState(null, '', `?${this.#searchParams}`);
		this.#postMessage('decode');
		this.#bus.dispatchEvent(new CustomEvent('urlState:changed', { detail: new Map(this.#searchParams) }));
	}

	#sharedClosed() {
		if (this.#searchParams.has(this.#shareSearchParam)) {
			this.#searchParams.delete(this.#shareSearchParam);
			history.replaceState(null, '', this.#searchParams.size ? `?${this.#searchParams}` : '.');
		}
	}

	#sharedOpen() {
		const shared = this.#searchParams.get(this.#shareSearchParam);
		if (shared) {
			this.#bus.dispatchEvent(new CustomEvent('urlState:openShared', { detail: shared }));
			return true;
		}
		return false;
	}

	#cacheState(values) {
		queueMicrotask(() => this.#postMessage('cache', values));
	}

	#encodeURL(values) {
		queueMicrotask(() => this.#postMessage('encode', values));
	}

	#moveTrack(moved) {
		queueMicrotask(() => this.#postMessage('move', moved));
	}

	#postMessage(action, values = null) {
		const transferables = [];
		const payload = { searchParams: Object.fromEntries(this.#searchParams.entries()) };
		if (values) {
			payload.values = values;
			if (values.sheet) {
				transferables.push(values.sheet.buffer);
			}
		}
		this.#worker.postMessage({ action, payload }, transferables);
	}

	#reset() {
		this.#searchParams.delete(this.#setSearchParam);
		this.#searchParams.delete(this.#titleSearchParam);
		this.#searchParams.delete(this.#tempoSearchParam);
		this.#searchParams.delete(this.#volumeSearchParam);
		this.#worker.postMessage({ action: 'reset' });
		history.replaceState(null, '', this.#searchParams.size ? `?${this.#searchParams}` : '.');
	}

}