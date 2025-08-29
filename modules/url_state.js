export class UrlState {
	#maxInt = {
			reserved: 4,
			bars: 10,
			beat: 9,
			instrument: 10, //4 * 10 * 9 * 10 = 3600 > 62 * 62 (outputBase * outputBase)
		};
	#outputDigits = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
	#outputBase= this.#outputDigits.length;
	#barsIndex;
	#beatsIndex;
	#paramsTriggers;
	#paramsProperties;
	#instrumentsList;
	#tics;
	#bars;
	#beats;
	#title;
	#volumes;
	#instruments;
	#tempo;
	#maxTics;
	#subdivision;
	#tracksLength;
	#setSearchParam;
	#tempoSearchParam;
	#titleSearchParam;
	#volumeSearchParam;
	#headUntitled;
	#headTitlePrefix;
	static save;

	constructor(references) {
		this.#tics = references.tics;
		this.#bars = references.bars;
		this.#beats = references.beats;
		this.#volumes = references.volumes;
		this.#instruments = references.instruments;
		this.#tempo = references.tempo;
		this.#title = references.title;
		this.#maxTics = references.maxTics;
		this.#subdivision = references.subdivision;
		this.#tracksLength = references.tracksLength;
		this.#setSearchParam = references.setSearchParam;
		this.#tempoSearchParam = references.tempoSearchParam;
		this.#titleSearchParam = references.titleSearchParam;
		this.#volumeSearchParam = references.volumeSearchParam;
		this.#headUntitled = references.headUntitled;
		this.#headTitlePrefix = document.title.replace(this.#headUntitled, '');
		this.#barsIndex = this.#getList(this.#bars[0]);
		this.#beatsIndex = this.#getList(this.#beats[0]);
		this.#paramsTriggers = this.#getParamsTriggers();
		this.#paramsProperties = this.#getParamsProperties();
		this.save = this.#saveToURL();
	}

	init(instrumentsList) {
		this.#instrumentsList = instrumentsList.map(instrument => ({
			...instrument,
			base: Math.max(instrument.files.length + 1, 3), // rétrocompatibilité tamborim
		}));
		addEventListener('locationChanged', () => this.#restoreFromURL());
		document.addEventListener('DOMContentLoaded', () => this.#restoreFromURL());
	}

	#getList(select) {
		const options = Array.from(select.options);
		return [
			...options.filter(option => option.defaultSelected).map(option => option.value),
			...options.filter(option => !option.defaultSelected).map(option => option.value)
		];
	}

	#getParamsProperties() {
		const defaultVolume = this.#stringBaseConvert(
			this.#getDefaultVolume(this.#volumes[0]),
			10,
			this.#outputBase
		);
		const defaultTempo = this.#stringBaseConvert(
			(this.#tempo.defaultValue / this.#tempo.step).toString(),
			10,
			this.#outputBase
		);
		return Object.fromEntries([
			[this.#setSearchParam, {
				defaultValue: '0',
				encode: () => this.#encodeSet(),
				decode: (value) => this.#decodeSet(value),
			}],
			[this.#volumeSearchParam, {
				defaultValue: defaultVolume,
				encode: () => this.#encodeVolume(),
				decode: (value) => this.#decodeVolume(value),
			}],
			[this.#tempoSearchParam, {
				defaultValue: defaultTempo,
				encode: () => this.#encodeTempo(),
				decode: (value) => this.#decodeTempo(value),
			}],
			[this.#titleSearchParam, {
				defaultValue: '',
				encode: () => {},
				decode: (value) => this.#decodeTitle(value),
			}],
		])
	}

	#getParamsTriggers() {
		return Object.fromEntries([
			[this.#title.id, this.#titleSearchParam],
			[this.#tempo.id, this.#tempoSearchParam],
			[this.#tics[0].name, this.#setSearchParam],
			[this.#bars[0].name, this.#setSearchParam],
			[this.#beats[0].name, this.#setSearchParam],
			[this.#volumes[0].name, this.#volumeSearchParam],
			[this.#instruments[0].name, this.#setSearchParam],
		])
	}

	#getDefaultVolume(volume) {
		const defaultValue = volume.min + (volume.max - volume.min) / 2;
		return defaultValue.toString();
	}

	#saveToURL(event) {
		let timer;
		let params = new Set();
		return (event) => {
			const name = event.target.name || event.target.id;
			if (name in this.#paramsTriggers) {
				params.add(this.#paramsTriggers[name]);
			}
			clearTimeout(timer);
			timer = setTimeout(() => {
				if (params.size !== 0) {
					const searchParams = new URLSearchParams(location.search);
					params.forEach(param => {
						const value = this.#paramsProperties[param].encode();
						value ? searchParams.set(param, value) : searchParams.delete(param);
					})
					history.replaceState(null, '', searchParams.size ? `?${searchParams}` : '.');
					dispatchEvent(new CustomEvent('locationSaved'));
					params.clear();
				}
			}, 10);
		};
	}

	#restoreFromURL() {
		const params = new URLSearchParams(location.search);
		const volume = params.get(this.#volumeSearchParam);
		if (volume) {
			const setValue = params.get(this.#setSearchParam) || '0';
			const setLength = setValue.split('-').filter(Boolean).length;
			params.set(this.#volumeSearchParam, volume.slice(0, setLength));
		}
		for (const [param, { defaultValue, decode }] of Object.entries(this.#paramsProperties)) {
			const value = params.get(param);
			if (value !== null) {
				decode(value);
				if (value === defaultValue) {
					params.delete(param);
				}
			}
		}
		history.replaceState(null, '', params.size ? `?${params}` : '.');
	}

	#encodeSet() {
		const defaultValue = this.#paramsProperties[this.#setSearchParam].defaultValue;
		return Array.from(this.#tics, tic => tic.value)
			.join('')
			.match(new RegExp(`.{1,${this.#maxTics}}`, 'g'))
			.slice(0, this.#tracksLength)
			.map((line, index) => {
				const instrument = this.#instrumentsList[parseInt(this.#instruments[index].value)];
				const values = {
					reserved: 0,
					bars: parseInt(this.#barsIndex.indexOf(this.#bars[index].value)),
					beat: parseInt(this.#beatsIndex.indexOf(this.#beats[index].value)),
					instrument: instrument.id,
				}
				const bars = parseInt(this.#bars[index].value);
				const beat = parseInt(this.#beats[index].value);
				const sheet = Array.from({ length: bars * beat }, (_, i) => {
					const bar = Math.floor(i / beat);
					const tic = i % beat;
					return line[bar * this.#subdivision + tic];
				}).reverse().join('');
				const packedString = (this.#pack(values, this.#maxInt)).toString();
				let prefix = this.#stringBaseConvert(packedString, 10, this.#outputBase);
				let convertedSheet = this.#stringBaseConvert(sheet, instrument.base, this.#outputBase);
				prefix = (convertedSheet === defaultValue && prefix === defaultValue) ? '' : prefix.padStart(2, defaultValue);
				convertedSheet = (convertedSheet === defaultValue) ? '' : convertedSheet;
				return prefix + convertedSheet;
			})
			.join('-').replace(/-+$/g, '');
	}

	#decodeSet(encodeValue) {
		const defaultValue = this.#paramsProperties[this.#setSearchParam].defaultValue;
		const values = encodeValue.split('-').filter(Boolean);
		const ticsValues = Array(this.#tracksLength * this.#maxTics).fill(defaultValue);
		for (let index = 0; index < this.#tracksLength; index++) {
			const data = (values[index] || '').padEnd(3, defaultValue);
			const packed = parseInt(this.#stringBaseConvert(data.slice(0, 2), this.#outputBase, 10));
			const { bars, beat, instrument } = this.#unpack(packed, this.#maxInt);
			const instrumentIndex = this.#instrumentsList.findIndex(item => item.id === instrument);
			const base = this.#instrumentsList[instrumentIndex].base;
			const sheet = [...this.#stringBaseConvert(data.slice(2), this.#outputBase, base)];
			const beatInt = parseInt(this.#beatsIndex[beat]);
			const baseOffset = index * this.#maxTics;
			this.#setValue(this.#bars[index], this.#barsIndex[bars]);
			this.#setValue(this.#beats[index], this.#beatsIndex[beat]);
			this.#setValue(this.#instruments[index], String(instrumentIndex));
			for (let i = sheet.length - 1; i >= 0; i--) {
				const k = sheet.length - 1 - i;
				const offset = baseOffset + Math.floor(k / beatInt) * this.#subdivision + (k % beatInt);
				ticsValues[offset] = sheet[i];
			}
		};
		for (const tic of this.#tics) {
			this.#setValue(tic, ticsValues.shift());
		}
	}

	#encodeVolume() {
		const defaultValue = this.#paramsProperties[this.#volumeSearchParam].defaultValue;
		return Array.from(this.#volumes, volume => volume.value)
			.map(volume => this.#stringBaseConvert(volume, 10, this.#outputBase))
			.join('')
			.replace(new RegExp(`${defaultValue}+$`, 'g'), '');
	}

	#decodeVolume(encodeValue) {
		const defaultValue = this.#paramsProperties[this.#volumeSearchParam].defaultValue;
		let values = encodeValue.padEnd(this.#volumes.length, defaultValue);
		values = Array.from(values, item => parseInt(this.#stringBaseConvert(item, this.#outputBase, 10)));
		for (const volume of this.#volumes) {
			this.#setValue(volume, values.shift());
		}
	}

	#encodeTempo() {
		const defaultValue = this.#paramsProperties[this.#tempoSearchParam].defaultValue;
		const value = (this.#tempo.value / this.#tempo.step).toString();
		return this.#stringBaseConvert(value, 10, this.#outputBase).replace(defaultValue, '');
	}

	#decodeTempo(encodeValue) {
		const value = (this.#stringBaseConvert(encodeValue, this.#outputBase, 10) * this.#tempo.step).toString();
		this.#setValue(this.#tempo, value);
	}

	#decodeTitle(value) {
		this.#title.textContent = value;
		document.title = this.#headTitlePrefix + (value ? value : this.#headUntitled);
	}

	#setValue(item, value) {
		if (item.value !== value) {
			item.value = value;
			item.dispatchEvent(new Event('input', { bubbles: true }));
		}
	}

	#stringBaseConvert(string, fromBase, base) {
		base = BigInt(base);
		fromBase = BigInt(fromBase);
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