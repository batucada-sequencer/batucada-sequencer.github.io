export class Interface {
	#maxBars = 32;
	#subdivision = 8;
	#startClass = 'started';
	#currentClass = 'current';
	#draggedClass = 'dragged';
	#dropzoneClass = 'dropzone';
	#defaultInstrument;
	#untitled;
	#bus;
	#container;
	#firstTrack;
	#tracksLength;
	#stepsPerTracks;
	#headTitlePrefix;
	#bpm;
	#tempo;
	#title;
	#startButton;
	#resetButton;
	#settingsButton;
	#share;
	#shared;
	#shareList;
	#sharedList;
	#shareButton;
	#checkBoxShare;
	#checkBoxMaster;
	#checkBoxCurrent;
	#presetsSelection;
	#presetsSelectionInit;
	#settings;
	#toast;
	#message;
	#cancelButton;
	#bars;
	#beat;
	#loop;
	#instrument;
	#steps;
	#track;
	#tracks;
	#trackIndex;
	#trackButtons;
	#volumes;
	#stepName;
	#barsName;
	#beatName;
	#loopName;
	#trackName;
	#volumeName;
	#instrumentName;
	#instrumentsList;
	#interfaceData;
	#animationQueue = new Map();
	#frameId = null;

	constructor(bus, config, instrumentsList) {
		this.#bus = bus;
		this.#instrumentsList = instrumentsList;
		this.#untitled = config.untitled;
		this.#tracksLength = config.tracksLength;
		this.#container = document.querySelector('#sequencer');
		this.#bpm = this.#container.querySelector('#combo_tempo span');
		this.#tempo = this.#container.querySelector('#tempo');
		this.#title = this.#container.querySelector('h1');
		this.#startButton = this.#container.querySelector('#start');
		this.#resetButton = this.#container.querySelector('#reset');
		this.#settingsButton = this.#container.querySelector('#combo_presets button');
		this.#share = this.#container.querySelector('#share');
		this.#shared = this.#container.querySelector('#shared');
		this.#shareList = this.#container.querySelector('#share ul');
		this.#sharedList = this.#container.querySelector('#shared ul');
		this.#shareButton = this.#container.querySelector('#share button[name="share"]');
		this.#checkBoxMaster = this.#container.querySelector('#legend input');
		this.#checkBoxCurrent = this.#container.querySelector('#share input[name="current"]');
		this.#presetsSelection = this.#container.querySelector('#combo_presets select');
		this.#settings = this.#container.querySelector('#settings');
		this.#toast = this.#container.querySelector('#toast');
		this.#message = this.#container.querySelector('#toast p');
		this.#cancelButton = this.#container.querySelector('#toast button');

		this.#stepName = 'step';
		this.#barsName = 'bars';
		this.#beatName = 'beat';
		this.#loopName = 'loop';
		this.#trackName = 'trackbutton';
		this.#volumeName = 'volume';
		this.#instrumentName = 'instrument';

		this.#steps = this.#container.getElementsByClassName('step');
		this.#tracks = this.#container.getElementsByClassName('track');
		this.#track = this.#container.querySelector('#track');
		this.#trackIndex = this.#container.querySelector('#trackindex');
		this.#volumes = this.#container.getElementsByClassName('volume');
		this.#trackButtons = this.#container.getElementsByClassName('trackbutton');
		this.#bars = this.#container.querySelector('#bars');
		this.#beat = this.#container.querySelector('#beat');
		this.#loop = this.#container.querySelector('#loop');
		this.#instrument = this.#container.querySelector('#instrument');
		document.addEventListener('click', (event) => this.#lightDismiss(event));
		document.addEventListener('submit', (event) => this.#submitForm(event));
		this.#toast.addEventListener('animationend', this.#toast.hidePopover);
		this.#container.addEventListener('click', (event) => this.#handleClick(event));
		this.#container.addEventListener('input', (event) => this.#handleInput(event));
		this.#container.addEventListener('change', (event) => this.#handleChange(event));
		this.#shared.addEventListener('close', (event) => this.#sharedClosed(event));
		this.#presetsSelection.addEventListener('change', (event) => this.#setSelectedPreset(event));
		this.#checkBoxMaster.form.addEventListener('change', (event) => this.#checkValues(event.target));
		this.#bus.addEventListener('sequencer:stopped', (event) => this.#toggleStartButton(event));
		this.#bus.addEventListener('sequencer:updateData', ({ detail }) => this.#updateInterface(detail));
		this.#bus.addEventListener('urlState:decoded', ({ detail }) => this.#updateInterface(detail));
		this.#bus.addEventListener('sequencer:pushAnimations', ({ detail }) => this.#pushAnimations(detail));
		this.#bus.addEventListener('presets:changed', ({ detail }) => this.#updateInterface(detail));
		this.#bus.addEventListener('presets:openShared', ({ detail }) => this.#openShared(detail));
		this.#bus.addEventListener('presets:reportNameValidity', ({ detail }) => this.#reportNameValidity(detail));
		this.#bus.addEventListener('sequencer:getInterfaceData', ({ detail }) => this.#sendInterfaceData(detail));
		this.#bus.addEventListener('urlState:getInterfaceData', ({ detail }) => this.#sendInterfaceData(detail));
		this.#bus.addEventListener('urlState:closeShared', ({ detail }) => this.#closeShared(detail));
		this.#initInterface();
	}

	#initInterface() {
		this.#headTitlePrefix = `${document.title} - `;
		this.#defaultInstrument = this.#trackButtons[0].textContent;
		this.#stepsPerTracks = this.#maxBars * this.#subdivision;
		this.#presetsSelectionInit = this.#presetsSelection.cloneNode(true);
		const options = this.#instrumentsList.slice(1).map((instrument, index) => new Option(instrument.name, index + 1));
		this.#instrument.append(...options);
		this.#firstTrack = this.#tracks[0].cloneNode(true);
		this.#initTracks();
		document.title = this.#headTitlePrefix + this.#untitled;
		const defaultData = this.#firstTrack.dataset;
		this.#interfaceData = {
			defaultTempo: this.#tempo.value,
			defaultGain: this.#volumes[0].value,
			defaultBars: defaultData[this.#barsName],
			defaultBeat: defaultData[this.#beatName],
			defaultLoop: defaultData[this.#loopName],
			defaultInstrument: defaultData[this.#instrumentName],
			barsValues: Array.from(this.#bars.options).map(option => option.value),
			beatValues: Array.from(this.#beat.options).map(option => option.value),
			loopValues: Array.from(this.#loop.options).map(option => option.value),
			tracksLength: this.#tracksLength,
			tempoStep: this.#tempo.step,
			maxBars: this.#maxBars,
			maxGain: this.#volumes[0].max,
			subdivision: this.#subdivision,
		};
		if (!CSS.supports('inset', 'anchor-size(height)')) {
			import('./toast_positioning.js').then(({ applyPolyfill }) => applyPolyfill(this.#toast, this.#container));
		}
	}

	#initTracks() {
		const newTracks = Array.from({ length: this.#tracksLength }, () => this.#firstTrack.cloneNode(true));
		this.#tracks[0].parentNode.replaceChildren(...newTracks);
		Array.from(this.#tracks).forEach(track => {
			track.addEventListener('input', (event) => this.#handleInputVolume(event));
			track.addEventListener('click', (event) => this.#handleModifyTrack(event));
			track.addEventListener('dragover', (event) => this.#handleDragOver(event));
			track.addEventListener('dragstart', (event) => this.#handleDragStart(event));
			track.addEventListener('dragenter', (event) => this.#handleDragEnter(event));
			track.addEventListener('dragleave', (event) => this.#handleDragLeave(event));
			track.addEventListener('drop', (event) => this.#handleDrop(event));
		});
	}

	#sendInterfaceData(callback) {
		callback(() => structuredClone(this.#interfaceData));
	}

	#submitForm(event) {
		const action = event.submitter.name;
		if (action === 'apply') {
			this.#setTrack(event.target);
		}
		else if (action === 'save') {
			this.#saveSettings(event.target);
		}
		else if (action === 'cancel') {
			this.#cancelSettings(event.submitter);
		}
		else if (action === 'share_list') {
			this.#showShareList();
		}
		else if (action === 'share') {
			this.#sharePresets(event.target);
		}
		else if (action === 'import') {
			this.#importPresets(event.target);
		}
	}

	async #audioRequest() {
		return await new Promise(resolve => {
			this.#bus.dispatchEvent(new CustomEvent('interface:audioRequest', { detail: { resolve } }));
		});
	}

	async #handleClick(event) {
		const { target } = event;
		// Cas où l'audio doit être prêt avant d’agir
		if (target === this.#startButton || target.name === this.#stepName) {
			await this.#audioRequest();
		}
		// Cas où l'audio peut se s'activer en arrière-plan
		else {
			this.#audioRequest();
		}
		if (target.name === this.#stepName) {
			this.#changeNote(target);
		}
		else if (target === this.#resetButton) {
			this.#reset();
		}
		else if (target === this.#startButton) {
			this.#toggleStartButton();
		}
		else if (target === this.#settingsButton) {
			this.#openSettings(event);
		}
		else if (target.href && !target.startsWith('#')) {
			this.#loadClickedPreset(event);
		}
	}

	#handleInput(event) {
		const { target } = event;
		if (target === this.#presetsSelection) {
			this.#changePreset();
		}
		else if (target === this.#tempo) {
			this.#inputTempo(target);
		}
	}

	#handleChange(event) {
		const { target } = event;
		if (target === this.#tempo) {
			this.#changeTempo();
		}
		else if (target.name === this.#volumeName) {
			this.#changeVolume();
		}
	}

	#changeNote(target) {
		let targetPosition = 0;
		for (targetPosition; targetPosition < this.#steps.length; targetPosition++) {
			if (this.#steps[targetPosition] === target) break;
		}
		const trackIndex = Math.floor(targetPosition / this.#stepsPerTracks);
		const remainder = targetPosition % this.#stepsPerTracks;
		const barIndex = Math.floor(remainder / this.#subdivision);
		const stepIndex = remainder % this.#subdivision;
		const change = { barIndex, stepIndex, value: Number(target.value) };
		const event = new CustomEvent('interface:changeNote', { detail: { trackIndex, change } });
		this.#bus.dispatchEvent(event);
	}

	#handleModifyTrack(event) {
		if (event.target.name !== this.#trackName) return;
		const track = event.currentTarget;
		const values = track.dataset;
		this.#beat.value = values.beat;
		this.#bars.value = values.bars;
		this.#loop.value = values.loop;
		this.#instrument.value = values.instrument;
		this.#trackIndex.value = [...this.#tracks].indexOf(track);
		this.#track.showModal();
		//this.#track.focus();
	}

	#setTrack(form) {
		const changes = {}
		const trackIndex = Number(this.#trackIndex.value);
		const values = this.#tracks[trackIndex].dataset;
		const instrumentIndex = this.#instrument.value === '' ? '0' : this.#instrument.value;
		if (values.beat !== this.#beat.value) {
			values.beat = this.#beat.value;
			changes.beat = this.#beat.value;
		}
		if (values.bars !== this.#bars.value) {
			values.bars = this.#bars.value;
			changes.bars = this.#bars.value;
		}
		if (values.loop !== this.#loop.value) {
			values.loop = this.#loop.value;
			changes.loop = this.#loop.value;
		}
		if (values.instrument !== instrumentIndex) {
			values.instrument = instrumentIndex;
			changes.instrument = instrumentIndex;
			this.#updateIntrumentName(trackIndex, instrumentIndex);
		}
		if (Object.keys(changes).length > 0) {
			const detail = { detail: { tracks: { [trackIndex]: changes } } };
			this.#bus.dispatchEvent(new CustomEvent('interface:inputTrack', detail));
			this.#bus.dispatchEvent(new CustomEvent('interface:changeTrack'));
		}
	}

	#handleInputVolume(event) {
		const { currentTarget, target } = event;
		const trackIndex = [...this.#tracks].indexOf(currentTarget);
		const detail = { detail: { tracks: { [trackIndex]: { volume: Number(target.value) } } } };
		this.#bus.dispatchEvent(new CustomEvent('interface:inputTrack', detail));
	}

	#inputTempo(target) {
		const { value } = target;
		this.#bpm.textContent = value;
		const event = new CustomEvent('interface:inputTempo', { detail: Number(value) })
		this.#bus.dispatchEvent(event);
	}

	#changeVolume() {
		this.#bus.dispatchEvent(new CustomEvent('interface:changeVolume'));
	}

	#changeTempo() {
		this.#bus.dispatchEvent(new CustomEvent('interface:changeTempo'));
	}

	#changePreset() {
		this.#bus.dispatchEvent(new CustomEvent('interface:restart'));
	}

	#updateInterface(changes) {
		Object.entries(changes).forEach(([item, value]) => {
			switch (item) {
				case 'tempo':   this.#updateTempo(value); break;
				case 'title':   this.#updatetTitle(value); break;
				case 'tracks':  this.#updateTracks(value); break;
				case 'presets': this.#updatePresets(value); break;
				case 'index':   this.#updatePresetsIndex(value); break;
			}
		});
	}

	#updateTracks(changes) {
		for (const [index, trackChanges] of Object.entries(changes)) {
			const trackIndex = Number(index);
			const track = this.#tracks[trackIndex];
			const trackOffset = trackIndex * this.#stepsPerTracks;
			for (const [item, data] of Object.entries(trackChanges)) {
				if (item === 'sheet') {
					for (const { barIndex, stepIndex, value } of data) {
						this.#steps[trackOffset + barIndex * this.#subdivision + stepIndex].value = value;
					}
				} else if (item in track.dataset) {
					track.dataset[item] = data;
					if (item === this.#instrumentName) {
						this.#updateIntrumentName(trackIndex, data);
					}
				} else if (item === this.#volumeName) {
					this.#volumes[trackIndex].value = data;
				}
			}
		}
	}

	#updateIntrumentName(trackIndex, instrumentIndex) {
		const instrumentName = this.#instrumentsList[instrumentIndex]?.name || this.#defaultInstrument;
		this.#trackButtons[trackIndex].textContent = instrumentName;
	}

	#updatetTitle(title) {
		this.#title.textContent = title;
		document.title = this.#headTitlePrefix + (title || this.#untitled);
		console.log('Presets title updated');
	}

	#updateTempo(tempo) {
		this.#tempo.value = tempo;
		this.#bpm.textContent = tempo;
	}

	#updatePresets(presets) {
		const fragment = new DocumentFragment();
		if (presets.length) {
			fragment.appendChild(this.#presetsSelection.options[0].cloneNode(true));
			presets.forEach(({ name, value }) => {
				const text = name || this.#untitled;
				fragment.appendChild(new Option(text, value));
			});
		} else {
			fragment.replaceChildren(...this.#presetsSelectionInit.cloneNode(true).options);
		}
		this.#presetsSelection.replaceChildren(fragment);
		console.log('Presets options updated');
	}

	#updatePresetsIndex(index) {
		this.#presetsSelection.selectedIndex = index + 1;
		console.log('Presets index updated');
	}

	#toggleStartButton() {
		const shouldStart = !this.#frameId;
		//Suppression des animations planifiées
		if (!shouldStart && this.#animationQueue.size > 0) {
			this.#pushAnimations({ animations: new Map() });
		}
		this.#container.classList.toggle(this.#startClass, shouldStart);
		this.#startButton.setAttribute('aria-checked', String(shouldStart));
		const event = shouldStart ? 'interface:start' : 'interface:stop';
		this.#bus.dispatchEvent(new CustomEvent(event));
	}

	#pushAnimations({ animations }) {
		//Supprime les pistes qui ne sont plus actives
		for (const [trackIndex, steps] of this.#animationQueue.entries()) {
			if (!animations.has(trackIndex)) {
				steps[0]?.step?.classList.remove(this.#currentClass);
				this.#animationQueue.delete(trackIndex);
			}
		}
		//Ajout des animations à la pile animationQueue
		animations.forEach((items, trackIndex) => {
			let steps = this.#animationQueue.get(trackIndex);
			if (!steps) {
				//step fictif pour gérer la première animation
				steps = [{ step: null }];
				this.#animationQueue.set(trackIndex, steps);
			}
			const baseIndex = trackIndex * this.#stepsPerTracks;
			items.forEach(({ barIndex, stepIndex, time }) => {
				const step = this.#steps[baseIndex + barIndex * this.#subdivision + stepIndex];
				steps.push({ step, time });
			});
			//Évite l'accumulation d'animations non exécutées (onglet inactif, latence)
			const maxLength = this.#subdivision * 2;
			if (steps.length > maxLength) {
				steps.splice(1, steps.length - maxLength);
			}
		});
		if (!this.#frameId) {
			const loop = () => {
				const now = performance.now();
				for (const steps of this.#animationQueue.values()) {
					if (steps.length < 2) continue;
					let currentIndex = 0;
					for (let i = 1; i < steps.length; i++) {
						if (now >= steps[i].time) {
							currentIndex = i;
						} else {
							break;
						}
					}
					if (currentIndex === 0) continue;
					steps[0]?.step?.classList.remove(this.#currentClass);
					steps[currentIndex].step?.classList.add(this.#currentClass);
					steps.splice(0, currentIndex);
				}
				this.#frameId = this.#animationQueue.size > 0
					? requestAnimationFrame(loop)
					: null;
			};
			this.#frameId = requestAnimationFrame(loop);
		}
	}

	#reset() {
		this.#initTracks();
		this.#title.textContent = '';
		document.title = this.#headTitlePrefix + this.#untitled;
		this.#presetsSelection.selectedIndex = 0;
		this.#tempo.value = this.#tempo.defaultValue;
		this.#bpm.textContent = this.#tempo.defaultValue;
		this.#bus.dispatchEvent(new CustomEvent('interface:reset'));
	}

//swap
	#handleDragStart(event) {
		const track = event.currentTarget;
		if (track.dataset[this.#instrumentName] === '0') {
			return event.preventDefault();
		}
		event.dataTransfer.setData('text/plain', [...this.#tracks].indexOf(track));
		event.dataTransfer.setDragImage(event.target, 0, 15);
		event.dataTransfer.effectAllowed = 'move';
	}

	#handleDragEnter(event) {
		if (event.target.className == this.#dropzoneClass) {
			event.currentTarget.classList.add(this.#draggedClass);
		}
	}

	#handleDragLeave(event) {
		if (event.target.className == this.#dropzoneClass) {
			event.currentTarget.classList.remove(this.#draggedClass);
		}
	}

	#handleDragOver(event) {
		if (event.target.className === this.#dropzoneClass) {
			event.preventDefault();
		}
	}

	#handleDrop(event) {
		if (event.target.className !== this.#dropzoneClass) return;
		const sourceIndex = Number(event.dataTransfer.getData('text'));
		const targetTrack = event.currentTarget;
		const targetIndex = [...this.#tracks].indexOf(targetTrack);
		targetTrack.classList.remove(this.#draggedClass);
		if (targetIndex !== sourceIndex && targetIndex !== sourceIndex + 1) {
			const draggedTrack = this.#tracks.item(sourceIndex);
			const oldPositions = this.#getTracksYPositions();
			targetTrack.before(draggedTrack);
			const newPositions =  this.#getTracksYPositions();
			newPositions.forEach((newPosition, track) => {
				if (track === draggedTrack) {
					track.animate([
						{ opacity: 0, transform: 'scaleY(0.3)' },
						{ opacity: 1, transform: 'scaleY(1)' }
					], { duration: 200, easing: 'ease' });
				}
				else {
					const oldPosition = oldPositions.get(track);
					const deltaY = oldPosition - newPosition;
					if (deltaY !== 0) {
						track.animate([
							{ transform: `translateY(${deltaY}px)` },
							{ transform: 'translateY(0)' }
						], { duration: 300, easing: 'ease' });
					}
				}
			});
			this.#bus.dispatchEvent(new CustomEvent('interface:swapTracks', { detail: { sourceIndex, targetIndex } }));
		}
	}

	#getTracksYPositions() {
		return new Map(
			Array.from(this.#tracks).map(track => [track, track.getBoundingClientRect().top])
		);
	}

	#lightDismiss({target}) {
		if (target.tagName === 'DIALOG') {
			target.close();
		}
	}
//end swap


//presets
	#setSelectedPreset(event) {
		const { value, selectedIndex, options } = event.target;
		const { text } = options[selectedIndex];
		const name = text === this.#untitled ? undefined : text;
		this.#bus.dispatchEvent(new CustomEvent('interface:presetSelected', { detail: { name, value } }));
	}

	#loadClickedPreset(event) {
		event.preventDefault();
		this.#shared.close();
		this.#bus.dispatchEvent(new CustomEvent('interface:presetClicked', { detail: event.target.href }));
	}

	#openSettings() {
		const title = this.#title.textContent;
		const presetIndex = Array.from(this.#presetsSelection.options)
			.slice(1)
			.findIndex(option => option.text === title);
		const hasSelection = this.#presetsSelection.selectedIndex > 0;
		const exists = presetIndex !== -1 && title;
		const formsValues = [
			{ formId:'newOne', name: exists ? '' : title, hidden: hasSelection },
			{ formId:'modify', name: title, hidden: hasSelection || !exists },
			{ formId:'rename', name: title, hidden: !hasSelection },
			{ formId:'delete', name: title, hidden: !hasSelection },
		];
		for (const { formId, name, hidden } of formsValues) {
			const form = document.forms[formId];
			form.hidden = hidden;
			form.elements.name.value = name;
		}
		this.#settings.showModal();
		this.#settings.focus();
	}

	async #saveSettings(form) {
		event.preventDefault();
		try {
			const action = form.id;
			const nameInput = form.elements['name'];
			const name = nameInput.value.trim();
			await new Promise((resolve, reject) => {
				this.#bus.dispatchEvent(new CustomEvent('interface:settingsSave', { 
					detail: { action, name, promise: { resolve, reject } }
				}));
			});
			this.#cancelButton.setAttribute('form', form.id);
			this.#showToast(form.dataset.success);
		} catch (error) {
			this.#settings.close();
			this.#showToast(form.dataset.failure);
		}
	}

	async #cancelSettings(button) {
		this.#toast.hidePopover();
		const messages = button.form.dataset;
		button.removeAttribute('form');
		try {
			await new Promise((resolve, reject) => {
				this.#bus.dispatchEvent(new CustomEvent('interface:settingsCancel', { 
					detail: { resolve, reject }
				}));
			});
			this.#showToast(messages.cancelSuccess);
		} catch (error) {
			this.#showToast(messages.cancelFailure);
		}
	}

	#reportNameValidity({ action, customValidity }) {
		const input = document.forms[action].elements.name;
		if (customValidity === '') {
			this.#settings.close();
		}
		else {
			input.setCustomValidity(customValidity);
			input.reportValidity();
			input.addEventListener('input', () => {
				input.setCustomValidity('');
			}, { once: true });
		}
	}

	#showToast(message) {
		this.#cancelButton.hidden = !this.#cancelButton.form;
		this.#message.textContent = message;
		this.#toast.showPopover();
	}

	#openShared(links) {
		this.#sharedList.replaceChildren(
			...links.map(({ name, url }) => {
				const a = document.createElement('a');
				const li = document.createElement('li');
				a.href = url;
				a.textContent = name || this.#untitled;
				li.appendChild(a);
				return li;
			})
		);
		this.#shared.showModal();
		this.#shared.focus();
	}

	#sharedClosed() {
		this.#bus.dispatchEvent(new CustomEvent('interface:sharedClosed'));
	}

	#closeShared() {
		this.#shared.close();
	}

	#showShareList() {
		const hasCurrent = Array.prototype.some.call(this.#steps, step => step.value !== '0');
		const { items, checkedBox, checkBoxShare } = Array.from(this.#presetsSelection.options).reduce(
			(data, option, index) => {
				const name = option.text;
				// Conserve uniquement les morceaux avec un nom
				if (option.disabled || name === this.#untitled) return data;
				const li = document.createElement('li');
				const label = document.createElement('label');
				const checked = option.selected;
				const checkBox = Object.assign(document.createElement('input'), {
					type: 'checkbox',
					name: 'index',
					value: index - 1,
					checked,
				});
				label.append(checkBox, document.createTextNode(name));
				li.append(label);
				data.items.push(li);
				data.checkBoxShare.push(checkBox);
				if (checked) data.checkedBox = checkBox;
				return data;
			},
			{ items: [], checkedBox: null, checkBoxShare: [] }
		);
		if (!items.length) {
			const li = document.createElement('li');
			li.textContent = 'Aucun morceau';
			items.push(li);
		}
		this.#shareList.replaceChildren(...items);
		this.#checkBoxShare = checkBoxShare;
		this.#checkBoxMaster.checked = items.length === 1 && checkedBox;
		this.#checkBoxMaster.disabled = items.length === 0;
		this.#checkBoxCurrent.disabled = !!checkedBox || !hasCurrent;
		this.#checkBoxCurrent.checked = !this.#checkBoxCurrent.disabled;
		this.#shareButton.disabled = !hasCurrent;
		this.#share.showModal();
		if (checkedBox) {
			checkedBox.scrollIntoView({ behavior: 'instant', block: 'center' });
		}
	}

	async #sharePresets(form) {
		const data = new FormData(form);
		const presetsIndex = data.getAll('index');
		const hasCurrent = this.#checkBoxCurrent.checked;
		try {
			await new Promise((resolve, reject) => {
				this.#bus.dispatchEvent(new CustomEvent('interface:presetsShare', { 
					detail: { presetsIndex, hasCurrent, promise: { resolve, reject } }
				}));
			});
		} catch (error) {
			this.#showToast(form.dataset.failure);
		}
	}

	async #importPresets(form) {
		try {
			await new Promise((resolve, reject) => {
				this.#bus.dispatchEvent(new CustomEvent('interface:presetsImport', { 
					detail: { resolve, reject }
				}));
			});
			this.#cancelButton.setAttribute('form', form.id);
			this.#showToast(form.dataset.success);
		} catch (error) {
			this.#showToast(form.dataset.failure);
		}
	}

	#checkValues(target) {
		if (target === this.#checkBoxMaster) {
			this.#checkBoxShare.forEach(checkbox => checkbox.checked = this.#checkBoxMaster.checked);
		}
		const checkedCount = this.#checkBoxShare.filter(checkbox => checkbox.checked).length;
		this.#checkBoxMaster.checked = checkedCount > 0 && checkedCount === this.#checkBoxShare.length;
		this.#shareButton.disabled = checkedCount === 0 && !this.#checkBoxCurrent.checked;
	}
//endpreset
}
