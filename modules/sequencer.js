export class Sequencer {
	#bus;
	#tempo;
	#loopID;
	#tracks;
	#barIndex;
	#maxGain;
	#masterGain;
	#synchroBar;
	#defaultData;
	#audioContext;
	#emptyStroke = 0;
	#wakeLock = null;
	#playTimer = null;
	#trackCount = 1;
	#instrumentsList;
	#durationWhenHidden;

	constructor({ bus, app_config, instruments }) {
		this.#bus = bus;
		this.#instrumentsList = instruments;
		this.#durationWhenHidden = app_config.durationWhenHidden;
		document.addEventListener('visibilitychange', () => this.#handleVisibilityChange());
		this.#bus.addEventListener('interface:stop', ({ detail }) => this.#stop(detail));
		this.#bus.addEventListener('interface:reset', ({ detail }) => this.#reset(detail));
		this.#bus.addEventListener('interface:start', ({ detail }) => this.#start(detail));
		this.#bus.addEventListener('interface:restart', ({ detail }) => this.#restart(detail));
		this.#bus.addEventListener('interface:audioRequest', ({ detail }) => this.#startAudio(detail));
		this.#bus.addEventListener('interface:moveTrack', ({ detail }) => this.#moveTrack(detail));
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

	async #initAudio() {
		const data = await new Promise(resolve => {
				this.#bus.dispatchEvent(new CustomEvent('sequencer:getInterfaceData', { detail: resolve }));
			});
		this.#maxGain = Number(data.maxGain);
		this.#synchroBar = Number(data.defaultBars);
		this.#defaultData = {
			tempo: Number(data.defaultTempo),
			bars: JSON.parse(data.defaultBars),
			beat: JSON.parse(data.defaultBeat),
			loop: JSON.parse(data.defaultLoop),
			volume: JSON.parse(data.defaultGain),
			instrument: JSON.parse(data.defaultInstrument),
		};
		this.#tempo = this.#defaultData.tempo;
		this.#tracks = Array.from({ length: Number(data.tracksLength) }, () => ({
			bars: this.#defaultData.bars,
			beat: this.#defaultData.beat,
			loop: this.#defaultData.loop,
			volume: this.#defaultData.volume,
			instrument: this.#defaultData.instrument,
			sheet: Array.from({ length: Number(data.maxBars) }, () => Array(Number(data.subdivision)).fill(this.#emptyStroke))
		}));
		if (typeof AudioContext === 'function') {
			this.#audioContext = new AudioContext();
			this.#masterGain = new GainNode(this.#audioContext);
			this.#masterGain.connect(this.#audioContext.destination);
			this.#audioContext.addEventListener('statechange', () => this.#handleAudioStateChange());
			this.#loadInstrumentSounds();
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

	#start() {
		this.#startSoundLoop();
		this.#wakeLockRequest();
	}

	#restart() {
		this.#barIndex = 0;
	}

	#stop() {
		this.#stopSoundLoop();
		this.#muteSchedulesNotes();
		this.#wakeLockRelease();
	}

	#reset() {
		this.#muteSchedulesNotes();
		const changes = {};
		if (this.#tempo !== this.#defaultData.tempo) {
			this.#tempo = this.#defaultData.tempo;
			changes.tempo = this.#tempo;
		}
		const tracksChange = {};
		for (const trackIndex in this.#tracks) {
			const trackChanges = this.#resetTrack(trackIndex);
			if (Object.keys(trackChanges).length > 0) {
				tracksChange[trackIndex] = trackChanges;
			}
		}
		if (Object.keys(tracksChange).length > 0) {
			changes.tracks = tracksChange;
		}
		const tracks = structuredClone(this.#tracks);
		const volumes = this.#tracks.map(track => track.volume);
		this.#bus.dispatchEvent(new CustomEvent('sequencer:updateData', { detail: changes }));
		this.#bus.dispatchEvent(new CustomEvent('sequencer:changed', { detail: { tracks, volumes, tempo: this.#tempo } }));
	}

	#resetTrack(index) {
		const track = this.#tracks[index];
		const trackChanges = {};
		['bars', 'beat', 'loop', 'volume', 'instrument'].forEach(item => {
			if (track[item] !== this.#defaultData[item]) {
				track[item] = this.#defaultData[item];
				trackChanges[item] = JSON.stringify(track[item]);
			}
		});
		const sheetChanges = [];
		track.sheet.forEach((bar, barIndex) => {
			bar.forEach((step, stepIndex) => {
				if (step !== this.#emptyStroke) {
					bar[stepIndex] = this.#emptyStroke;
					sheetChanges.push({ barIndex, stepIndex, value: this.#emptyStroke });
				}
			});
		});
		if (sheetChanges.length > 0) {
			trackChanges.sheet = sheetChanges;
		}
		return trackChanges;
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
		if (value > this.#emptyStroke && this.#wakeLock === null) {
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

	#moveTrack({ sourceIndex, targetIndex }) {
		if (targetIndex === null) {
			// Déplace la piste à la fin du tableau
			this.#tracks.push(this.#tracks.splice(sourceIndex, 1)[0]);
			const newIndex = this.#tracks.length - 1;
			// Réinitialise la piste
			const changes = { tracks: { [newIndex]: this.#resetTrack(newIndex) } };
			this.#bus.dispatchEvent(new CustomEvent('sequencer:updateData', { detail: changes }));
		}
		else {
			// Interversion des pistes 
			const [track] = this.#tracks.splice(sourceIndex, 1);
			if (sourceIndex < targetIndex) targetIndex--;
			this.#tracks.splice(targetIndex, 0, track);
		}
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
					if ('sheet' in trackChanges) {
						for (const { barIndex, stepIndex, value } of trackChanges.sheet) {
							track.sheet[barIndex][stepIndex] = value;
						}
					}
					for (const [trackItem, itemValue] of Object.entries(trackChanges)) {
						if (!['instrument', 'bars', 'beat', 'loop', 'volume'].includes(trackItem)) continue;
						const value = JSON.parse(itemValue);
						track[trackItem] = value;
						let changes = null;
						switch (trackItem) {
							case 'instrument':
								changes = this.#updateSheetWithInstrument(track, value);
								this.#trackCount = this.#getTrackCount();
								break;
							case 'bars':
								changes = this.#updateSheetWithBars(track, value);
								this.#synchroBar = this.#getSynchroBar();
								break;
							case 'beat':
								changes = this.#updateSheetWithBeat(track, value);
								break;
						}
						if (changes?.length) {
							sheetChanges[trackIndex] ??= { sheet: [] };
							sheetChanges[trackIndex].sheet.push(...changes);
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

	#updateSheetWithInstrument(track, instrument) {
		const maxHit = this.#instrumentsList[instrument]?.files.length || 1;
		return this.#updateSheetWith(
			track,
			(value) => value > maxHit,
			maxHit
		);
	}

	#updateSheetWithBars(track, bars) {
		const barsValue = bars[0];
		return this.#updateSheetWith(
			track,
			(value, barIndex) => barIndex >= barsValue && value > this.#emptyStroke,
			this.#emptyStroke
		);
	}

	#updateSheetWithBeat(track, beat) {
		return this.#updateSheetWith(
			track,
			(value, barIndex, stepIndex) => stepIndex >= beat && value > this.#emptyStroke,
			this.#emptyStroke
		);
	}

	#updateSheetWith(track, conditionFn, value) {
		const changes = [];
		for (let barIndex = 0; barIndex < track.sheet.length; barIndex++) {
			const bar = track.sheet[barIndex];
			for (let stepIndex = 0; stepIndex < bar.length; stepIndex++) {
				const stepValue = bar[stepIndex];
				if (conditionFn(stepValue, barIndex, stepIndex)) {
					bar[stepIndex] = value;
					changes.push({ barIndex, stepIndex, value });
				}
			}
		}
		return changes;
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
			this.#stopSoundLoop();
		}
	}

	#getTrackCount() {
		const lastTrack = Array.from(this.#tracks).findIndex(track => track.instrument === 0);
		return lastTrack === -1 ? this.#tracks.length : lastTrack + 1;
	}

	#getSynchroBar() {
		const gcd = (a, b) => a ? gcd(b % a, a) : b;
		const lcm = (a, b) => (a * b) / gcd(a, b);
		return this.#tracks.map(track => track.bars[0]).reduce((a, b) => lcm(a, b));
	}

	#playNote(instrument, gain, stroke, time = this.#audioContext.currentTime) {
		const buffers = this.#instrumentsList[instrument].sounds;
		if (!buffers) return;
		const buffer = buffers[stroke - 1] || buffers[0];
		const sound = new AudioBufferSourceNode(this.#audioContext, { buffer });
		const soundGain = new GainNode(this.#audioContext, { gain: gain / this.#maxGain });
		sound.connect(soundGain);
		soundGain.connect(this.#masterGain);
		sound.start(time);
	}

	#startSoundLoop() {
		let isLoop = false;
		const buffer = 0.1;
		this.#barIndex = 0;
		let barTime = this.#audioContext.currentTime + 0.05;
		const loop = () => {
			const secondsPerBar = 60 / this.#tempo;
			if (this.#audioContext.currentTime + buffer <= barTime) return;
			const animations = new Map();
			const timeDelta = performance.now() - barTime * 1000;
			if (!isLoop && !this.#tracks.some(({ loop, bars }) => loop === 0 && this.#barIndex < bars[0])) {
				isLoop = true;
				this.#barIndex = 0;
			}
			for (const [trackIndex, track] of this.#tracks.entries()) {
				if (trackIndex >= this.#trackCount) continue;
				if ((!isLoop && track.loop !== 0) || (isLoop && track.loop === 0)) continue;
				if (!isLoop && this.#barIndex >= track.bars[0]) continue; // skip si phase call et barre terminée

				const trackAnimations = [];
				animations.set(trackIndex, trackAnimations);

				const barIndex = this.#barIndex % track.bars[0];
				const secondsPerStep = secondsPerBar / track.beat;

				for (let stepIndex = 0; stepIndex < track.beat; stepIndex++) {
					const stroke = track.sheet[barIndex][stepIndex];
					const audioTime = barTime + stepIndex * secondsPerStep;
					const animationTime = audioTime * 1000 + timeDelta;
					trackAnimations.push({ barIndex, stepIndex, time: animationTime });
					if (stroke > this.#emptyStroke) this.#playNote(track.instrument, track.volume, stroke, audioTime);
				}
			}

			this.#bus.dispatchEvent(
				new CustomEvent('sequencer:pushAnimations', { detail: { animations } })
			);

			this.#barIndex++;
			barTime += secondsPerBar;
		};

		this.#loopID = setInterval(loop, 50);
	}

	#stopSoundLoop() {
		this.#bus.dispatchEvent(
			new CustomEvent('sequencer:pushAnimations', { detail: { animations: new Map() } })
		);
		clearInterval(this.#loopID);
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
		try {
			this.#wakeLock = await navigator.wakeLock.request();
			this.#wakeLock.onrelease = () => {
				if (this.#audioContext.state !== 'running') return;
				const hasActiveLoop = this.#tracks.some(({ loop, sheet }) =>
					loop === 1 && sheet.some(bar => bar.some(step => step > 0))
				);
				if (hasActiveLoop) {
					clearTimeout(this.#playTimer);
					this.#playTimer = setTimeout(() => {
						this.#audioContext.suspend();
						this.#playTimer = null;
					}, this.#durationWhenHidden * 1000);
				} else {
					this.#audioContext.suspend();
				}
			};
		} catch {}
	}

	#wakeLockRelease() {
		if (this.#wakeLock !== null) {
			this.#wakeLock.onrelease = null;
			this.#wakeLock.release().then(() => this.#wakeLock = null);
		}
	}

}
