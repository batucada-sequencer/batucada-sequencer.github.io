export class Interface {
	#config
	#resolveDom;
	#resolution;
	#firstTrack;

	#bpmNode;
	#titleNode;
	#tempoNode;
	#presetsNode;
	#stepsNodes;
	#tracksNodes;
	#volumesNodes;
	#setBarsNode;
	#setStepsNode;
	#setBeatsNode;
	#setPhraseNode;
	#containerNode;
	#instrumentsNodes;

	#barName        = 'bar';
	#barsName       = 'bars';
	#stepName       = 'step';
	#stepsName      = 'steps';
	#beatsName      = 'beats';
	#trackName      = 'track';
	#phraseName     = 'phrase';
	#volumeName     = 'volume';
	#instrumentName = 'instrument';

	#untitled        = document.body.dataset.untitled;
	#headTitlePrefix = `${document.title} - `;

	#swapModule      = null;
	#aboutModule     = null;
	#presetsModule   = null;
	#controlsModule  = null;
	#animationModule = null;

	#playing       = false;
	#isDomReady    = false;
	#sharedData    = null;

	#domReady = new Promise(resolve => this.#resolveDom = resolve);

	constructor({ bus, app_config, core_config, instruments }) {
		document.title = this.#headTitlePrefix + this.#untitled;
		this.#initConfig(app_config, core_config);
		this.#initListeners(bus);
		queueMicrotask(async () => {
			this.#buildDom(instruments, app_config);
			this.#loadModules(bus);
			this.#setupPolyfills();
		});
	}

	#initConfig(app_config, core_config) {
		this.#firstTrack = document.querySelector(`.${this.#trackName}`);

		const getOptionsValues = (node) => Array.from(node.options, opt => opt.value | 0);

		const barsValues   = getOptionsValues(this.setBars);
		const beatsValues  = getOptionsValues(this.setBeats);
		const stepsValues  = getOptionsValues(this.setSteps);
		const phraseValues = getOptionsValues(this.setPhrase);

		const maxBars   = Math.max(...barsValues);
		const maxBeats  = Math.max(...beatsValues);
		const maxSteps  = Math.max(...stepsValues);
		const maxPhrase = Math.max(...phraseValues);

		this.#volumesNodes = [this.#firstTrack.querySelector(`.${this.#volumeName}`)];
		this.#resolution = {
			beat:  maxSteps,
			bar:   maxSteps * maxBeats,
			track: maxSteps * maxBeats * maxBars,
			maxBars,
			maxBeats,
		}

		const { bars, beats, steps, phrase, instrument } = this.#firstTrack.dataset;

		this.#config = Object.freeze({
			...app_config,
			...core_config,
			emptyStroke:       0,
			resolution:        this.#resolution,
			maxGain:           this.#volumesNodes[0].max | 0,
			defaultTempo:      this.tempo.value | 0,
			defaultGain:       this.#volumesNodes[0].value | 0,
			defaultBars:       bars | 0,
			defaultBeats:      beats | 0,
			defaultSteps:      steps | 0,
			defaultPhrase:     phrase | 0,
			defaultInstrument: instrument | 0,
			defaultOrder:      Array.from({ length: app_config.tracksLength }, (_, i) => i),
			barsValues,
			stepsValues,
			beatsValues,
			phraseValues,
			maxPhrase,
		});
	}


	#buildDom(instruments, app_config) {
		const firstInstrument = this.#firstTrack.querySelector(`.${this.#instrumentName}`);
		const options = instruments.slice(1).map((inst, i) => new Option(inst.name, i + 1));
		firstInstrument.replaceChildren(...options);
		firstInstrument.value = this.#config.defaultInstrument;

		const firstBar = this.#firstTrack.querySelector(`.${this.#barName}`);
		const barsFragment = new DocumentFragment();
		for (let i = 1; i < this.#resolution.maxBars; i++) {
			const barClone = firstBar.cloneNode(true);
			barClone.dataset.index = i;
			barsFragment.appendChild(barClone);
		}
		firstBar.parentNode.appendChild(barsFragment);

		this.#tracksNodes      = [this.#firstTrack];
		this.#instrumentsNodes = [firstInstrument];
		this.#stepsNodes       = [...this.#firstTrack.getElementsByClassName(this.#stepName)];

		const fragment = new DocumentFragment();
		for (let i = 1; i < app_config.tracksLength; i++) {
			const trackClone = this.#firstTrack.cloneNode(true);
			trackClone.dataset.index = i;
			this.#tracksNodes     .push(trackClone);
			this.#instrumentsNodes.push(trackClone.querySelector(`.${this.#instrumentName}`));
			this.#volumesNodes    .push(trackClone.querySelector(`.${this.#volumeName}`));
			this.#stepsNodes      .push(...trackClone.getElementsByClassName(this.#stepName));
			this.#instrumentsNodes[i].value = this.#config.defaultInstrument;
			fragment.appendChild(trackClone);
		}
		this.#firstTrack.parentNode.appendChild(fragment);
		this.#isDomReady = true;
		this.#resolveDom();
	}

	#initListeners(bus) {
		bus.addEventListener('audio:stop',                 ({ detail }) => this.#animationModule?.stop(detail));
		bus.addEventListener('audio:updateData',           ({ detail }) => this.#updateInterface(detail));
		bus.addEventListener('audio:pushAnimations',       ({ detail }) => this.#animationModule?.start(detail));
		bus.addEventListener('presets:updateData',         ({ detail }) => this.#updateInterface(detail));
		bus.addEventListener('presets:openShared',         ({ detail }) => this.#openSharedPresets(detail));
		bus.addEventListener('presets:reportNameValidity', ({ detail }) => this.#presetsModule?.reportNameValidity(detail));
		bus.addEventListener('urlState:decoded',           ({ detail }) => this.#updateInterface(detail));
		bus.addEventListener('serviceWorker:newVersion',   ({ detail }) => this.#aboutModule?.showUpdateButton(detail));
	}

	#loadModules(bus) {
		const modules = [
			{ path: './interface_swap.js',      assign: (instance) => this.#swapModule      = instance },
			{ path: './interface_about.js',     assign: (instance) => this.#aboutModule     = instance },
			{ path: './interface_presets.js',   assign: (instance) => this.#presetsModule   = instance },
			{ path: './interface_controls.js',  assign: (instance) => this.#controlsModule  = instance },
			{ path: './interface_animation.js', assign: (instance) => this.#animationModule = instance },
		];

		modules.forEach(({ path, assign }) => {
			import(path).then(module => {
				const instance = new module.default({ bus, parent: this });
				assign(instance);
				// Cas particulier si l'event 'presets:openShared' a déja été déclenché
				if (path === './interface_presets.js' && this.#sharedData) {
					instance.openShared(this.#sharedData);
					this.#sharedData = null;
				}
			});
		});
	}

	#setupPolyfills() {
		// Suppression de l'effet :focus-visible sur <select> avec chrome
		document.addEventListener('pointerdown', ({ target }) => {
			if (target.tagName === 'SELECT') target.style.outline = 'none';
		}, { passive: true });

		document.addEventListener('focusout', ({ target }) => {
			if (target.tagName === 'SELECT') target.style.outline = '';
		});

		// Lightdismiss programmatique des <dialog> 
		// (car closedby="any" transmet le click sur les éléments derrières le backdrop)
		document.addEventListener('click', ({ target }) => {
			if (target instanceof HTMLDialogElement) {
				target.close();
			}
		});

		// Fallback si ViewTransition n'est supporté
		if (!document.startViewTransition) {
			document.startViewTransition = (callback) => {
				callback();
				return {
					finished: Promise.resolve()
				};
			};
		}
	}

	async #updateInterface({ tempo, title, sheet, tracks, volumes, presets, index }) {
		if (!this.#isDomReady) await this.#domReady;
		if (tempo   !== undefined) this.#tempo   = tempo;
		if (title   !== undefined) this.#title   = title;
		if (sheet   !== undefined) this.#sheet   = sheet;
		if (tracks  !== undefined) this.#tracks  = tracks;
		if (volumes !== undefined) this.#volumes = volumes;
		if (presets !== undefined) this.#presets = presets;
		if (index   !== undefined) this.#index   = index;
	}

	set #tracks(values) {
		for (const { id, changes } of values) {
			const trackData = this.#tracksNodes[id].dataset;
			for (const [item, value] of Object.entries(changes)) {
				if (!['instrument', 'bars', 'beats', 'steps', 'phrase'].includes(item)) continue;
				trackData[item] = value;
				if (item === this.#instrumentName) {
					this.#instrumentsNodes[id].value = value;
				}
			}
		}
	}

	set #sheet(values) {
		for (const { stepIndex, value } of values) {
			this.#stepsNodes[stepIndex].value = value;
		}
	}

	set #volumes(values) {
		for (const { id, value } of values) {
			this.#volumesNodes[id].value = value;
		}
	}

	set #title(value) {
		this.title.textContent = value;
		document.title = this.#headTitlePrefix + (value || this.#untitled);
	}

	set #tempo(value) {
		this.tempo.value = value;
		this.bpm.textContent = value;
	}

	set #presets(presets) {
		const fragment = new DocumentFragment();
		presets.forEach(({ name, value }) => fragment.appendChild(new Option(name || this.#untitled, value)));
		this.presets.replaceChildren(fragment);
	}

	set #index(index) {
		this.presets.selectedIndex = index;
	}

	#openSharedPresets(data) {
		if (this.#presetsModule) {
			this.#presetsModule.openShared(data);
		} else {
			this.#sharedData = data;
		}
	}

	getStepIndex(step) {
		const bar   = step.closest(`.${this.#barName}`);
		const track = bar.closest(`.${this.#trackName}`);

		const trackIndex = track.dataset.index | 0;
		const barIndex   = bar.dataset.index   | 0;
		const beatIndex  = step.dataset.beat   | 0;
		const stepIndex  = step.dataset.step   | 0;

		return trackIndex * this.#resolution.track
			  + barIndex  * this.#resolution.bar
			  + beatIndex * this.#resolution.beat
			  + stepIndex;
	}

	getTrack(child) {
		return child.closest(`.${this.#trackName}`);
	}

	getTrackIndex(track) {
		return track.dataset.index | 0;
	}

	getInstrumentName(track) {
		const instrument = track.querySelector(`.${this.#instrumentName}`);
		return instrument.options[instrument.selectedIndex].text;
	}

	hasInstrument(track) {
		return track.dataset[this.#instrumentName] !== '0';
	}

	set playing(status) {
		if (!status) {
			this.#controlsModule?.stop();
		}
		this.#playing = status;
	}

	get hasStroke() {
		return this.#stepsNodes.some(step => step.value !== '0');
	}

	get email()          { return this.#config.email; }
	get steps()          { return this.#stepsNodes; }
	get config()         { return this.#config; }
	get tracks()         { return this.#tracksNodes; }
	get playing()        { return this.#playing; }
	get stepName()       { return this.#stepName; }
	get untitled()       { return this.#untitled; }
	get container()      { return this.#containerNode; }
	get volumeName()     { return this.#volumeName; }
	get instrumentName() { return this.#instrumentName; }

	get bpm()       { return this.#bpmNode       ??= document.querySelector('#combo_tempo span'); }
	get title()     { return this.#titleNode     ??= document.querySelector('h1'); }
	get tempo()     { return this.#tempoNode     ??= document.querySelector('#tempo'); }
	get presets()   { return this.#presetsNode   ??= document.querySelector('select.presets'); }
	get setBars()   { return this.#setBarsNode   ??= document.querySelector(`#${this.#barsName}`); }
	get setSteps()  { return this.#setStepsNode  ??= document.querySelector(`#${this.#stepsName}`); }
	get setBeats()  { return this.#setBeatsNode  ??= document.querySelector(`#${this.#beatsName}`); }
	get setPhrase() { return this.#setPhraseNode ??= document.querySelector(`#${this.#phraseName}`); }
	get container() { return this.#containerNode ??= document.querySelector('main'); }
}