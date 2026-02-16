export class Audio {
	#bus;
	#worker;
	#maxGain;
	#gainNodes;
	#masterGain;
	#audioContext;
	#wakeLock = null;
	#playTimer = null;
	#instrumentsList;
	#activeSources = new Set();
	#durationWhenHidden;

	constructor({ bus, config, instruments }) {
		this.#bus                = bus;
		this.#instrumentsList    = instruments;
		this.#durationWhenHidden = config.durationWhenHidden;

		this.#worker           = new Worker(new URL('./audio_worker.js', import.meta.url));
		this.#worker.onmessage = (event) => this.#handleWorkerMessage(event.data);

		document. addEventListener('visibilitychange',         ({ detail }) => this.#handleVisibilityChange());
		this.#bus.addEventListener('interface:stop',           ({ detail }) => this.#stop(detail));
		this.#bus.addEventListener('interface:reset',          ({ detail }) => this.#reset(detail));
		this.#bus.addEventListener('interface:start',          ({ detail }) => this.#start(detail));
		this.#bus.addEventListener('interface:moveTrack',      ({ detail }) => this.#moveTrack(detail));
		this.#bus.addEventListener('interface:updateData',     ({ detail }) => this.#updateData(detail));
		this.#bus.addEventListener('interface:changeNote',     ({ detail }) => this.#changeNote(detail));
		this.#bus.addEventListener('interface:changeTempo',    ({ detail }) => this.#changeTempo(detail));
		this.#bus.addEventListener('interface:changeVolume',   ({ detail }) => this.#changeVolume(detail));
		this.#bus.addEventListener('interface:audioRequest',   ({ detail }) => this.#startAudio(detail));
		this.#bus.addEventListener('interface:presetSelected', ({ detail }) => this.#restart(detail));
		this.#bus.addEventListener('urlState:decoded',         ({ detail }) => this.#updateData(detail, true));
		this.#initAudio(config);
	}

	#initAudio(config) {
		this.#audioContext = new AudioContext();
		this.#masterGain   = new GainNode(this.#audioContext);
		this.#masterGain.connect(this.#audioContext.destination);
		this.#audioContext.addEventListener('statechange', () => this.#handleAudioStateChange());
		this.#loadInstrumentSounds();

		const instrumentsStrokes = this.#instrumentsList.map(instrument => instrument.files.length || 1);

		this.#maxGain = config.maxGain;

		const workerConfig = {
			order:         config.defaultOrder,
			tempo:         config.defaultTempo,
			maxBars:       config.maxBars,
			synchroBar:    config.defaultBars,
			resolution:    config.resolution,
			emptyStroke:   config.emptyStroke,
			tracksLength:  config.tracksLength,
			defaultData:   {
				bars:       config.defaultBars,
				beats:      config.defaultBeats,
				steps:      config.defaultSteps,
				phrase:     config.defaultPhrase,
				volume:     config.defaultGain,
				instrument: config.defaultInstrument,
			},
			instrumentsStrokes,
		}

		this.#worker.postMessage({
			action: 'config',
			payload: workerConfig,
		});

		this.#gainNodes = Array.from({ length: config.tracksLength }, () => {
			const gainNode = new GainNode(this.#audioContext, { gain: config.defaultGain / config.maxGain });
			gainNode.connect(this.#masterGain);
			return gainNode;
		});
	}

	#handleWorkerMessage(data) {
		data.forEach(({ action, payload }) => {
			if (action === 'ticks') {
				this.#playTicks(payload);
			}
			else if (action === 'stop') {
				this.#stopTicks();
			}
			else if (action === 'updateData') {
				this.#bus.dispatchEvent(
					new CustomEvent('audio:updateData', { detail: payload })
				);
			}
			else if (action === 'updateGains') {
				this.#updateGains(payload);
			}
			else if (action === 'playNote') {
				const { instrument, gainIndex, stroke } = payload;
				this.#playNote(instrument, gainIndex, stroke);
			}
			else if (action === 'changed') {
				this.#bus.dispatchEvent(
					new CustomEvent('audio:changed', { detail: payload })
				);
			}
			else if (action === 'state') {
				this.#bus.dispatchEvent(
					new CustomEvent('audio:state', { detail: payload })
				);
			}
		});
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

	async #startAudio(promise) {
		if (this.#audioContext.state !== 'running') {
			await this.#audioContext.resume();
		}
		promise.resolve(true);
	}

	#start() {
		this.#worker.postMessage({ action: 'start', payload: this.#audioContext.currentTime });
		this.#wakeLockRequest();
	}
	
	#stop() {
		this.#worker.postMessage({ action: 'stop', payload: this.#audioContext.currentTime});
		this.#muteSchedulesNotes();
		this.#wakeLockRelease();
		this.#stopTicks();
	}

	#restart() {
		this.#worker.postMessage({ action: 'restart' });
	}

	#reset() {
		this.#worker.postMessage({ action: 'reset' });
		this.#muteSchedulesNotes();
	}

	#playTicks(ticks) {
		const animations = new Map();
		const timeDelta = performance.now() - (this.#audioContext.currentTime * 1000);

		for (let i = 0; i < ticks.length; i += 5) {
			const time       = ticks[i];
			const stroke     = ticks[i + 1];
			const instrument = ticks[i + 2];
			const trackIndex = ticks[i + 3];
			const stepIndex  = ticks[i + 4];
			if (stroke > 0) {
				this.#playNote(instrument, trackIndex, stroke, time);
			}
			if (!animations.has(trackIndex)) {
				animations.set(trackIndex, []);
			}
			animations.get(trackIndex).push({
				time: (time * 1000) + timeDelta,
				stepIndex
			});
		}
		this.#bus.dispatchEvent(new CustomEvent('audio:pushAnimations', { detail: { animations } }));
	}

	#stopTicks() {
		this.#bus.dispatchEvent(new CustomEvent('audio:pushAnimations', { detail: { animations: new Map() } }));
	}

	#changeNote(payload) {
		this.#worker.postMessage({ action: 'changeNote', payload });
	}

	#changeVolume() {
		this.#worker.postMessage({ action: 'changeVolume' });
	}

	#changeTempo() {
		this.#worker.postMessage({ action: 'changeTempo' });
	}

	#moveTrack(indexes) {
		this.#worker.postMessage({ action: 'moveTrack', payload: indexes });
	}

	#updateData(changes, sendState) {
		changes.sendState = sendState === true;
		this.#worker.postMessage({ action: 'updateData', payload: changes });
		if (changes.volumes) {
			this.#updateGains(changes.volumes);
		}
	}

	#updateGains(gains) {
		for (const { id, value } of gains) {
			this.#gainNodes[id].gain.value = value / this.#maxGain;
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
			this.#stop();
		}
	}

	#playNote(instrument, gainIndex, stroke, time = this.#audioContext.currentTime) {
		const buffers = this.#instrumentsList[instrument].sounds;
		if (!buffers) return;
		const buffer = buffers[stroke - 1] || buffers[0];
		const sound = new AudioBufferSourceNode(this.#audioContext, { buffer });
		sound.connect(this.#gainNodes[gainIndex]);
		this.#activeSources.add(sound);
		sound.onended = () => this.#activeSources.delete(sound);
		sound.start(time);
	}

	#muteSchedulesNotes() {
		const fadeOut = 0.05;
		const now = this.#audioContext.currentTime;
		this.#masterGain.gain.cancelScheduledValues(now);
		this.#masterGain.gain.setValueAtTime(this.#masterGain.gain.value, now);
		this.#masterGain.gain.linearRampToValueAtTime(0, now + fadeOut);
		for (const source of this.#activeSources) {
			try { source.stop(now + fadeOut) } catch {}
		}
		this.#activeSources.clear();
		this.#masterGain.gain.setValueAtTime(0, now + fadeOut + 0.01);
		this.#masterGain.gain.linearRampToValueAtTime(1, now + fadeOut + 0.02);
	}

	async #wakeLockRequest() {
		try {
			this.#wakeLock = await navigator.wakeLock.request();
			this.#wakeLock.onrelease = () => {
				if (this.#audioContext.state !== 'running') return;
				clearTimeout(this.#playTimer);
				this.#playTimer = setTimeout(() => {
					this.#audioContext.suspend();
					this.#playTimer = null;
				}, this.#durationWhenHidden * 1000);
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
