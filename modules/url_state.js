export class UrlState {
	#bus;
	#params;
	#searchParams;
	#tempoStep;
	#barsIndex;
	#beatsIndex;
	#stepsPerTracks;
	#instrumentsIndex;
	#changedValuesParams;
	#setSearchParam ;
	#tempoSearchParam;
	#titleSearchParam ;
	#volumeSearchParam;
	#shareSearchParam;
	#defaultSetValue;
	#defaultTitleValue;
	#sharedStatus = false;
	#allocation = {
		reserved: 4,
		bars: 10,
		beat: 9,
		instrument: 10, //4 * 10 * 9 * 10 = 3600 > 62 * 62 (outputBase * outputBase)
	};
	#outputDigits = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
	#outputBase = this.#outputDigits.length;

	#headUntitled;
	#headTitle;

	constructor(bus, config, instrumentsList) {
		this.#bus = bus;
		this.#setSearchParam = config.setSearchParam;
		this.#tempoSearchParam = config.tempoSearchParam;
		this.#titleSearchParam = config.titleSearchParam;
		this.#volumeSearchParam = config.volumeSearchParam;
		this.#shareSearchParam = config.shareSearchParam;
		this.#defaultSetValue = config.defaultSetValue;
		this.#defaultTitleValue = config.defaultTitleValue;
		this.#initData(instrumentsList);
		this.#searchParams = new URLSearchParams(location.search);
		addEventListener('popstate', () => this.#decodeURL(true));
		this.#bus.addEventListener('interface:reset', () => this.#reset());
		this.#bus.addEventListener('presets:changed', ({ detail }) => this.#encodeURL(detail));
		this.#bus.addEventListener('sequencer:changed', ({ detail }) => this.#encodeURL(detail));
		this.#bus.addEventListener('interface:presetClicked', ({ detail }) => this.#presetClicked(detail));
		this.#bus.addEventListener('interface:presetSelected', ({ detail }) => this.#presetSelected(detail));
		this.#bus.addEventListener('interface:sharedClosed', ({ detail }) => this.#sharedClosed(detail));
		if (this.#searchParams.has('sharelink')) {
			console.log('sharelink')
			const currentURL = new URL(location.href);
			const shareURL = new URL(this.#searchParams.get('sharelink'));
			currentURL.search = shareURL.search;
			this.#searchParams = new URLSearchParams(currentURL.search);
			window.history.replaceState({}, '', currentURL);
		}
		this.#decodeURL();
	}

	#initData(instrumentsList) {
		let data;
		const event = new CustomEvent('urlState:getInterfaceData', { 
			detail: callback => {
				data = callback();
			}
		});
		this.#bus.dispatchEvent(event);
		this.#tempoStep = data.tempoStep;
		this.#stepsPerTracks = data.subdivision * data.maxBars;
		this.#barsIndex = [data.defaultBars, ...data.barsValues.filter(value => value !== data.defaultBars)];
		this.#beatsIndex = [data.defaultBeat, ...data.beatValues.filter(value => value !== data.defaultBeat)];
		this.#instrumentsIndex = instrumentsList.map(({ id, files }) => ({ id, base: files.length + 1 }));
		this.#changedValuesParams = {
			tracks: this.#setSearchParam,
			volumes: this.#volumeSearchParam,
			tempo: this.#tempoSearchParam,
			title: this.#titleSearchParam,
		};
		const defaultVolume = this.#stringBaseConvert(data.defaultGain, 10, this.#outputBase);
		const defaultTempo = this.#stringBaseConvert(data.defaultTempo / data.tempoStep, 10, this.#outputBase);
		this.#params = {
			[this.#setSearchParam]: {
				defaultValue: this.#defaultSetValue,
				encode: this.#encodeTracks.bind(this),
				decode: this.#decodeTracks.bind(this),
			},
			[this.#volumeSearchParam]: {
				defaultValue: defaultVolume,
				encode: this.#encodeVolumes.bind(this),
				decode: this.#decodeVolumes.bind(this),
			},
			[this.#tempoSearchParam]: {
				defaultValue: defaultTempo,
				encode: this.#encodeTempo.bind(this),
				decode: this.#decodeTempo.bind(this),
			},
			[this.#titleSearchParam]: {
				searchParam: 'title',
				defaultValue: this.#defaultTitleValue,
				encode: this.#encodeTitle.bind(this),
				decode: this.#decodeTitle.bind(this),
			},
		};
	}

	#reset(values) {
		this.#searchParams.delete(this.#setSearchParam);
		this.#searchParams.delete(this.#tempoSearchParam);
		this.#searchParams.delete(this.#titleSearchParam);
		this.#searchParams.delete(this.#volumeSearchParam);
		history.pushState(null, '', this.#searchParams.size ? `?${this.#searchParams}` : '.');
	}

	#presetSelected({ name, value }) {
		this.#searchParams.set(this.#setSearchParam, value || this.#defaultSetValue);
		this.#searchParams.set(this.#titleSearchParam, name || this.#defaultTitleValue);
		history.pushState(null, '', `?${this.#searchParams}`);
		this.#decodeURL();
	}

	#presetClicked(url) {
		this.#searchParams = new URLSearchParams(url);
		history.pushState(null, '', url);
		this.#decodeURL();
	}

	#sharedClosed() {
		if (this.#searchParams.has(this.#shareSearchParam)) {
			this.#searchParams.delete(this.#shareSearchParam);
			history.pushState(null, '', this.#searchParams.size ? `?${this.#searchParams}` : '.');
		}
	}

	#encodeURL(values) {
		let changed = false;
		for (const [item, value] of Object.entries(values)) {
			const param = this.#changedValuesParams[item];
			if (!param) continue;
			const { encode, defaultValue } = this.#params[param];
			const encodedValue = encode(value, defaultValue);
			if (encodedValue) {
				if (this.#searchParams.get(param) !== encodedValue) {
					this.#searchParams.set(param, encodedValue);
					changed = true;
				}
			} else {
				if (this.#searchParams.has(param)) {
					this.#searchParams.delete(param);
					changed = true;
				}
			}
		}
		if (!changed) return;
		history.replaceState(null, '', this.#searchParams.size ? `?${this.#searchParams}` : '.');
		this.#bus.dispatchEvent(new CustomEvent('urlState:changed', { detail: new Map(this.#searchParams) }));
	}

	#decodeURL(isPopstate) {
		if (isPopstate) {
			this.#searchParams = new URLSearchParams(location.search);
		}
		const shared = this.#searchParams.get(this.#shareSearchParam);
		if (shared) {
			this.#bus.dispatchEvent(new CustomEvent('urlState:openShared', { detail: shared }));
		} else if (this.#sharedStatus) {
			this.#bus.dispatchEvent(new CustomEvent('urlState:closeShared'));
		}
		this.#sharedStatus = Boolean(shared);
		if (shared) return;
		let tracks;
		const event = new CustomEvent('urlState:getTracksData', { 
			detail: callback => {
				tracks = callback();
			}
		});
		this.#bus.dispatchEvent(event);
		const changes = {}
		const volume = this.#searchParams.get(this.#volumeSearchParam);
		if (volume) {
			const setValue = this.#searchParams.get(this.#setSearchParam) || this.#params[this.#setSearchParam].defaultValue;
			const setLength = setValue.split('-').filter(Boolean).length;
			this.#searchParams.set(this.#volumeSearchParam, volume.slice(0, setLength));
		}
		for (const [param, { defaultValue, decode }] of Object.entries(this.#params)) {
			//si isPopstate on decode tous les searchParams possibles
			const value = isPopstate ? (this.#searchParams.get(param) || defaultValue) : this.#searchParams.get(param);
			if (value !== null) {
				decode(value, defaultValue, changes, tracks);
				if (value === defaultValue) {
					this.#searchParams.delete(param);
				}
			}
		}
		if (Object.keys(changes).length > 0) {
			history.replaceState(null, '', this.#searchParams.size ? `?${this.#searchParams}` : '.');
			this.#bus.dispatchEvent(new CustomEvent('urlState:decoded', { detail: changes }));
			this.#bus.dispatchEvent(new CustomEvent('urlState:changed', { detail: new Map(this.#searchParams) }));
		}
	}

	#encodeTracks(values, defaultValue) {
		return values.map(track => {
			const { instrument: instrumentValue, bars, beat, sheet } = track
			const { id: instrument, base: instrumentBase } = this.#instrumentsIndex[instrumentValue];
			const values = {
				reserved: 0,
				bars: this.#barsIndex.indexOf(bars),
				beat: this.#beatsIndex.indexOf(beat),
				instrument,
			}
			const sheetString = sheet.slice(0, bars)
				.map(bar => bar.slice(0, beat))
				.flat().reverse().join('');
			let encodedValues = this.#stringBaseConvert(this.#pack(values, this.#allocation), 10, this.#outputBase);
			let encodedSheet = this.#stringBaseConvert(sheetString, instrumentBase, this.#outputBase);
			encodedValues = (encodedSheet === defaultValue && encodedValues === defaultValue) 
				? '' 
				: encodedValues.padStart(2, defaultValue);
			encodedSheet = (encodedSheet === defaultValue) ? '' : encodedSheet;
			return encodedValues + encodedSheet;
		})
		.join('-').replace(/-+$/g, '');
	}

	#decodeTracks(encodedValues, defaultValue, changes, tracks) {
		changes.tracks ??= {};
		const values = encodedValues.split('-').filter(Boolean);

		tracks.forEach((track, trackIndex) => {
			const data = (values[trackIndex] || '').padEnd(3, defaultValue);

			const packed = parseInt(this.#stringBaseConvert(data.slice(0, 2), this.#outputBase, 10));
			const { bars: barsIndex, beat: beatIndex, instrument: instrumentId } = this.#unpack(packed, this.#allocation);

			const instrument = this.#instrumentsIndex.findIndex(i => i.id === instrumentId);
			const bars = this.#barsIndex[barsIndex];
			const beat = this.#beatsIndex[beatIndex];
			const instrumentBase = this.#instrumentsIndex[instrument].base;

			const sheetString = this.#stringBaseConvert(data.slice(2), this.#outputBase, instrumentBase);
			let sheetIndex = sheetString.length - 1;

			const sheet = track.sheet.flatMap((bar, barIndex) =>
				bar.map((step, stepIndex) => {
					const value = (barIndex >= bars || stepIndex >= beat || sheetIndex < 0)
						? 0
						: Number(sheetString[sheetIndex--]);
					return value !== step ? { barIndex, stepIndex, value } : null;
				}).filter(Boolean)
			);

			if (track.instrument !== instrument || track.bars !== bars || track.beat !== beat || sheet.length) {
				changes.tracks[trackIndex] = {
					...(track.instrument !== instrument && { instrument }),
					...(track.bars !== bars && { bars }),
					...(track.beat !== beat && { beat }),
					...(sheet.length && { sheet })
				};
			}
		});
	}

	#encodeVolumes(values, defaultValue) {
		return values.map(volume => this.#stringBaseConvert(volume, 10, this.#outputBase))
			.join('').replace(new RegExp(`${defaultValue}+$`, 'g'), '');
	}

	#decodeVolumes(encodedValues, defaultValue, changes, tracks) {
		changes.tracks ??= {};
		const values = encodedValues
			.slice(0, tracks.length)
			.padEnd(tracks.length, defaultValue).split('')
			.map(item => Number(this.#stringBaseConvert(item, this.#outputBase, 10)));
		values.forEach((value, trackIndex) => {
			if (value !== tracks[trackIndex].volume) {
				(changes.tracks[trackIndex] ??= {}).volume = value;
			}
		});
	}

	#encodeTempo(value, defaultValue) {
		return this.#stringBaseConvert(value / this.#tempoStep, 10, this.#outputBase).replace(defaultValue, '');
	}

	#decodeTempo(encodeValue, defaultValue, changes) {
		changes.tempo = (this.#stringBaseConvert(encodeValue, this.#outputBase, 10) * this.#tempoStep).toString();
	}

	#decodeTitle(encodeValue, defaultValue, changes) {
		changes.title = encodeValue;
	}

	#encodeTitle(value) {
		return value;
	}

	#stringBaseConvert(string, fromBase, base) {
		base = BigInt(base);
		fromBase = BigInt(fromBase);
		string = string.toString();
		let number = [...string].reduce((number, digit) => number * fromBase + BigInt(this.#outputDigits.indexOf(digit)), 0n);
		const result = [];
		while (number > 0n) {
			result.push(this.#outputDigits[Number(number % base)]);
			number /= base;
		}
		return result.reverse().join('') || '0';
	}

	#pack(values, bases) {
		const keys = Object.keys(bases).reverse();
		return keys.reduce((acc, key) => acc * bases[key] + values[key], 0);
	}

	#unpack(value, bases) {
		const keys = Object.keys(bases);
		const result = {};
		for (const key of keys) {
			result[key] = value % bases[key];
			value = Math.floor(value / bases[key]);
		}
		return result;
	}
}