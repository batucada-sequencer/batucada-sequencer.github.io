export class Interface {
	#maxBars        = 32;
	#subdivision    = 8;
	#stepName       = 'step';
	#barsName       = 'bars';
	#beatName       = 'beat';
	#loopName       = 'loop';
	#trackName      = 'track';
	#volumeName     = 'volume';
	#instrumentName = 'instrument';

	#bpmNode          = document.querySelector('#combo_tempo span');
	#barsNode         = document.querySelector(`#${this.#barsName}`);
	#beatNode         = document.querySelector(`#${this.#beatName}`);
	#loopNode         = document.querySelector(`#${this.#loopName}`);
	#titleNode        = document.querySelector('h1');
	#tempoNode        = document.querySelector('#tempo');
	#presetsNode      = document.querySelector('#combo_presets select');
	#containerNode    = document.querySelector('main');
	#stepsNodes       = document.getElementsByClassName(this.#stepName);
	#tracksNodes      = document.getElementsByClassName(this.#trackName);
	#volumesNodes     = document.getElementsByClassName(this.#volumeName);
	#instrumentsNodes = document.getElementsByClassName(this.#instrumentName);

	#untitled        = document.body.dataset.untitled;
	#headTitlePrefix = `${document.title} - `;
	#stepsPerTrack   = this.#maxBars * this.#subdivision;
	#presetsInit     = this.#presetsNode.cloneNode(true);

	#swapModule      = null;
	#aboutModule     = null;
	#presetsModule   = null;
	#controlsModule  = null;
	#animationModule = null;

	#sharedData    = null;
	#interfaceData = null;

	constructor({ bus, app_config, instruments }) {
		this.#initInterface(instruments, app_config.tracksLength);
		this.#loadModules({ bus, email: app_config.email });

		bus.addEventListener('presets:changed',            ({ detail }) => this.#updateInterface(detail));
		bus.addEventListener('presets:openShared',         ({ detail }) => this.#openSharedPresets(detail));
		bus.addEventListener('presets:reportNameValidity', ({ detail }) => this.#presetsModule?.reportNameValidity(detail));
		bus.addEventListener('urlState:decoded',           ({ detail }) => this.#updateInterface(detail));
		bus.addEventListener('urlState:getInterfaceData',  ({ detail }) => this.#sendInterfaceData(detail));
		bus.addEventListener('sequencer:stopped',          ({ detail }) => this.#controlsModule?.toggleStartButton(false));
		bus.addEventListener('sequencer:updateData',       ({ detail }) => this.#updateInterface(detail));
		bus.addEventListener('sequencer:pushAnimations',   ({ detail }) => this.#animationModule?.setAnimations(detail));
		bus.addEventListener('sequencer:getInterfaceData', ({ detail }) => this.#sendInterfaceData(detail));
		bus.addEventListener('serviceWorker:newVersion',   ({ detail }) => this.#aboutModule?.showUpdateButton(detail));
	}

	#loadModules(context) {
		const modules = [
			{ path: './interface_swap.js',      assign: (instance) => this.#swapModule = instance },
			{ path: './interface_about.js',     assign: (instance) => this.#aboutModule = instance },
			{ path: './interface_presets.js',   assign: (instance) => this.#presetsModule = instance },
			{ path: './interface_controls.js',  assign: (instance) => this.#controlsModule = instance },
			{ path: './interface_animation.js', assign: (instance) => this.#animationModule = instance },
		];
		modules.forEach(({ path, assign }) => {
			import(path).then(module => {
				const instance = new module.default({ ...context, parent: this });
				assign(instance);
				// Cas particulier si l'event 'presets:openShared' a déja été déclenché
				if (path === './interface_presets.js' && this.#sharedData) {
					instance.openShared(this.#sharedData);
					this.#sharedData = null;
				}
			});
		});
	}

	#initInterface(instruments, tracksLength) {
		document.title = this.#headTitlePrefix + this.#untitled;

		const options = instruments.slice(1).map((instrument, index) => new Option(instrument.name, index + 1));
		this.#instrumentsNodes[0].append(...options);

		const firstTrack = this.#tracksNodes[0];
		const extraTracks = Array.from({ length: tracksLength - 1 }, (_, index) => {
			const track = firstTrack.cloneNode(true);
			track.dataset.index = index + 1;
			return track;
		});
		firstTrack.parentNode.append(...extraTracks);

		this.#interfaceData = {
			defaultTempo: this.#tempoNode.value,
			defaultGain: this.#volumesNodes[0].value,
			defaultBars: firstTrack.dataset[this.#barsName],
			defaultBeat: firstTrack.dataset[this.#beatName],
			defaultLoop: firstTrack.dataset[this.#loopName],
			defaultInstrument: firstTrack.dataset[this.#instrumentName],
			barsValues: Array.from(this.#barsNode.options).map(option => option.value),
			beatValues: Array.from(this.#beatNode.options).map(option => option.value),
			loopValues: Array.from(this.#loopNode.options).map(option => option.value),
			tempoStep: this.#tempoNode.step,
			maxBars: this.#maxBars,
			maxGain: this.#volumesNodes[0].max,
			subdivision: this.#subdivision,
			tracksLength,
		};

		// Suppression de l'effet :focus-visible sur <select> avec chrome
		document.querySelectorAll('select').forEach(select => {
			select.addEventListener('pointerdown', () => select.style.outline = 'none', { passive: true });
			select.addEventListener('blur', () => select.style.outline = '');
		});

		// Lightdismiss des <dialog> (closedby="any" transmet le click sur les éléments derrières le backdrop sur mobile)
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

	#updateInterface({ tempo, title, index, tracks, presets }) {
		if (tempo   !== undefined) this.#tempo   = tempo;
		if (title   !== undefined) this.#title   = title;
		if (index   !== undefined) this.#index   = index;
		if (tracks  !== undefined) this.#tracks  = tracks;
		if (presets !== undefined) this.#presets = presets;
	}

	set #tracks(changes) {
		for (const [index, trackChanges] of Object.entries(changes)) {
			const trackIndex = Number(index);
			const trackNode = this.#tracksNodes[trackIndex];
			this.#applyTrackChanges(trackIndex, trackNode, trackChanges);
		}
	}

	set #title(title) {
		this.#titleNode.textContent = title;
		document.title = this.#headTitlePrefix + (title || this.#untitled);
	}

	set #tempo(tempo) {
		this.#tempoNode.value = tempo;
		this.#bpmNode.textContent = tempo;
	}

	set #presets(presets) {
		const fragment = new DocumentFragment();
		if (presets.length) {
			fragment.appendChild(this.#presetsNode.options[0].cloneNode(true));
			presets.forEach(({ name, value }) => {
				const text = name || this.#untitled;
				fragment.appendChild(new Option(text, value));
			});
		} else {
			fragment.replaceChildren(...this.#presetsInit.cloneNode(true).options);
		}
		this.#presetsNode.replaceChildren(fragment);
	}

	set #index(index) {
		this.#presetsNode.selectedIndex = index + 1;
	}

	#applyTrackChanges(trackIndex, trackNode, changes) {
		const { sheet, ...params } = changes;
		sheet?.forEach(change => this.getStepFromIndexes({ trackIndex, ...change }).value = change.value);
		Object.entries(params).forEach(([param, value]) => {
			if (param in trackNode.dataset) trackNode.dataset[param] = value;
			const inputs = {
				[this.#volumeName]:     this.#volumesNodes[trackIndex],
				[this.#instrumentName]: this.#instrumentsNodes[trackIndex],
			};
			if (inputs[param]) inputs[param].value = value;
		});
	}

	#openSharedPresets(data) {
		if (this.#presetsModule) {
			this.#presetsModule.openShared(data);
		} else {
			this.#sharedData = data;
		}
	}

	#sendInterfaceData(callback) {
		callback(structuredClone(this.#interfaceData));
	}

	hasInstrument(track) {
		return track.dataset[this.instrumentName] !== '0';
	}

	getInstrumentName(track) {
		const instrument = track.querySelector(`.${this.#instrumentName}`);
		return instrument.options[instrument.selectedIndex].text;
	}

	getStepFromIndexes({ trackIndex, barIndex, stepIndex }) {
		return this.#stepsNodes[trackIndex * this.#stepsPerTrack + barIndex * this.#subdivision + stepIndex];
	}

	getTrackData(target) {
		const track = target.closest(`.${this.#trackName}`);
		return {
			track,
			trackIndex: track ? Number(track.dataset.index) : null,
		};
	}

	get isRunning() {
		return this.#animationModule ? this.#animationModule.isRunning : false;
	}

	get hasStroke() {
		return Array.prototype.some.call(this.#stepsNodes, step => step.value !== '0');
	}

	get bpm() { return this.#bpmNode; }
	get beat() { return this.#beatNode; }
	get bars() { return this.#barsNode; }
	get loop() { return this.#loopNode; }
	get title() { return this.#titleNode; }
	get steps() { return this.#stepsNodes; }
	get tempo() { return this.#tempoNode; }
	get tracks() { return this.#tracksNodes; }
	get presets() { return this.#presetsNode; }
	get untitled() { return this.#untitled; }
	get stepName() { return this.#stepName; }
	get container() { return this.#containerNode; }
	get volumeName() { return this.#volumeName; }
	get subdivision() { return this.#subdivision; }
	get instruments() { return this.#instrumentsNodes; }
	get instrumentName() { return this.#instrumentName; }

}