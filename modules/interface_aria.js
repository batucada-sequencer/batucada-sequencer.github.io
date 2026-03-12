export default class InterfaceAria {
	static #bpmToken        = '{{bpm}}';
	static #strokeToken     = '{{stroke}}';
	static #instrumentToken = '{{instrument}}';

	static #strokes = [
		null,
		'note 1',
		'note 2',
		'note 3',
	];

	#ui;
	#bus;
	#rowNodes = [];
	#emptyStrokeValue;
	#volumeRatioPerCent;
	#emptyInstrumentName;

	constructor({ bus, parent }) {
		bus.addEventListener('audio:stop', () => this.#playing = false);
		bus.addEventListener('interface:updateData', ({ detail }) => this.update(detail));
		this.#ui  = parent;
		this.#init();
	}

	#init() {
		const step                = this.#ui.steps[0];
		this.#emptyStrokeValue    = this.#ui.config.emptyStroke;
		InterfaceAria.#strokes[0] = this.#getDefaultValue(step, InterfaceAria.#strokeToken);

		const volume              = this.#ui.volumes[0];
		this.#emptyInstrumentName = this.#getDefaultValue(volume, InterfaceAria.#instrumentToken);
		this.#volumeRatioPerCent  = 100 / ((volume.max | 0) - (volume.min | 0));

		this.#ui.tracks.forEach((container, id) => {
			this.#rowNodes[id] = container.querySelector('[scope="row"]');
		});
	}

	#getDefaultValue(element, token) {
		const { ariaLabel, dataset: { labelTemplate: template } } = element;
		const prefixLength = template.indexOf(token);
		const suffixLength = template.length - (prefixLength + token.length);
		return ariaLabel.slice(prefixLength, ariaLabel.length - suffixLength);
	}

	update({ tempo, sheet, tracks, volumes, playing }) {
		if (tempo   !== undefined) this.#tempo   = tempo;
		if (sheet   !== undefined) this.#sheet   = sheet;
		if (tracks  !== undefined) this.#tracks  = tracks;
		if (volumes !== undefined) this.#volumes = volumes;
		if (playing !== undefined) this.#playing = playing;
	}

	set #tempo(value) {
		const tempo = this.#ui.tempo;
		tempo.ariaValueText = tempo.dataset.valuetextTemplate.replace(InterfaceAria.#bpmToken, value);
	}

	set #playing(value) {
		this.#ui.startButton.ariaChecked = value;
	}

	set #sheet(values) {
		for (const { stepIndex, value } of values) {
			const step = this.#ui.steps[stepIndex];
			step.ariaPressed = value !== this.#emptyStrokeValue;
			step.ariaLabel = step.dataset.labelTemplate.replace(InterfaceAria.#strokeToken, InterfaceAria.#strokes[value]);
		}
	}

	set #tracks(values) {
		for (const { id, changes } of values) {
			if ('instrument' in changes) {
				const row          = this.#rowNodes[id];
				const track        = this.#ui.tracks[id];
				const volume       = this.#ui.volumes[id];
				const instrument   = this.#ui.instruments[id];
				const hasIntrument = this.#ui.hasInstrument(track);
				const name         = hasIntrument ? this.#ui.getInstrumentName(track).toLowerCase() : this.#emptyInstrumentName;
				row.ariaLabel = row.dataset.labelTemplate.replace(InterfaceAria.#instrumentToken, name);
				volume.ariaLabel = volume.dataset.labelTemplate.replace(InterfaceAria.#instrumentToken, name);
				instrument.ariaLabel = hasIntrument ? instrument.dataset.labelActive : instrument.dataset.labelEmpty;
			}
		}
	}

	set #volumes(values) {
		for (const { id, value } of values) {
			const volume = this.#ui.volumes[id];
			volume.ariaValueText = `${Math.round((volume.value | 0) * this.#volumeRatioPerCent)} %`;
		}
	}

}