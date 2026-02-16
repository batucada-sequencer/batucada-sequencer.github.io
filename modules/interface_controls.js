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
			bars:   this.#ui.setBars.value,
			beats:  this.#ui.setBeats.value,
			steps:  this.#ui.setSteps.value,
			phrase: this.#ui.setPhrase.value,
		};
		const changes = {};
		for (const [key, newValue] of Object.entries(fields)) {
			if (values[key] !== newValue) {
				changes[key] = Number(newValue);
			}
		}
		if (Object.keys(changes).length === 0) return;
		document.startViewTransition(() => Object.assign(values, changes));
		const trackIndex = this.#track.dataset.index;
		const detail = { detail: { tracks: [ { id:trackIndex, changes } ] } };
		this.#bus.dispatchEvent(new CustomEvent('interface:updateData', detail));
	}

	async #handleClick({ target }) {
		const audioPromise = new Promise(resolve => {
			this.#bus.dispatchEvent(new CustomEvent('interface:audioRequest', { detail: { resolve } }));
		});
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
			this.#bus.dispatchEvent(new CustomEvent('interface:reset'));
		}
		else if (target === this.#startButton) {
			this.toggleStartButton();
		}
	}

	#handleChange({ target }) {
		if (target === this.#ui.tempo) {
			this.#bus.dispatchEvent(new CustomEvent('interface:changeTempo'));
		}
		else if (target.name === this.#ui.volumeName) {
			this.#bus.dispatchEvent(new CustomEvent('interface:changeVolume'));
		}
	}

	#handleInput({ target }) {
		if (target.name === this.#ui.instrumentName) {
			this.#inputInstrument(target);
		}
		else if (target.name === this.#ui.volumeName) {
			this.#inputVolume(target);
		}
		else if (target === this.#ui.tempo) {
			this.#inputTempo(target);
		}
	}

	#openTrackSettings(target) {
		const track = this.#ui.getTrack(target);
		const { bars, beats, steps, phrase } = track.dataset;
		this.#track = track;
		this.#ui.setBars.value   = bars;
		this.#ui.setBeats.value  = beats;
		this.#ui.setSteps.value  = steps;
		this.#ui.setPhrase.value = phrase;
		this.#trackSettingsName.textContent = this.#ui.getInstrumentName(track);
		this.#trackSettings.showModal();
		this.#trackSettings.focus();
	}

	#changeNote(target) {
		const value = Number(target.value);
		const stepIndex = this.#ui.getStepIndex(target);
		const detail = { detail: { sheet: [{ stepIndex, value }] } };
		this.#bus.dispatchEvent(new CustomEvent('interface:changeNote', detail));
	}

	#inputInstrument(target) {
		const value = Number(target.value);
		const track = this.#ui.getTrack(target);
		const index = this.#ui.getTrackIndex(track);
		track.dataset.instrument = value;
		const trackChanges = [
			{ id: index, changes: { instrument: value } }
		];
		this.#bus.dispatchEvent(new CustomEvent('interface:updateData', {
			detail: { tracks: trackChanges }
		}));
	}

	#inputVolume(target) {
		const track = this.#ui.getTrack(target);
		const trackIndex = this.#ui.getTrackIndex(track);
		const value = Number(target.value);
		const detail = { detail: { volumes: [ { id:trackIndex, value } ] } };
		this.#bus.dispatchEvent(new CustomEvent('interface:updateData', detail));
	}

	#inputTempo(target) {
		this.#ui.bpm.textContent = target.value;
		const value = Number(target.value);
		const detail = { detail: { tempo: value } };
		this.#bus.dispatchEvent(new CustomEvent('interface:updateData', detail));
	}

	toggleStartButton() {
		if (this.#ui.playing) {
			this.#bus.dispatchEvent(new CustomEvent('interface:stop'));
			this.stop();
		}
		else {
			this.#bus.dispatchEvent(new CustomEvent('interface:start'));
			this.#start();
		}
	}

	#start() {
		this.#startButton.setAttribute('aria-checked', 'true');
		this.#ui.container.classList.add(this.#startClass);
	}

	stop() {
		this.#startButton.setAttribute('aria-checked', 'false');
		this.#ui.container.classList.remove(this.#startClass);
	}

}