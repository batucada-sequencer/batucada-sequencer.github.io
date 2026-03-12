export class Interface {
	#trackKeys = Object.freeze({
		bars:       'bars',
		beats:      'beats',
		steps:      'steps',
		phrase:     'phrase',
		instrument: 'instrument',
	});

	#trackProperties = new Set(Object.values(this.#trackKeys));

	#selectors = Object.freeze({
		bar:         '.bar',
		track:       '.track',
		step:        '[name="step"]',
		volume:      '[name="volume"]',
		instrument:  '[name="instrument"]',
		setBars:     '#bars',
		setBeats:    '#beats',
		setSteps:    '#steps',
		setPhrase:   '#phrase',
		bpm:         '#combo_tempo span',
		title:       '#title',
		tempo:       '#combo_tempo input',
		presets:     '#combo_presets select',
		appTitle:    '#about h2',
		untitled:    '#untitled',
		container:   'main',
		startButton: '#start',
	});

	#modules = Object.freeze([
		{ name: 'presets',   path: './interface_presets.js' },
		{ name: 'aria',      path: './interface_aria.js' },
		{ name: 'swap',      path: './interface_swap.js' },
		{ name: 'about',     path: './interface_about.js' },
		{ name: 'controls',  path: './interface_controls.js' },
		{ name: 'animation', path: './interface_animation.js' },
	]);

	#config;
	#untitled;
	#resolution;
	#firstTrack;
	#instruments;

	#nodes           = {};
	#ready           = {};
	#resolvers       = {};
	#instances       = {};
	#playing         = false;
	#presetsDate     = null;
	#headTitlePrefix = `${document.title} - `;

	constructor({ bus, app_config, core_config, instruments }) {
		this.#initConfig(app_config, core_config);

		this.#ready.dom = new Promise(resolve => this.#resolvers.dom = resolve);
		this.#modules.forEach(({ name }) => {
			this.#ready[name] = new Promise(resolve => this.#resolvers[name] = resolve);
		});

		bus.addEventListener('audio:stop',            ({ detail }) => this.#stop(detail));
		bus.addEventListener('audio:updateData',      ({ detail }) => this.#update(detail));
		bus.addEventListener('audio:pushAnimations',  ({ detail }) => this.#start(detail));
		bus.addEventListener('presets:updateData',    ({ detail }) => this.#update(detail));
		bus.addEventListener('presets:invalidName',   ({ detail }) => this.#instances.presets?.reportNameValidity(detail));
		bus.addEventListener('sw-client:newVersion',  ({ detail }) => this.#instances.about?.showUpdateButton(detail));
		bus.addEventListener('navigation:decoded',    ({ detail }) => this.#update(detail));
		bus.addEventListener('navigation:openShared', ({ detail }) => {
			this.#ready.presets.then(() => this.#instances.presets.openShared(detail));
		});

		queueMicrotask(async () => {
			this.#instruments = instruments;
			this.#buildDom(app_config.tracksLength);
			this.#initMediaSession();
			this.#loadModules(bus);
			this.#setupPolyfills();
		});
	}

	#initConfig(app_config, core_config) {
		this.#firstTrack = document.querySelector(this.#selectors.track);

		const getOptionsValues = (node) => Array.from(node.options, option => option.value | 0);

		const barsValues   = getOptionsValues(this.setBars);
		const beatsValues  = getOptionsValues(this.setBeats);
		const stepsValues  = getOptionsValues(this.setSteps);
		const phraseValues = getOptionsValues(this.setPhrase);

		const maxBars   = Math.max(...barsValues);
		const maxBeats  = Math.max(...beatsValues);
		const maxSteps  = Math.max(...stepsValues);
		const maxPhrase = Math.max(...phraseValues);

		this.#nodes.volumes = [this.#firstTrack.querySelector(this.#selectors.volume)];
		this.#resolution = {
			beat:  maxSteps,
			bar:   maxSteps * maxBeats,
			track: maxSteps * maxBeats * maxBars,
			maxBars,
			maxBeats,
		};

		const { bars, beats, steps, phrase, instrument } = this.#firstTrack.dataset;

		this.#config = Object.freeze({
			...app_config,
			...core_config,
			emptyStroke:       0,
			resolution:        this.#resolution,
			maxGain:           this.#nodes.volumes[0].max | 0,
			defaultTempo:      this.tempo.value | 0,
			defaultGain:       this.#nodes.volumes[0].value | 0,
			defaultBars:       bars | 0,
			defaultBeats:      beats | 0,
			defaultSteps:      steps | 0,
			defaultPhrase:     phrase | 0,
			defaultInstrument: instrument | 0,
			defaultOrder:      Array.from({ length: app_config.tracksLength }, (_, i) => i),
			barsValues, stepsValues, beatsValues, phraseValues, maxPhrase,
		});
	}

	#buildDom(tracksLength) {
		document.title = this.#headTitlePrefix + this.untitled;
		const firstInstrument = this.#firstTrack.querySelector(this.#selectors.instrument);
		const options = this.#instruments.slice(1).map((instrument, i) => new Option(instrument.name, i + 1));
		firstInstrument.replaceChildren(...options);
		firstInstrument.value = this.#config.defaultInstrument;
		const firstBar = this.#firstTrack.querySelector(this.#selectors.bar);
		const barLabelTemplate = firstBar.getAttribute('aria-label').slice(0, -1);
		const barsFragment = new DocumentFragment();

		for (let i = 1; i < this.#resolution.maxBars; i++) {
			const barClone = firstBar.cloneNode(true);
			barClone.dataset.index = i;
			barClone.ariaLabel = `${barLabelTemplate}${i + 1}`;
			barsFragment.appendChild(barClone);
		}
		firstBar.parentNode.appendChild(barsFragment);

		this.#nodes.tracks      = [this.#firstTrack];
		this.#nodes.instruments = [firstInstrument];
		this.#nodes.steps       = [...this.#firstTrack.querySelectorAll(this.#selectors.step)];

		const fragment = new DocumentFragment();
		for (let i = 1; i < tracksLength; i++) {
			const trackClone = this.#firstTrack.cloneNode(true);
			trackClone.dataset.index = i;
			this.#nodes.tracks     .push(trackClone);
			this.#nodes.instruments.push(trackClone.querySelector(this.#selectors.instrument));
			this.#nodes.volumes    .push(trackClone.querySelector(this.#selectors.volume));
			this.#nodes.steps      .push(...trackClone.querySelectorAll(this.#selectors.step));
			this.#nodes.instruments[i].value = this.#config.defaultInstrument;
			fragment.appendChild(trackClone);
		}
		this.#firstTrack.parentNode.appendChild(fragment);
		this.#resolvers.dom();
	}

	#initMediaSession() {
		navigator.mediaSession.metadata = new MediaMetadata({
			title: this.untitled,
			artist: this.appTitle,
		});
		navigator.mediaSession.setActionHandler('play',  () => this.#instances.controls?.start(true));
		navigator.mediaSession.setActionHandler('pause', () => this.#instances.controls?.start(false));
	}

	#loadModules(bus) {
		this.#modules.forEach(({ name, path }) => {
			import(path).then(module => {
				this.#instances[name] = new module.default({ bus, parent: this });
				this.#resolvers[name](); 
			});
		});
	}

	async #setupPolyfills() {
		document.addEventListener('pointerdown', ({ target }) => {
			if (target.tagName === 'SELECT') target.style.outline = 'none';
		}, { passive: true });

		document.addEventListener('focusout', ({ target }) => {
			if (target.tagName === 'SELECT') target.style.outline = '';
		});

		document.addEventListener('click', ({ target }) => {
			if (target instanceof HTMLDialogElement) target.close();
		});

		if (!document.startViewTransition) {
			document.startViewTransition = (callback) => {
				callback();
				return { finished: Promise.resolve() };
			};
		}

		if (!('command' in HTMLButtonElement.prototype)) {
			const { applyPolyfill } = await import('./polyfills/invoker.js');
			applyPolyfill();
		}
	}

	#start(detail) {
		navigator.mediaSession.playbackState = 'playing';
		this.#instances.animation?.start(detail);
	}

	#stop() {
		navigator.mediaSession.playbackState = 'paused';
		this.#instances.animation?.stop();
	}

	set #tracks(values) {
		for (const { id, changes } of values) {
			const trackData = this.#nodes.tracks[id].dataset;
			for (const [item, value] of Object.entries(changes)) {
				if (!this.#trackProperties.has(item)) continue;
				trackData[item] = value;
				if (item === this.#trackKeys.instrument) {
					this.#nodes.instruments[id].value = value;
				}
			}
		}
	}

	set #sheet(values) {
		for (const { stepIndex, value } of values) {
			this.#nodes.steps[stepIndex].value = value;
		}
	}

	set #volumes(values) {
		for (const { id, value } of values) {
			console.log(this.#nodes.volumes[id], value)
			this.#nodes.volumes[id].value = value;
		}
	}

	set #title(value) {
		this.title.textContent = value;
		navigator.mediaSession.metadata.title = value || this.untitled;
		document.title = this.#headTitlePrefix + (value || this.untitled);
	}

	set #tempo(value) {
		this.tempo.value = value;
		this.bpm.textContent = value;
	}

	set #presets({ lastModified, values }) {
		this.#presetsDate = lastModified;
		const fragment = new DocumentFragment();
		values.forEach(({ name, value }) => fragment.appendChild(new Option(name || this.untitled, value)));
		this.presets.replaceChildren(fragment);
	}

	set #index(index) {
		this.presets.selectedIndex = index;
	}

	async #update({ tempo, title, sheet, tracks, volumes, presets, index }) {
		await this.#ready.dom;

		if (tempo   !== undefined) this.#tempo   = tempo;
		if (title   !== undefined) this.#title   = title;
		if (sheet   !== undefined) this.#sheet   = sheet;
		if (tracks  !== undefined) this.#tracks  = tracks;
		if (volumes !== undefined) this.#volumes = volumes;
		if (presets !== undefined) this.#presets = presets;
		if (index   !== undefined) this.#index   = index;

		if (
			tempo   !== undefined ||
			title   !== undefined ||
			sheet   !== undefined ||
			tracks  !== undefined ||
			volumes !== undefined
		) {
			await this.#ready.aria;
			this.#instances.aria.update({ tempo, sheet, tracks, volumes });
		}
	}

	getStepIndex(step) {
		const bar   = step.closest(this.#selectors.bar);
		const track = bar.closest(this.#selectors.track);

		return (track.dataset.index | 0) * this.#resolution.track
			 + (bar.dataset.index   | 0) * this.#resolution.bar
			 + (step.dataset.beat   | 0) * this.#resolution.beat
			 + (step.dataset.step   | 0);
	}

	getTrack(child)      { return child.closest(this.#selectors.track); }

	getTrackIndex(track) { return track.dataset.index | 0; }

	getInstrumentName(track) {
		const id = track.dataset[this.#trackKeys.instrument] | 0;
		return this.#instruments[id].name;
	}

	hasInstrument(track) {
		return track.dataset[this.#trackKeys.instrument] | 0 !== this.#config.defaultInstrument;
	}

	set playing(status) {
		this.#playing = status;
	}

	get hasStroke() { return this.#nodes.steps.some(step => step.value | 0 !== this.#config.emptyStroke); }

	get steps()       { return this.#nodes.steps; }
	get tracks()      { return this.#nodes.tracks; }
	get volumes()     { return this.#nodes.volumes; }
	get instruments() { return this.#nodes.instruments; }
	get bpm()         { return this.#nodes.bpm         ??= document.querySelector(this.#selectors.bpm); }
	get title()       { return this.#nodes.title       ??= document.querySelector(this.#selectors.title); }
	get tempo()       { return this.#nodes.tempo       ??= document.querySelector(this.#selectors.tempo); }
	get presets()     { return this.#nodes.presets     ??= document.querySelector(this.#selectors.presets); }
	get setBars()     { return this.#nodes.setBars     ??= document.querySelector(this.#selectors.setBars); }
	get setSteps()    { return this.#nodes.setSteps    ??= document.querySelector(this.#selectors.setSteps); }
	get setBeats()    { return this.#nodes.setBeats    ??= document.querySelector(this.#selectors.setBeats); }
	get setPhrase()   { return this.#nodes.setPhrase   ??= document.querySelector(this.#selectors.setPhrase); }
	get appTitle()    { return this.#nodes.appTitle    ??= document.querySelector(this.#selectors.appTitle).textContent; }
	get untitled()    { return this.#nodes.untitled    ??= document.querySelector(this.#selectors.untitled).textContent; }
	get container()   { return this.#nodes.container   ??= document.querySelector(this.#selectors.container); }
	get startButton() { return this.#nodes.startButton ??= document.querySelector(this.#selectors.startButton); }

	get config()      { return this.#config; }
	get playing()     { return this.#playing; }
	get presetsDate() { return this.#presetsDate; }

}
