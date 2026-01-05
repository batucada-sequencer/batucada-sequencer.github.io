export function init(ui) {

	let trackIndex;
	const startClass = 'started';
	const startButton = document.querySelector('#start');
	const resetButton = document.querySelector('#reset');
	const trackSettings = document.querySelector('#track');
	const instrumentName = document.querySelector('#instrument');

	document.addEventListener('click', handleClick);
	ui.container.addEventListener('input', handleInput);
	ui.container.addEventListener('change', handleChange);
	trackSettings.addEventListener('submit', setTrack);

	Array.from(ui.tracks).forEach(track => {
		track.addEventListener('input', handleTrackChange);
		track.addEventListener('click', openTrackSettings);
	});

	function setTrack(event) {
		if (event.submitter?.name !== 'apply') return;
		const track = ui.tracks[trackIndex];
		const values = track.dataset;
		const fields = {
			beat: ui.beat.value,
			bars: ui.bars.value,
			loop: ui.loop.value
		};
		const changes = {};
		for (const [key, newValue] of Object.entries(fields)) {
			if (values[key] !== newValue) {
				changes[key] = newValue;
			}
		}
		if (Object.keys(changes).length === 0) return;
		document.startViewTransition(() => Object.assign(values, changes));
		const detail = { detail: { tracks: { [trackIndex]: changes } } };
		ui.bus.dispatchEvent(new CustomEvent('interface:inputTrack', detail));
		ui.bus.dispatchEvent(new CustomEvent('interface:changeTrack'));
	}

	async function handleClick({ target }) {
		// Cas où l'audio doit être prêt avant d’agir
		if (target === startButton || target.name === ui.stepName) {
			await audioRequest();
		}
		// Cas où l'audio peut se s'activer en arrière-plan
		else {
			audioRequest();
		}
		if (target.name === ui.stepName) {
			changeNote(target);
		}
		else if (target === resetButton) {
			reset();
		}
		else if (target === startButton) {
			toggleStartButton();
		}
	}

	async function audioRequest() {
		await new Promise(resolve => {
			ui.bus.dispatchEvent(new CustomEvent('interface:audioRequest', { detail: { resolve } }));
		});
	}

	function handleInput({ target }) {
		if (target === ui.presetsSelection) {
			changePreset();
		}
		else if (target === ui.tempo) {
			inputTempo(target.value);
		}
	}

	function handleChange({ target }) {
		if (target === ui.tempo) {
			changeTempo();
		}
		else if (target.name === ui.volumeName) {
			changeVolume();
		}
	}

	function openTrackSettings({ target }) {
		if (target.name !== ui.trackButtonName) return;
		const track = event.currentTarget;
		const values = track.dataset;
		ui.beat.value = values.beat;
		ui.bars.value = values.bars;
		ui.loop.value = values.loop;
		trackIndex = [...ui.tracks].indexOf(track);
		instrumentName.textContent = ui.getInstrumentName(trackIndex);
		trackSettings.showModal();
		trackSettings.focus();
	}

	function changeNote(target) {
		const { trackIndex, barIndex, stepIndex } = ui.getIndexesFromStep(target);
		const change = { barIndex, stepIndex, value: Number(target.value) };
		const event = new CustomEvent('interface:changeNote', { detail: { trackIndex, change } });
		ui.bus.dispatchEvent(event);
	}

	function handleTrackChange({ currentTarget, target }) {
		const trackIndex = [...ui.tracks].indexOf(currentTarget);
		const value = Number(target.value);
		const detail = { detail: { tracks: { [trackIndex]: {} } } };
		if (target.name === ui.instrumentName) {
			ui.tracks[trackIndex].dataset.instrument = value;
			detail.detail.tracks[trackIndex].instrument = value;
			ui.bus.dispatchEvent(new CustomEvent('interface:inputTrack', detail));
			ui.bus.dispatchEvent(new CustomEvent('interface:changeTrack'));
		}
		else if (target.name === ui.volumeName) {
			detail.detail.tracks[trackIndex].volume = value;
			ui.bus.dispatchEvent(new CustomEvent('interface:inputTrack', detail));
		}
	}

	function inputTempo(value) {
		ui.bpm.textContent = value;
		ui.bus.dispatchEvent(new CustomEvent('interface:inputTempo', { detail: Number(value) }));
	}

	function changeVolume() {
		ui.bus.dispatchEvent(new CustomEvent('interface:changeVolume'));
	}

	function changeTempo() {
		ui.bus.dispatchEvent(new CustomEvent('interface:changeTempo'));
	}

	function changePreset() {
		ui.bus.dispatchEvent(new CustomEvent('interface:restart'));
	}

	function reset() {
		ui.bus.dispatchEvent(new CustomEvent('interface:reset'));
	}

	function toggleStartButton(status) {
		const isRunning = ui.isRunning();
		const shouldStart = status ?? !isRunning;
		if (status !== undefined && shouldStart === isRunning) return;
		startButton.setAttribute('aria-checked', String(shouldStart));
		ui.container.classList.toggle(startClass, shouldStart);
		ui.bus.dispatchEvent(new CustomEvent(shouldStart ? 'interface:start' : 'interface:stop'));
	}

	return { toggleStartButton };
}