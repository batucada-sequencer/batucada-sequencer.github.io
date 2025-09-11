export class Sequencer {
	#animationQueue = [];
	#durationWhenHidden;
	#audioContext;
	#masterGain;
	#maxGain;
	#barIndex;
	#barTime;
	#loopID;
	#frameID;
	#wakeLock = null;
	#playTimer = null;
	#instrumentsList = [];
	#synchroBar = 4;
	#trackCount = 1;
	#tics;
	#bars;
	#beats;
	#volumes;
	#instruments;
	#bpm;
	#tempo;
	#tracks;
	#tracksLength;
	#resetButton;
	#startButton;
	#presetsSelection;
	#maxTics;
	#subdivision;
	#container;
	#startClass;
	#currentClass;
	#ticName;
	#barsName;
	#beatName;
	#volumeName;
	#instrumentName;
	#title;

	constructor(references, config, instrumentsList) {
		this.#tics = references.tics;
		this.#bars = references.bars;
		this.#beats = references.beats;
		this.#volumes = references.volumes;
		this.#instruments = references.instruments;
		this.#bpm = references.bpm;
		this.#tempo = references.tempo;
		this.#tracks = references.tracks;
		this.#tracksLength = config.tracksLength;
		this.#resetButton = references.resetButton;
		this.#startButton = references.startButton;
		this.#presetsSelection = references.presetsSelection;
		this.#maxTics = references.maxTics;
		this.#subdivision = references.subdivision;
		this.#container = references.container;
		this.#startClass = references.startClass;
		this.#currentClass = references.currentClass;
		this.#title = references.title;
		this.#durationWhenHidden = config.durationWhenHidden;
		this.#ticName = this.#tics[0].name;
		this.#barsName = this.#bars[0].name;
		this.#beatName = this.#beats[0].name;
		this.#volumeName = this.#volumes[0].name;
		this.#instrumentName = this.#instruments[0].name;
		this.#maxGain = Number(this.#volumes[0].max);
		this.#instrumentsList = instrumentsList;
		this.#createInstruments();
		this.#createTracks();
		this.#setAudio();
		document.addEventListener('visibilitychange', () => this.#handleVisibilityChange());
		references.container.addEventListener('click', (event) => this.#handleClick(event.target));
		references.container.addEventListener('input', (event) => this.#handleChange(event.target));
	}

	#setAudio() {
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

	#handleVisibilityChange() {
		if (!document.hidden && this.#playTimer) {
			clearTimeout(this.#playTimer);
			this.#playTimer = null;
			this.#wakeLockRequest();
		}
	}

	#handleAudioStateChange() {
		if (this.#audioContext.state !== 'running') {
			this.#toggleStartButton();
		}
	}

	#createInstruments() {
		const options = this.#instrumentsList.slice(1).map((instrument, index) => new Option(instrument.name, index + 1));
		this.#instruments[0].append(...options);
	}

	#createTracks() {
		const firstTrack = this.#tracks[0];
		const newTracks = Array.from({ length: this.#tracksLength - 1 }, () => firstTrack.cloneNode(true));
		firstTrack.parentNode.append(...newTracks);
		Array.from(this.#tracks).forEach((track, index) => {
			track.addEventListener('input', (event) => this.#handleTrackChange(event));
			track.addEventListener('click', (event) => this.#toggleHit(event));
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
	}

	async #handleClick(item) {
		console.log(item)
		if (item === this.#resetButton) {
			this.#reset();
			return;
		}
		if (this.#audioContext.state !== 'running') {
			await this.#audioContext.resume();
		}
		if (item === this.#startButton) {
			this.#toggleStartButton();
		}
		else if (item === this.#tempo) {
			this.#bpm.textContent = item.value;
		}
	}

	#handleChange(item) {
		console.log(item)

		if (item === this.#presetsSelection) {
			this.#barIndex = 0;
		}
		else if (item === this.#tempo) {
			this.#bpm.textContent = item.value;
		}
	}

	async #toggleHit(event) {
		const { currentTarget, target } = event;
		if (target.name !== this.#ticName) return;
		const instrument = Number(currentTarget.dataset[this.#instrumentName]);
		const volume = Number(currentTarget.dataset[this.#volumeName]);
		const maxHit = this.#instrumentsList[instrument]?.files.length || 1;
		const hit = String((Number(target.value) + 1) % (maxHit + 1));
		if (this.#audioContext.state !== 'running') {
			await this.#audioContext.resume();
		}
		this.#setValue(target, hit);
		if (hit !== '0' && this.#wakeLock === null) {
			this.#playNote(instrument, volume, hit);
		}
	}

	#handleTrackChange(event) {
		const {currentTarget, target} = event;
		const { name } = target;
		if (name === this.#volumeName) {
			currentTarget.dataset[this.#volumeName] = target.value;
		} else if (name === this.#beatName) {
			this.#updateTrack(currentTarget, target, this.#updateBeat);
		} else if (name === this.#barsName) {
			this.#updateTrack(currentTarget, target, this.#updateBars);
		} else if (name === this.#instrumentName) {
			this.#updateTrack(currentTarget, target, this.#updateInstrument);
		}
	}

	#updateTrack(track, item, callback) {
		const {name, value} = item
		track.dataset[name] = value;
		const index = [...this.#tracks].indexOf(track);
		const start = index * this.#maxTics;
		const end = start + this.#maxTics;
		callback.call(this, Number(value), start, end);
	}

	#updateBeat(value, start, end) {
		for (let i = start; i < end; i++) {
			if (i % this.#subdivision >= value) {
				this.#tics[i].value = 0;
			}
		}
	}

	#updateBars(value, start, end) {
		const endOfBars = start + value * this.#subdivision;
		for (let i = endOfBars; i < end; i++) {
			if (this.#tics[i].value > 0) {
				this.#tics[i].value = 0;
			}
		}
		this.#synchroBar = this.#getSynchroBar();
	}

	#updateInstrument(value, start, end) {
		const maxHit = this.#instrumentsList[value]?.files.length || 1;
		for (let i = start; i < end; i++) {
			if (Number(this.#tics[i].value) > maxHit) {
				this.#tics[i].value = maxHit;
			}
		}
		this.#trackCount = this.#getTrackCount();
	}

	#getTrackCount() {
		const lastTrack = Array.from(this.#tracks).findIndex(track => track.dataset[this.#instrumentName] === '0');
		return lastTrack === -1 ? this.#tracksLength : lastTrack + 1;
	}

	#getSynchroBar() {
		const gcd = (a, b) => a ? gcd(b % a, a) : b;
		const lcm = (a, b) => (a * b) / gcd(a, b);
		return Array.from(this.#tracks).map(track => Number(track.dataset[this.#barsName])).reduce((a, b) => lcm(a, b));
	}

	#setValue(item, value) {
		if (item.value !== value) {
			item.value = value;
			item.dispatchEvent(new Event('input', { bubbles: true }));
			item.dispatchEvent(new Event('change', { bubbles: true }));
		}
	}

	#geDefaultValue(item) {
		if ('selectedIndex' in item) {
			const option = [...item.options].find(option => option.defaultSelected);
			return option?.value ?? item.options[0].value;
		}
		return item.defaultValue ?? '0';
	}

	#playNote(instrument, volume, hit, time = this.#audioContext.currentTime) {
		const buffers = this.#instrumentsList[instrument].sounds;
		if (!buffers) return;
		const buffer = buffers[hit - 1] || buffers[0];
		const sound = new AudioBufferSourceNode(this.#audioContext, { buffer });
		const gain = new GainNode(this.#audioContext, { gain: volume / this.#maxGain });
		sound.connect(gain);
		gain.connect(this.#masterGain);
		sound.start(time);
	}

	#toggleStartButton() {
		const shouldStart = !this.#container.classList.contains(this.#startClass);
		this.#container.classList.toggle(this.#startClass, shouldStart);
		this.#startButton.setAttribute('aria-checked', String(shouldStart));
		shouldStart ? this.#start() : this.#stop();
	}

	#startSoundLoop() {
		const buffer = 0.1;
		this.#barIndex = 0;
		this.#barTime = this.#audioContext.currentTime;
		const loop = () => {
			const secondsPerBar = 60 / Number(this.#tempo.value);
			if (this.#audioContext.currentTime + buffer > this.#barTime) {
				let trackIndex = 0
				for (const track of this.#tracks) {
					if (trackIndex >= this.#trackCount) break;
					const bars = Number(track.dataset[this.#barsName]);
					const beat = Number(track.dataset[this.#beatName]);
					const volume = Number(track.dataset[this.#volumeName]);
					const instrument = Number(track.dataset[this.#instrumentName]);
					const secondsPerTic = secondsPerBar / beat;
					const ticsOffset = (trackIndex * this.#maxTics) + (this.#barIndex % bars) * this.#subdivision;
					for (let i = 0; i < beat; i++) {
						const ticIndex = ticsOffset + i;
						const tic = this.#tics[ticIndex];
						const hit = Number(tic.value);
						const time = this.#barTime + (i * secondsPerTic);
						this.#animationQueue.push({
							tic,
							animationStartTime: time,
							animationEndTime: time + secondsPerTic,
						});
						if (hit > 0) {
							this.#playNote(instrument, volume, hit, time);
						}
					}
					trackIndex++;
				}
				this.#barIndex = (this.#barIndex + 1) % this.#synchroBar;
				this.#barTime += secondsPerBar;
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

	#startAnimationLoop() {
		const buffer = 0.03;
		const loop = () => {
			const now = this.#audioContext.currentTime;
			for (const item of this.#animationQueue) {
				if (!item._done && now >= item.animationStartTime - buffer) {
					item.tic.classList.add(this.#currentClass);
					item._done = true;
				}
				if (!item._cleared && now >= item.animationEndTime - buffer) {
					item.tic.classList.remove(this.#currentClass);
					item._cleared = true;
				}
			}
			this.#animationQueue = this.#animationQueue.filter(item => !(item._done && item._cleared));
			this.#frameID = requestAnimationFrame(loop);
		};
		this.#frameID = requestAnimationFrame(loop);
	}

	#stopAnimationLoop() {
		cancelAnimationFrame(this.#frameID);
		this.#animationQueue.forEach(item => item.tic.classList.remove(this.#currentClass));
		this.#animationQueue = [];
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

	#start() {
		this.#startSoundLoop();
		this.#startAnimationLoop();
		this.#wakeLockRequest();
	}

	#stop() {
		this.#stopSoundLoop();
		this.#stopAnimationLoop();
		this.#wakeLockRelease();
	}

	#reset() {
		this.#muteSchedulesNotes();
		const items = [...this.#tics, ...this.#beats, ...this.#volumes, ...this.#bars, ...this.#instruments, this.#tempo];
		items.forEach(item => this.#setValue(item, this.#geDefaultValue(item)));
		if (this.#title.textContent !== '') {
			this.#title.textContent = '';
			this.#title.dispatchEvent(new Event('change', { bubbles: true }));
		}
	}

}
