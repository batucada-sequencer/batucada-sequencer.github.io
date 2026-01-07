export default class InterfaceControls {
	#ui;
	#bus;
	#trackIndex;
	#startClass      = 'started';
	#trackButtonName = 'trackbutton'
	
	#startButton =       document.querySelector('#start');
	#resetButton =       document.querySelector('#reset');
	#trackSettings =     document.querySelector('#track');
	#trackSettingsName = document.querySelector('#instrument');

	constructor({ bus, parent }) {
		this.#bus = bus;
		this.#ui = parent;

		document.           addEventListener('click',  (event) => this.#handleClick(event));
		this.#ui.container. addEventListener('input',  (event) => this.#handleInput(event));
		this.#ui.container. addEventListener('change', (event) => this.#handleChange(event));
		this.#trackSettings.addEventListener('submit', (event) => this.#setTrack(event));

		Array.from(this.#ui.tracks).forEach(track => {
			track.addEventListener('input', (event) => this.#handleTrackChange(event));
			track.addEventListener('click', (event) => this.#openTrackSettings(event));
		});
	}

	#setTrack(event) {
		if (event.submitter?.name !== 'apply') return;
		const track = this.#ui.tracks[this.#trackIndex];
		const values = track.dataset;
		const fields = {
			beat: this.#ui.beat.value,
			bars: this.#ui.bars.value,
			loop: this.#ui.loop.value
		};
		const changes = {};
		for (const [key, newValue] of Object.entries(fields)) {
			if (values[key] !== newValue) {
				changes[key] = newValue;
			}
		}
		if (Object.keys(changes).length === 0) return;
		document.startViewTransition(() => Object.assign(values, changes));
		const detail = { detail: { tracks: { [this.#trackIndex]: changes } } };
		this.#bus.dispatchEvent(new CustomEvent('interface:inputTrack', detail));
		this.#bus.dispatchEvent(new CustomEvent('interface:changeTrack'));
	}

	async #handleClick({ target }) {
		// Cas où l'audio doit être prêt avant d’agir
		if (target === this.#startButton || target.name === this.#ui.stepName) {
			await this.#audioRequest();
		}
		// Cas où l'audio peut se s'activer en arrière-plan
		else {
			this.#audioRequest();
		}
		if (target.name === this.#ui.stepName) {
			this.#changeNote(target);
		}
		else if (target === this.#resetButton) {
			this.#reset();
		}
		else if (target === this.#startButton) {
			this.#toggleStartButton();
		}
	}

	async #audioRequest() {
		await new Promise(resolve => {
			this.#bus.dispatchEvent(new CustomEvent('interface:audioRequest', { detail: { resolve } }));
		});
	}

	#handleInput({ target }) {
		if (target === this.#ui.presetsSelection) {
			this.#changePreset();
		}
		else if (target === this.#ui.tempo) {
			this.#inputTempo(target.value);
		}
	}

	#handleChange({ target }) {
		if (target === this.#ui.tempo) {
			this.#changeTempo();
		}
		else if (target.name === this.#ui.volumeName) {
			this.#changeVolume();
		}
	}

	#openTrackSettings({ target, currentTarget }) {
		if (target.name !== this.#trackButtonName) return;
		const track = currentTarget;
		const values = track.dataset;
		this.#ui.beat.value = values.beat;
		this.#ui.bars.value = values.bars;
		this.#ui.loop.value = values.loop;
		this.#trackIndex = [...this.#ui.tracks].indexOf(track);
		this.#trackSettingsName.textContent = this.#ui.getInstrumentName(this.#trackIndex);
		this.#trackSettings.showModal();
		this.#trackSettings.focus();
	}

	#changeNote(target) {
		const { trackIndex, barIndex, stepIndex } = this.#ui.getIndexesFromStep(target);
		const change = { barIndex, stepIndex, value: Number(target.value) };
		const event = new CustomEvent('interface:changeNote', { detail: { trackIndex, change } });
		this.#bus.dispatchEvent(event);
	}

	#handleTrackChange({ currentTarget, target }) {
		const trackIndex = [...this.#ui.tracks].indexOf(currentTarget);
		const value = Number(target.value);
		const detail = { detail: { tracks: { [trackIndex]: {} } } };
		if (target.name === this.#ui.instrumentName) {
			this.#ui.tracks[trackIndex].dataset.instrument = value;
			detail.detail.tracks[trackIndex].instrument = value;
			this.#bus.dispatchEvent(new CustomEvent('interface:inputTrack', detail));
			this.#bus.dispatchEvent(new CustomEvent('interface:changeTrack'));
		}
		else if (target.name === this.#ui.volumeName) {
			detail.detail.tracks[trackIndex].volume = value;
			this.#bus.dispatchEvent(new CustomEvent('interface:inputTrack', detail));
		}
	}

	#inputTempo(value) {
		this.#ui.bpm.textContent = value;
		this.#bus.dispatchEvent(new CustomEvent('interface:inputTempo', { detail: Number(value) }));
	}

	#changeVolume() {
		this.#bus.dispatchEvent(new CustomEvent('interface:changeVolume'));
	}

	#changeTempo() {
		this.#bus.dispatchEvent(new CustomEvent('interface:changeTempo'));
	}

	#changePreset() {
		this.#bus.dispatchEvent(new CustomEvent('interface:restart'));
	}

	#reset() {
		this.#bus.dispatchEvent(new CustomEvent('interface:reset'));
	}

	#toggleStartButton(status) {
		const isRunning = this.#ui.isRunning;
		const shouldStart = status ?? !isRunning;
		if (status !== undefined && shouldStart === isRunning) return;
		this.#startButton.setAttribute('aria-checked', String(shouldStart));
		this.#ui.container.classList.toggle(this.#startClass, shouldStart);
		this.#bus.dispatchEvent(new CustomEvent(shouldStart ? 'interface:start' : 'interface:stop'));
	}

}