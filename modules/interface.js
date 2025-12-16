export class Interface {
	#maxBars = 32;
	#subdivision = 8;
	#untitled;
	#stepsPerTrack;
	#headTitlePrefix;
	#container;
	#bpm;
	#tempo;
	#title;
	#bars;
	#beat;
	#loop;
	#steps;
	#tracks;
	#trackIndex;
	#volumes;
	#stepName;
	#barsName;
	#beatName;
	#loopName;
	#volumeName;
	#trackButtonName;
	#instrumentName;
	#instruments;
	#presetsSelection;
	#presetsSelectionInit;
	#interfaceData;
	#modules;
	
	constructor({ bus, app_config, instruments }) {
		const email =  app_config.email;
		const container = document.querySelector('main');
		this.#untitled = app_config.untitled;
		this.#bpm = document.querySelector('#combo_tempo span');
		this.#tempo = document.querySelector('#tempo');
		this.#title = document.querySelector('h1');

		this.#presetsSelection = document.querySelector('#combo_presets select');

		this.#stepName = 'step';
		this.#barsName = 'bars';
		this.#beatName = 'beat';
		this.#loopName = 'loop';
		this.#volumeName = 'volume';
		this.#instrumentName = 'instrument';
		this.#trackButtonName = 'trackbutton';

		this.#tracks = document.getElementsByClassName('track');
		this.#steps = document.getElementsByClassName(this.#stepName);
		this.#volumes = document.getElementsByClassName(this.#volumeName);
		this.#instruments = document.getElementsByClassName(this.#instrumentName);
		this.#bars = document.querySelector(`#${this.#barsName}`);
		this.#beat = document.querySelector(`#${this.#beatName}`);
		this.#loop = document.querySelector(`#${this.#loopName}`);

		this.#modules = {
			presets: {
				path: './interface_presets.js',
				params: {
					bus,
					email,
					container,
					title: this.#title,
					untitled: this.#untitled,
					hasStroke: this.#hasStroke.bind(this),
					presetsSelection: this.#presetsSelection,
				},
			},
			controls: {
				path: './interface_controls.js',
				params: {
					bus,
					container,
					bpm: this.#bpm,
					beat: this.#beat,
					bars: this.#bars,
					loop: this.#loop,
					tempo: this.#tempo,
					tracks: this.#tracks,
					stepName: this.#stepName,
					volumeName: this.#volumeName,
					instrumentName: this.#instrumentName,
					trackButtonName: this.#trackButtonName,
					presetsSelection: this.#presetsSelection,
					isRunning: this.#isRunning.bind(this),
					getInstrumentName: this.#getInstrumentName.bind(this),
					getIndexesFromStep: this.#getIndexesFromStep.bind(this),
				}
			},
			about: {
				path: './interface_about.js',
				params: {
					bus,
					email,
					container,
				}
			},
			animation: {
				path: './interface_animation.js',
				params: {
					bus,
					queueLimit: this.#subdivision * 2,
					getStepFromIndexes: this.#getStepFromIndexes.bind(this),
				}
			},
			swap: {
				path: './interface_swap.js',
				params: {
					bus,
					tracks: this.#tracks,
					container,
					isDraggable: this.#isTrackDraggable.bind(this),
				}
			},
		};

		for (const module of Object.values(this.#modules)) {
			module.ready = new Promise(resolve => module.resolve = resolve);
		}

		bus.addEventListener('sequencer:stopped', (event) => this.#modules.controls.toggleStartButton(false));
		bus.addEventListener('sequencer:updateData', ({ detail }) => this.#updateInterface(detail));
		bus.addEventListener('urlState:decoded', ({ detail }) => this.#updateInterface(detail));
		bus.addEventListener('sequencer:pushAnimations', ({ detail }) => this.#modules.animation.setAnimations(detail));
		bus.addEventListener('presets:changed', ({ detail }) => this.#updateInterface(detail));
		bus.addEventListener('presets:openShared', ({ detail }) => this.#modules.presets.ready.then((module) => module.openShared(detail)));
		bus.addEventListener('presets:reportNameValidity', ({ detail }) => this.#modules.presets.reportNameValidity(detail));
		bus.addEventListener('sequencer:getInterfaceData', ({ detail }) => this.#sendInterfaceData(detail));
		bus.addEventListener('urlState:getInterfaceData', ({ detail }) => this.#sendInterfaceData(detail));
		bus.addEventListener('serviceWorker:newVersion', ({ detail }) => this.#modules.about.showUpdateButton(detail));

		this.#loadModules();
		this.#initInterface(instruments, app_config.tracksLength);
	}

	async #loadModules() {
		const loaders = Object.entries(this.#modules).map(async ([name, module]) => {
			const imported = await import(module.path);
			const properties = imported.init(module.params);
			Object.assign(module, properties);
			module.resolve(module);
		});
		await Promise.all(loaders);
	}

	#initInterface(instruments, tracksLength) {
		this.#headTitlePrefix = `${document.title} - `;
		document.title = this.#headTitlePrefix + this.#untitled;

		this.#stepsPerTrack = this.#maxBars * this.#subdivision;
		
		this.#presetsSelectionInit = this.#presetsSelection.cloneNode(true);

		const options = instruments.slice(1).map((instrument, index) => new Option(instrument.name, index + 1));
		this.#instruments[0].append(...options);

		const newTracks = Array.from({ length: tracksLength }, () =>  this.#tracks[0].cloneNode(true));
		this.#tracks[0].parentNode.replaceChildren(...newTracks);

		const defaultData =  this.#tracks[0].dataset;
		this.#interfaceData = {
			defaultTempo: this.#tempo.value,
			defaultGain: this.#volumes[0].value,
			defaultBars: defaultData[this.#barsName],
			defaultBeat: defaultData[this.#beatName],
			defaultLoop: defaultData[this.#loopName],
			defaultInstrument: defaultData[this.#instrumentName],
			barsValues: Array.from(this.#bars.options).map(option => option.value),
			beatValues: Array.from(this.#beat.options).map(option => option.value),
			loopValues: Array.from(this.#loop.options).map(option => option.value),
			tempoStep: this.#tempo.step,
			maxBars: this.#maxBars,
			maxGain: this.#volumes[0].max,
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

	}

	#updateInterface(changes) {
		Object.entries(changes).forEach(([item, value]) => {
			switch (item) {
				case 'tempo':   this.#updateTempo(value); break;
				case 'title':   this.#updateTitle(value); break;
				case 'tracks':  this.#updateTracks(value); break;
				case 'presets': this.#updatePresets(value); break;
				case 'index':   this.#updatePresetsIndex(value); break;
			}
		});
	}

	#updateTracks(changes) {
		for (const [index, trackChanges] of Object.entries(changes)) {
			const trackIndex = Number(index);
			const track = this.#tracks[trackIndex];
			for (const [item, data] of Object.entries(trackChanges)) {

				if (item === 'sheet') {
					for (const { barIndex, stepIndex, value } of data) {
						this.#getStepFromIndexes({ trackIndex, barIndex, stepIndex }).value = value;
					}
				} else if (item in track.dataset) {
					track.dataset[item] = data;
				}

				if (item === this.#instrumentName) {
					this.#instruments[trackIndex].value = data;
				} else if (item === this.#volumeName) {
					this.#volumes[trackIndex].value = data;
				}

			}
		}
	}

	#updateTitle(title) {
		this.#title.textContent = title;
		document.title = this.#headTitlePrefix + (title || this.#untitled);
		console.log('Presets title updated');
	}

	#updateTempo(tempo) {
		this.#tempo.value = tempo;
		this.#bpm.textContent = tempo;
	}

	#updatePresets(presets) {
		const fragment = new DocumentFragment();
		if (presets.length) {
			fragment.appendChild(this.#presetsSelection.options[0].cloneNode(true));
			presets.forEach(({ name, value }) => {
				const text = name || this.#untitled;
				fragment.appendChild(new Option(text, value));
			});
		} else {
			fragment.replaceChildren(...this.#presetsSelectionInit.cloneNode(true).options);
		}
		this.#presetsSelection.replaceChildren(fragment);
		console.log('Presets options updated');
	}

	#updatePresetsIndex(index) {
		this.#presetsSelection.selectedIndex = index + 1;
		console.log('Presets index updated');
	}

	#isRunning() {
		return this.#modules.animation.isRunning();
	}

	#isTrackDraggable(track) {
		return track.dataset[this.#instrumentName] !== '0';
	}

	#hasStroke() {
		return Array.prototype.some.call(this.#steps, step => step.value !== '0');
	}

	#getInstrumentName(trackIndex) {
		const instrument = this.#instruments[trackIndex];
		return instrument.options[instrument.selectedIndex].text;
	}

	#getIndexesFromStep(step) {
		let stepPosition = 0;
		for (stepPosition; stepPosition < this.#steps.length; stepPosition++) {
			if (this.#steps[stepPosition] === step) break;
		}
		const trackIndex = Math.floor(stepPosition / this.#stepsPerTrack);
		const remainder = stepPosition % this.#stepsPerTrack;
		const barIndex = Math.floor(remainder / this.#subdivision);
		const stepIndex = remainder % this.#subdivision;
		return { trackIndex, barIndex, stepIndex };
	}

	#getStepFromIndexes({ trackIndex, barIndex, stepIndex }) {
		return this.#steps[trackIndex * this.#stepsPerTrack + barIndex * this.#subdivision + stepIndex];
	}

	#sendInterfaceData(callback) {
		callback(structuredClone(this.#interfaceData));
	}
}