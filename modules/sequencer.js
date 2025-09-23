export class Sequencer {
	#bus;
	#tempo;
	#loopID;
	#tracks;
	#barIndex;
	#maxGain;
	#masterGain;
	#synchroBar;
	#defaultTempo;
	#audioContext;
	#emptyTracks;
	#wakeLock = null;
	#playTimer = null;
	#trackCount = 1;
	#instrumentsList;
	#durationWhenHidden;

	constructor(bus, config, instrumentsList, references) {
		this.#bus = bus;
		this.#instrumentsList = instrumentsList;
		this.#durationWhenHidden = config.durationWhenHidden;
		document.addEventListener('visibilitychange', () => this.#handleVisibilityChange());
		this.#bus.addEventListener('interface:stop', ({ detail }) => this.#stop(detail));
		this.#bus.addEventListener('interface:reset', ({ detail }) => this.#reset(detail));
		this.#bus.addEventListener('interface:start', ({ detail }) => this.#start(detail));
		this.#bus.addEventListener('interface:restart', ({ detail }) => this.#restart(detail));
		this.#bus.addEventListener('interface:audioRequest', ({ detail }) => this.#startAudio(detail));
		this.#bus.addEventListener('interface:swapTracks', ({ detail }) => this.#swapTracks(detail));
		this.#bus.addEventListener('interface:inputTempo', ({ detail }) => this.#inputTempo(detail));
		this.#bus.addEventListener('interface:inputTrack', ({ detail }) => this.#updateData(detail));
		this.#bus.addEventListener('interface:changeNote', ({ detail }) => this.#changeNote(detail));
		this.#bus.addEventListener('interface:changeTempo', ({ detail }) => this.#changeTempo(detail));
		this.#bus.addEventListener('interface:changeTrack', ({ detail }) => this.#changeTrack(detail));
		this.#bus.addEventListener('interface:changeVolume', ({ detail }) => this.#changeVolume(detail));
		this.#bus.addEventListener('urlState:decoded', ({ detail }) => this.#updateData(detail));
		this.#bus.addEventListener('urlState:getTracksData', ({ detail }) => this.#sendTracksData(detail));
		this.#initAudio();
	}

	#start() {
		this.#startSoundLoop();
		this.#wakeLockRequest();
	}

	#restart() {
		this.#barIndex = 0;
	}

	#stop() {
		this.#stopSoundLoop();
		this.#wakeLockRelease();
	}

	#reset() {
		this.#muteSchedulesNotes();
		this.#tempo = this.#defaultTempo;
		this.#tracks = structuredClone(this.#emptyTracks);
	}

	#sendTracksData(callback) {
		callback(() => structuredClone(this.#tracks));
	}

	async #startAudio(promise) {
		if (this.#audioContext.state !== 'running') {
			await this.#audioContext.resume();
		}
		promise.resolve(true);
	}

	async #initAudio() {
		let data;
		const event = new CustomEvent('sequencer:getInterfaceData', { 
			detail: callback => {
				data = callback();
			}
		});
		this.#bus.dispatchEvent(event);
		this.#tempo = data.defaultTempo;
		this.#defaultTempo = data.defaultTempo;
		this.#maxGain = data.maxGain;
		this.#synchroBar = data.defaultBars;
		this.#emptyTracks = Array.from({ length: data.tracksLength }, () => ({
			instrument: data.defaultInstrument,
			bars: data.defaultBars,
			beat: data.defaultBeat,
			volume: data.defaultGain,
			sheet: Array.from({ length: data.maxBars }, () => Array(data.subdivision).fill(0))
		}));
		this.#tracks = structuredClone(this.#emptyTracks);
		if (typeof AudioContext === 'function') {
			this.#audioContext = new AudioContext();
			this.#masterGain = new GainNode(this.#audioContext);
			this.#masterGain.connect(this.#audioContext.destination);
			this.#audioContext.addEventListener('statechange', () => this.#handleAudioStateChange());
			if (document.readyState === 'complete' ) {
				this.#loadInstrumentSounds();
			}
			else {
				addEventListener('load', () => this.#loadInstrumentSounds());
			}
		}
		else {
			this.#masterGain = false;
			this.#audioContext = {
				get currentTime() { return performance.now() / 1000 },
				state: 'running',
				suspend: async () => {},
			};
		}
	}

	async #loadInstrumentSounds() {
		await Promise.all(this.#instrumentsList.map(async (instrument) => {
			instrument.sounds = await Promise.all(instrument.files.map(async (file) => {
				const response = await fetch(`audio/${file}`);
				const buffer = await response.arrayBuffer();
				return this.#audioContext.decodeAudioData(buffer);
			}));
		}));
		console.log('Audio sounds loaded');
	}

	#changeNote({ trackIndex, change }) {
		const track = this.#tracks[trackIndex];
		const { instrument, volume, sheet } = track;
		const { barIndex, stepIndex, value: oldvalue } = change;
		const maxHit = this.#instrumentsList[instrument]?.files.length || 1;
		const value = (oldvalue + 1) % (maxHit + 1);
		change.value = value;
		sheet[barIndex][stepIndex] = value;
		const detail = { tracks: { [trackIndex]: { sheet: [change] } } };
		this.#bus.dispatchEvent(new CustomEvent('sequencer:updateData', { detail } ));
		this.#changeTrack();
		if (value > 0 && this.#wakeLock === null) {
			this.#playNote(instrument, volume, value);
		}
	}

	#changeTrack() {
		const tracks = structuredClone(this.#tracks);
		this.#bus.dispatchEvent(new CustomEvent('sequencer:changed', { detail: { tracks } }));
	}

	#changeVolume() {
		const volumes = this.#tracks.map(track => track.volume);
		this.#bus.dispatchEvent(new CustomEvent('sequencer:changed', { detail: { volumes } }));
	}

	#changeTempo() {
		this.#bus.dispatchEvent(new CustomEvent('sequencer:changed', { detail: { tempo: this.#tempo } }));
	}

	#swapTracks({ sourceIndex, targetIndex }) {
		const [track] = this.#tracks.splice(sourceIndex, 1);
		if (sourceIndex < targetIndex) targetIndex--;
		this.#tracks.splice(targetIndex, 0, track);
		const tracks = structuredClone(this.#tracks);
		const volumes = this.#tracks.map(track => track.volume);
		this.#bus.dispatchEvent(new CustomEvent('sequencer:changed', { detail: { tracks, volumes } }));
	}

	#inputTempo(tempo) {
		this.#tempo = tempo;
	}

	#updateData(changes) {
		for (const [item, itemData] of Object.entries(changes)) {
			if (item === 'tracks') {
				const sheetChanges = {};
				for (const [index, trackChanges] of Object.entries(itemData)) {
					const trackIndex = Number(index);
					const track = this.#tracks[trackIndex];
					for (const [trackItem, itemValue] of Object.entries(trackChanges)) {
						if (trackItem === 'sheet') { 
							for (const { barIndex, stepIndex, value } of itemValue) { 
								track.sheet[barIndex][stepIndex] = value;
							}
						} else {
							track[trackItem] = itemValue;
							if (trackItem === 'instrument') {
								const maxHit = this.#instrumentsList[itemValue]?.files.length || 1;
								track.sheet.forEach((bars, barIndex) => {
									bars.forEach((step, stepIndex) => {
										if (step > maxHit) {
											step = maxHit;
											sheetChanges[trackIndex] ??= {};
											sheetChanges[trackIndex].sheet ??= [];
											sheetChanges[trackIndex].sheet.push({ barIndex, stepIndex, value: maxHit });
										}
									})
								})
								this.#trackCount = this.#getTrackCount();
							} else if (trackItem === 'bars') {
								track.sheet.forEach((bars, barIndex) => {
									if (barIndex < itemValue) return;
									bars.forEach((step, stepIndex) => {
										if (step > 0) {
											step = 0;
											sheetChanges[trackIndex] ??= {};
											sheetChanges[trackIndex].sheet ??= [];
											sheetChanges[trackIndex].sheet.push({ barIndex, stepIndex, value: 0 });
										}
									})
								})
								this.#synchroBar = this.#getSynchroBar();
							} else if (trackItem === 'beat') {
								track.sheet.forEach((bars, barIndex) => {
									bars.forEach((step, stepIndex) => {
										if (stepIndex >= itemValue && step > 0) {
											step = 0;
											sheetChanges[trackIndex] ??= {};
											sheetChanges[trackIndex].sheet ??= [];
											sheetChanges[trackIndex].sheet.push({ barIndex, stepIndex, value: 0 });
										}
									})
								})
							}
						}
					}
				}
				if (Object.keys(sheetChanges).length > 0) {
					this.#bus.dispatchEvent(new CustomEvent('sequencer:updateData', { detail : { tracks: sheetChanges } }));
				}
			} else if (item === 'tempo') {
				this.#inputTempo(itemData);
			}
		}
	}

	#handleVisibilityChange() {
		if (!document.hidden && this.#playTimer) {
			clearTimeout(this.#playTimer);
			this.#playTimer = null;
			this.#wakeLockRequest();
		}
	}

	#handleAudioStateChange() {
		if (this.#audioContext.state !== 'running') {
			this.#bus.dispatchEvent(new CustomEvent('sequencer:stopped'));
		}
	}

	#getTrackCount() {
		const lastTrack = Array.from(this.#tracks).findIndex(track => track.instrument === 0);
		return lastTrack === -1 ? this.#tracks.length : lastTrack + 1;
	}

	#getSynchroBar() {
		const gcd = (a, b) => a ? gcd(b % a, a) : b;
		const lcm = (a, b) => (a * b) / gcd(a, b);
		return this.#tracks.map(track => track.bars).reduce((a, b) => lcm(a, b));
	}

	#playNote(instrument, gain, hit, time = this.#audioContext.currentTime) {
		const buffers = this.#instrumentsList[instrument].sounds;
		if (!buffers) return;
		const buffer = buffers[hit - 1] || buffers[0];
		const sound = new AudioBufferSourceNode(this.#audioContext, { buffer });
		const soundGain = new GainNode(this.#audioContext, { gain: gain / this.#maxGain });
		sound.connect(soundGain);
		soundGain.connect(this.#masterGain);
		sound.start(time);
	}

	#startSoundLoop() {
		const buffer = 0.1;
		this.#barIndex = 0;
		// Décalage de 0.05s pour laisser la méthode performance.now() démarrer
		let barTime = this.#audioContext.currentTime + 0.05;
		const loop = () => {
			const secondsPerBar = 60 / this.#tempo;
			if (this.#audioContext.currentTime + buffer > barTime) {
				const animations = [];
				const delta = performance.now() - barTime * 1000;
				this.#tracks.forEach(({ instrument, bars, beat, volume, sheet }, trackIndex) => {
					if (trackIndex >= this.#trackCount) return;
					const secondsPerStep = secondsPerBar / beat;
					const milliPerStep = secondsPerStep * 1000;
					const barIndex = this.#barIndex % bars;
					for (let stepIndex = 0; stepIndex < beat; stepIndex++) {
						const hit = sheet[barIndex][stepIndex];
						const stepAudioTime = barTime + stepIndex * secondsPerStep;
						const timeStart = stepAudioTime * 1000 + delta;
						const timeEnd = timeStart + milliPerStep;
						animations.push({
							step: { trackIndex, barIndex, stepIndex },
							time: { timeStart, timeEnd },
						});
						if (hit > 0) {
							this.#playNote(instrument, volume, hit, stepAudioTime);
						}
					}
				});
				this.#bus.dispatchEvent(
					new CustomEvent('sequencer:pushAnimations', { detail: { animations } })
				);
				this.#barIndex = (this.#barIndex + 1) % this.#synchroBar;
				barTime += secondsPerBar;
			}
		};
		this.#loopID = setInterval(loop, 50);
	}

	#stopSoundLoop() {
		clearInterval(this.#loopID);
		if (this.#audioContext.state === 'running') {
			this.#muteSchedulesNotes();
		}
	}

	#muteSchedulesNotes() {
		if (!this.#masterGain) return;
		const now = this.#audioContext.currentTime;
		this.#masterGain.gain.cancelScheduledValues(now);
		this.#masterGain.gain.setValueAtTime(this.#masterGain.gain.value, now);
		this.#masterGain.gain.linearRampToValueAtTime(0, now + 0.1);
		setTimeout(() => {
			this.#masterGain.disconnect();
			this.#masterGain = new GainNode(this.#audioContext);
			this.#masterGain.connect(this.#audioContext.destination);
		}, 100);
	}

	async #wakeLockRequest() {
		this.#wakeLock = await navigator.wakeLock.request();
		this.#wakeLock.onrelease = () => {
			if (this.#audioContext.state === 'running') {
				this.#playTimer = setTimeout(() => {
					this.#audioContext.suspend();
					this.#playTimer = null;
				}, this.#durationWhenHidden * 1000);
			}
		};
	}

	#wakeLockRelease() {
		if (this.#wakeLock !== null) {
			this.#wakeLock.onrelease = null;
			this.#wakeLock.release().then(() => this.#wakeLock = null);
		}
	}

}
