export default class InterfaceControls {
	#ui;
	#bus;
	#track;
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
	}

	#setTrack(event) {
		if (event.submitter?.name !== 'apply') return;
		const values = this.#track.dataset;
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
		const trackIndex = this.#track.dataset.index;
		const detail = { detail: { tracks: { [trackIndex]: changes } } };
		this.#bus.dispatchEvent(new CustomEvent('interface:inputTrack', detail));
		this.#bus.dispatchEvent(new CustomEvent('interface:changeTrack'));
	}

	async #handleClick({ target }) {
		const audioPromise = this.#audioRequest();

		// Cas où l'audio doit être prêt avant d’agir
		if (target === this.#startButton || target.name === this.#ui.stepName) {
			await audioPromise;
		}

		if (target.name === this.#ui.stepName) {
			this.#changeNote(target);
		}
		else if (target.name === this.#trackButtonName) {
			this.#openTrackSettings(target)
		}
		else if (target === this.#resetButton) {
			this.#reset();
		}
		else if (target === this.#startButton) {
			this.toggleStartButton();
		}
	}

	async #audioRequest() {
		await new Promise(resolve => {
			this.#bus.dispatchEvent(new CustomEvent('interface:audioRequest', { detail: { resolve } }));
		});
	}

	#handleInput({ target }) {
		if (target.name === this.#ui.instrumentName) {
			this.#changeInstrument(target);
			this.#inputTrack(target, 'instrument');
		}
		else if (target.name === this.#ui.volumeName) {
			this.#inputTrack(target, 'volume');
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

	#openTrackSettings(target) {
		const { track } = this.#ui.getTrackData(target);
		const { beat, bars, loop } = track.dataset;
		this.#track = track;
		this.#ui.beat.value = beat;
		this.#ui.bars.value = bars;
		this.#ui.loop.value = loop;
		this.#trackSettingsName.textContent = this.#ui.getInstrumentName(track);
		this.#trackSettings.showModal();
		this.#trackSettings.focus();
	}

	#inputTempo(value) {
		this.#ui.bpm.textContent = value;
		this.#bus.dispatchEvent(new CustomEvent('interface:inputTempo', { detail: Number(value) }));
	}

	#changeNote(target) {
		const { trackIndex } = this.#ui.getTrackData(target);
		const barIndex = Number(target.dataset.bar);
		const stepIndex = Number(target.dataset.step);
		const change = { barIndex, stepIndex, value: Number(target.value) };
		this.#bus.dispatchEvent(
			new CustomEvent('interface:changeNote', { detail: { trackIndex, change } })
		);
	}

	#inputTrack(target, property) {
		const { trackIndex } = this.#ui.getTrackData(target);
		const value = Number(target.value);
		const detail = { detail: { tracks: { [trackIndex]: { [property]: value} } } };
		this.#bus.dispatchEvent(new CustomEvent('interface:inputTrack', detail));
	}

	#changeInstrument(target) {
		const { track } = this.#ui.getTrackData(target);
		track.dataset.instrument = target.value;
		this.#bus.dispatchEvent(new CustomEvent('interface:changeTrack'));
	}

	#changeVolume() {
		this.#bus.dispatchEvent(new CustomEvent('interface:changeVolume'));
	}

	#changeTempo() {
		this.#bus.dispatchEvent(new CustomEvent('interface:changeTempo'));
	}

	#reset() {
		this.#bus.dispatchEvent(new CustomEvent('interface:reset'));
	}

	toggleStartButton(status) {
		const isRunning = this.#ui.isRunning;
		const shouldStart = status ?? !isRunning;
		if (status !== undefined && shouldStart === isRunning) return;
		this.#startButton.setAttribute('aria-checked', String(shouldStart));
		this.#ui.container.classList.toggle(this.#startClass, shouldStart);
		this.#bus.dispatchEvent(new CustomEvent(shouldStart ? 'interface:start' : 'interface:stop'));
	}

}