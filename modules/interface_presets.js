export default class InterfacePresets {
	#ui;
	#bus;
	#sharedPresets;
	#checkBoxShare;
	#toast =          document.querySelector('#toast');
	#share =          document.querySelector('#presets-share');
	#shared =         document.querySelector('#presets-shared');
	#dialogs =        document.querySelector('#dialogs');
	#settings =       document.querySelector('#presets-settings');
	#shareList =      document.querySelector('#presets-share ul');
	#presetName =     document.querySelector('#presets-settings h2');
	#sharedList =     document.querySelector('#presets-shared ul');
	#toastMessage =   document.querySelector('#toast p');
	#cancelButton =   document.querySelector('#toast button');
	#presetsButton =  document.querySelector('button.presets');
	#checkBoxMaster = document.querySelector('[name="check_all"]');

	constructor({ bus, parent }) {
		this.#bus = bus
		this.#ui = parent;

		document.           addEventListener('change',       (event) => this.#handleChange(event));
		this.#dialogs.      addEventListener('command',      (event) => this.#handleCommand(event), { capture: true });
		this.#dialogs.      addEventListener('submit',       (event) => this.#submitForm(event));
		this.#shared.       addEventListener('close',        (event) => this.#sharedClosed(event));
		this.#toast.        addEventListener('animationend', (event) => this.#toast.hidePopover());
		this.#presetsButton.addEventListener('click',        (event) => this.#showToast(event));
		this.#sharedList.   addEventListener('click',        (event) => this.#loadClickedPreset(event));

		this.#toastPositioning();
	}

	// Chargement conditionnel du polyfill toast_positioning
	async #toastPositioning() {
		if (!CSS.supports('inset', 'anchor-size(height)')) {
			const { applyPolyfill } = await import('./polyfills/anchor-positioning.js');
			applyPolyfill(this.#toast, this.#ui.container);
		}
	}

	#submitForm(event) {
		const action = event.submitter.name;
		if (action === 'save') {
			this.#saveSettings(event);
		}
		else if (action === 'share') {
			this.#sharePresets(event);
		}
	}

	#handleChange(event) {
		if (event.target === this.#ui.presets) {
			this.#bus.dispatchEvent(
				new CustomEvent('interface:presetSelected', { detail: event.target.selectedIndex })
			);
		}
		else if (event.target.name === 'check_all' || event.target.name === 'index') {
			this.#checkValues(event);
		}
	}

	#handleCommand(event) {
		const { command, source } = event;
		if (command === 'show-modal') {
			if (event.target === this.#share) this.#openShareList();
			if (event.target === this.#settings) this.#openSettings();
		}
		else if (command === '--import') {
			this.#importPresets(source);
		}
		else if (command === '--cancel') {
			this.#cancelSettings(source);
		}
	}

	#loadClickedPreset(event) {
		event.preventDefault();
		this.#shared.close(event.target.href);
	}

	#openSettings() {
		const title = this.#ui.title.textContent.trim();
		const exists = Array.from(this.#ui.presets.options).some(option => option.text === title);
		const hasSelection = this.#ui.presets.selectedIndex !== -1;

		const formsValues = [
			{ id: 'newOne', name: exists ? '' : title, hidden: hasSelection },
			{ id: 'modify', name: title,               hidden: hasSelection || !exists },
			{ id: 'rename', name: title,               hidden: !hasSelection },
			{ id: 'delete', name: title,               hidden: !hasSelection },
		];

		for (const { id, name, hidden } of formsValues) {
			const form = document.forms[id];
			const input = form.elements['name'];
			form.hidden = hidden;
			input.value = name;
			input.setCustomValidity('');
		}

		this.#presetName.textContent = title || this.#ui.untitled;
	}

	#openShareList() {
		this.#settings.close();

		const options = Array.from(this.#ui.presets.options);
		const isUnsaved = this.#ui.presets.selectedIndex === -1 && this.#ui.hasStroke;
		const items = [];
		if (isUnsaved) {
			items.push({ text: this.#ui.untitled, value: -1, checked: true });
		}

		options.forEach(({ text, selected }, value) => {
			if (text !== this.#ui.untitled) {
				items.push({ text, value, checked: selected });
			}
		});

		const nodes = items.map(data => this.#createCheckItem(data));
		this.#shareList.replaceChildren(...nodes);
		this.#checkBoxShare = nodes.map(li => li.querySelector('input'));
		this.#checkValues();

		requestAnimationFrame(() => {
			this.#checkBoxShare.find(item => item.checked)?.scrollIntoView({ 
				behavior: 'instant',
				block: 'center',
			});
		});
	}

	#createCheckItem = ({ text, value, checked }) => {
		const li = document.createElement('li');
		const label = document.createElement('label');
		const input = Object.assign(document.createElement('input'), {
			type: 'checkbox',
			name: 'index',
			value,
			checked,
		});
		label.append(input, document.createTextNode(text));
		li.append(label);
		return li;
	};

	openShared({ links, presets }) {
		this.#sharedPresets = presets;
		this.#sharedList.replaceChildren(
			...links.map(({ name, url }) => {
				const a = document.createElement('a');
				const li = document.createElement('li');
				a.href = url;
				a.textContent = name || this.#ui.untitled;
				li.appendChild(a);
				return li;
			})
		);
		this.#shared.showModal();
		this.#shared.focus();
	}

	#sharedClosed(event) {
		this.#bus.dispatchEvent(new CustomEvent('interface:sharedClosed', { detail: event.target.returnValue }));
	}

	#checkValues(event = { target: false }) {
		if (event.target?.name === 'check_all') {
			this.#checkBoxShare.forEach(checkbox => checkbox.checked = this.#checkBoxMaster.checked);
		}
		const checkedCount = this.#checkBoxShare.filter(checkbox => checkbox.checked).length;
		this.#checkBoxMaster.checked = checkedCount > 0 && checkedCount === this.#checkBoxShare.length;
		this.#checkBoxMaster.setCustomValidity('');
	}

	async #saveSettings(event) {
		event.preventDefault();
		const {
			target: { id: action, elements }, 
			submitter: button 
		} = event;
		const messages = button.dataset;

		try {
			const name = elements['name']?.value.trim() || '';
			const request = await new Promise((resolve, reject) => {
				this.#bus.dispatchEvent(new CustomEvent('interface:settingsSave', { 
					detail: { action, name, promise: { resolve, reject } }
				}));
			});
			if (request === false) return;
			this.#settings.close();
			await request.result;
			this.#cancelButton.commandForElement = button;
			this.#showToast(messages.success);
		} 

		catch (error) {
			this.#settings.close();
			this.#showToast(messages.failure);
		}
	}

	reportNameValidity({ action, status }) {
		const input = document.forms[action]?.elements['name'];
		const datasetNames = { empty: 'invalidEmpty', duplicated: 'invalidDuplicated' };
		const validityMessage = input.dataset[datasetNames[status]];
		input.setCustomValidity(validityMessage);
		input.reportValidity();
		input.addEventListener('input', () => input.setCustomValidity(''), { once: true });
	}


	async #cancelSettings(source) {
		this.#toast.hidePopover();
		const messages = source.commandForElement.dataset;
		source.commandForElement = null;
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

	async #sharePresets(event) {
		const data = new FormData(event.target);
		const presetsIndex = data.getAll('index');
		if (!presetsIndex.length) {
			this.#checkBoxMaster.setCustomValidity(this.#checkBoxMaster.dataset.invalidEmpty);
			this.#checkBoxMaster.reportValidity();
			event.preventDefault();
			return;
		}
		try {
			await new Promise((resolve, reject) => {
				this.#bus.dispatchEvent(new CustomEvent('interface:presetsShare', {
					detail: { presetsIndex, promise: { resolve, reject } }
				}));
			});
		} catch (error) {
			this.#showToast(event.target.dataset.failure);
		}
	}

	async #importPresets(source) {
		const messages = source.dataset;
		try {
			if (!this.#sharedPresets?.length) throw new Error();
			await new Promise((resolve, reject) => {
				this.#bus.dispatchEvent(new CustomEvent('interface:presetsImport', {
					detail: { data: this.#sharedPresets, promise: { resolve, reject } }
				}));
			});
			this.#sharedPresets = null;
			this.#cancelButton.commandForElement = form;
			this.#showToast(messages.success);
		} catch {
			this.#showToast(messages.failure);
		}
	}

	#showToast(payload) {
		const isEvent = payload instanceof Event;
		const message = isEvent ? payload.currentTarget.dataset.message : payload;
		this.#toastMessage.textContent = message;
		this.#cancelButton.hidden = isEvent || !this.#cancelButton.commandForElement;
		this.#toast.showPopover();
	}
}