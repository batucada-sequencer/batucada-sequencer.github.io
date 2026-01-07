export default class InterfacePresets {
	#ui;
	#bus;
	#checkBoxShare;
	#toast =          document.querySelector('#toast');
	#share =          document.querySelector('#share');
	#shared =         document.querySelector('#shared');
	#settings =       document.querySelector('#settings');
	#shareList =      document.querySelector('#share ul');
	#presetName =     document.querySelector('#preset');
	#sharedList =     document.querySelector('#shared ul');
	#shareButton =    document.querySelector('#share button[name="share"]');
	#toastMessage =   document.querySelector('#toast p');
	#cancelButton =   document.querySelector('#toast button');
	#settingsButton = document.querySelector('#combo_presets button');
	#checkBoxMaster = document.querySelector('#check_all input');

	constructor({ bus, parent }) {
		this.#bus = bus
		this.#ui = parent;

		document.                 addEventListener('submit',       (event) => this.#submitForm(event));
		this.#shared.             addEventListener('close',        (event) => this.#sharedClosed());
		this.#toast.              addEventListener('animationend', (event) => this.#toast.hidePopover());
		this.#checkBoxMaster.form.addEventListener('change',       (event) => this.#checkValues(event));
		this.#ui.presets.         addEventListener('change',       (event) => this.#setSelectedPreset(event));
		this.#settingsButton.     addEventListener('click',        (event) => this.#openSettings());
		this.#sharedList.         addEventListener('click',        (event) => this.#loadClickedPreset(event));

		this.#toastPositioning();
	}

	// Chargement conditionnel du polyfill toast_positioning
	async #toastPositioning() {
		if (!CSS.supports('inset', 'anchor-size(height)')) {
			const { applyPolyfill } = await import('./toast_positioning.js');
			applyPolyfill(this.#toast, this.#ui.container);
		}
	}

	#setSelectedPreset(event) {
		const { value, selectedIndex, options } = event.target;
		const { text } = options[selectedIndex];
		const name = text === this.#ui.untitled ? undefined : text;
		document.startViewTransition(() => {
			this.#bus.dispatchEvent(new CustomEvent('interface:presetSelected', { detail: { name, value } }));
		});
	}

	#loadClickedPreset(event) {
		const href = event.target.href;
		if (!href) return;
		event.preventDefault();
		this.#shared.close();
		this.#bus.dispatchEvent(new CustomEvent('interface:presetClicked', { detail: href }));
	}

	#openSettings() {
		const title = this.#ui.title.textContent;
		const presetIndex = Array.from(this.#ui.presets.options)
			.slice(1)
			.findIndex(option => option.text === title);
		const hasSelection = this.#ui.presets.selectedIndex > 0;
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
		this.#presetName.textContent = title || this.#ui.untitled;
		this.#settings.showModal();
		this.#settings.focus();
	}

	#openShareList() {
		const isUnsaved = this.#ui.presets.selectedIndex < 1 && this.#ui.hasStroke;
		const data = { items: [], checkBoxList: [], checkedBox: false };
		if (isUnsaved) {
			const { li, input } = this.#createCheckItem({
				name: this.#ui.unsaved,
				value: -1,
				checked: true,
			});
			data.items.push(li);
			data.checkedBox = input;
			data.checkBoxList.push(input);
		}
		Array.from(this.#ui.presets.options).forEach((option, index) => {
			const name = option.text;
			// Conserve uniquement les morceaux avec un nom
			if (option.disabled || name === this.#ui.untitled) return;
			const { li, input } = this.#createCheckItem({
				name,
				value: index - 1,
				checked: option.selected,
			});
			data.items.push(li);
			data.checkBoxList.push(input);
			if (input.checked) data.checkedBox = input;
		});
		const { items, checkedBox, checkBoxList } = data;
		this.#shareList.replaceChildren(...items);
		this.#checkBoxShare = checkBoxList;
		this.#checkValues();
		this.#share.showModal();
		if (checkedBox) {
			checkedBox.scrollIntoView({ behavior: 'instant', block: 'center' });
		}
	}

	#createCheckItem = ({ name, value, checked }) => {
		const li = document.createElement('li');
		const label = document.createElement('label');
		const input = Object.assign(document.createElement('input'), {
			type: 'checkbox',
			name: 'index',
			value,
			checked,
		});
		label.append(input, document.createTextNode(name));
		li.append(label);
		return { li, input };
	};

	openShared(links) {
		this.#sharedList.replaceChildren(
			...links.map(({ name, url }) => {
				const a = document.createElement('a');
				const li = document.createElement('li');
				a.href = url;
				a.textContent = name ||this.#ui.untitled;
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

	#checkValues(event = { target: false }) {
		if (event.target === this.#checkBoxMaster) {
			this.#checkBoxShare.forEach(checkbox => checkbox.checked = this.#checkBoxMaster.checked);
		}
		const checkedCount = this.#checkBoxShare.filter(checkbox => checkbox.checked).length;
		this.#checkBoxMaster.checked = checkedCount > 0 && checkedCount === this.#checkBoxShare.length;
		this.#checkBoxMaster.setCustomValidity('');
	}

	#submitForm(event) {
		const action = event.submitter.name;
		if (action === 'save') {
			this.#saveSettings(event);
		}
		else if (action === 'cancel') {
			this.#cancelSettings(event.submitter);
		}
		else if (action === 'share_list') {
			this.#openShareList();
		}
		else if (action === 'share') {
			this.#sharePresets(event);
		}
		else if (action === 'import') {
			this.#importPresets(event.target);
		}
	}

	async #saveSettings(event) {
		event.preventDefault();
		const form = event.target;
		try {
			const action = form.id;
			const presetName = form.elements['name'];
			const name = presetName.value.trim();
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

	reportNameValidity({ action, customValidity }) {
		const input = document.forms[action].elements.name;
		const datasetNames = {
			empty: 'invalidEmpty',
			duplicated: 'invalidDuplicated',
		}
		const validity = input.dataset[datasetNames[customValidity]] ?? '';
		if (validity === '') {
			this.#settings.close();
		}
		else {
			input.setCustomValidity(validity);
			input.reportValidity();
			input.addEventListener('input', () => {
				input.setCustomValidity('');
			}, { once: true });
		}
	}

	#showToast(message) {
		this.#cancelButton.hidden = !this.#cancelButton.form;
		this.#toastMessage.textContent = message;
		this.#toast.showPopover();
	}

}