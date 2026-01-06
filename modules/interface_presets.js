export function init(ui) {

	let checkBoxShare;
	const share = document.querySelector('#share');
	const shared = document.querySelector('#shared');
	const shareList = document.querySelector('#share ul');
	const sharedList = document.querySelector('#shared ul');
	const shareButton = document.querySelector('#share button[name="share"]');
	const checkBoxMaster = document.querySelector('#check_all input');
	const settings = document.querySelector('#settings');
	const settingsButton = document.querySelector('#combo_presets button');
	const presetName = document.querySelector('#preset');
	const toast = document.querySelector('#toast');
	const toastMessage = document.querySelector('#toast p');
	const cancelButton = document.querySelector('#toast button');

	document.addEventListener('submit', submitForm);
	shared.addEventListener('close', sharedClosed);
	toast.addEventListener('animationend', toast.hidePopover);
	checkBoxMaster.form.addEventListener('change', checkValues);
	ui.presetsSelection.addEventListener('change', setSelectedPreset);
	settingsButton.addEventListener('click', openSettings);
	sharedList.addEventListener('click', loadClickedPreset);
	toastPositioning();

	// Chargement conditionnel du polyfill toast_positioning
	async function toastPositioning() {
		if (!CSS.supports('inset', 'anchor-size(height)')) {
			const { applyPolyfill } = await import('./toast_positioning.js');
			applyPolyfill(toast, ui.container);
		}
	}

	function setSelectedPreset(event) {
		const { value, selectedIndex, options } = event.target;
		const { text } = options[selectedIndex];
		const name = text === ui.untitled ? undefined : text;
		document.startViewTransition(() => {
			ui.bus.dispatchEvent(new CustomEvent('interface:presetSelected', { detail: { name, value } }));
		});
	}

	function loadClickedPreset(event) {
		const url = event.target.href;
		if (!url) return;
		event.preventDefault();
		shared.close();
		ui.bus.dispatchEvent(new CustomEvent('interface:presetClicked', { detail: url }));
	}

	function openSettings() {
		const title = ui.title.textContent;
		const presetIndex = Array.from(ui.presetsSelection.options)
			.slice(1)
			.findIndex(option => option.text === title);
		const hasSelection = ui.presetsSelection.selectedIndex > 0;
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
		presetName.textContent = title || ui.untitled;
		settings.showModal();
		settings.focus();
	}

	function openShareList() {
		const unsaved = ui.presetsSelection.selectedIndex < 1 && ui.hasStroke();
		const data = { items: [], checkBoxList: [], checkedBox: false };
		if (unsaved) {
			const { li, input } = createCheckItem({
				name: ui.unsaved,
				value: -1,
				checked: true,
			});
			data.items.push(li);
			data.checkedBox = input;
			data.checkBoxList.push(input);
		}
		Array.from(ui.presetsSelection.options).forEach((option, index) => {
			const name = option.text;
			// Conserve uniquement les morceaux avec un nom
			if (option.disabled || name === ui.untitled) return;
			const { li, input } = createCheckItem({
				name,
				value: index - 1,
				checked: option.selected,
			});
			data.items.push(li);
			data.checkBoxList.push(input);
			if (input.checked) data.checkedBox = input;
		});
		const { items, checkedBox, checkBoxList } = data;
		shareList.replaceChildren(...items);
		checkBoxShare = checkBoxList;
		checkValues();
		share.showModal();
		if (checkedBox) {
			checkedBox.scrollIntoView({ behavior: 'instant', block: 'center' });
		}
	}

	const createCheckItem = ({ name, value, checked }) => {
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

	function openShared(links) {
		sharedList.replaceChildren(
			...links.map(({ name, url }) => {
				const a = document.createElement('a');
				const li = document.createElement('li');
				a.href = url;
				a.textContent = name || ui.untitled;
				li.appendChild(a);
				return li;
			})
		);
		shared.showModal();
		shared.focus();
	}

	function sharedClosed() {
		ui.bus.dispatchEvent(new CustomEvent('interface:sharedClosed'));
	}

	function checkValues(event = { target: false }) {
		if (event.target === checkBoxMaster) {
			checkBoxShare.forEach(checkbox => checkbox.checked = checkBoxMaster.checked);
		}
		const checkedCount = checkBoxShare.filter(checkbox => checkbox.checked).length;
		checkBoxMaster.checked = checkedCount > 0 && checkedCount === checkBoxShare.length;
		checkBoxMaster.setCustomValidity('');
	}

	function submitForm(event) {
		const action = event.submitter.name;
		if (action === 'save') {
			saveSettings(event.target);
		}
		else if (action === 'cancel') {
			cancelSettings(event.submitter);
		}
		else if (action === 'share_list') {
			openShareList();
		}
		else if (action === 'share') {
			sharePresets(event);
		}
		else if (action === 'import') {
			importPresets(event.target);
		}
	}

	async function saveSettings(form) {
		event.preventDefault();
		try {
			const action = form.id;
			const presetName = form.elements['name'];
			const name = presetName.value.trim();
			await new Promise((resolve, reject) => {
				ui.bus.dispatchEvent(new CustomEvent('interface:settingsSave', { 
					detail: { action, name, promise: { resolve, reject } }
				}));
			});
			cancelButton.setAttribute('form', form.id);
			showToast(form.dataset.success);
		} catch (error) {
			settings.close();
			showToast(form.dataset.failure);
		}
	}

	async function cancelSettings(button) {
		toast.hidePopover();
		const messages = button.form.dataset;
		button.removeAttribute('form');
		try {
			await new Promise((resolve, reject) => {
				ui.bus.dispatchEvent(new CustomEvent('interface:settingsCancel', { 
					detail: { resolve, reject }
				}));
			});
			showToast(messages.cancelSuccess);
		} catch (error) {
			showToast(messages.cancelFailure);
		}
	}

	async function sharePresets(event) {
		const data = new FormData(event.target);
		const presetsIndex = data.getAll('index');
		if (!presetsIndex.length) {
			checkBoxMaster.setCustomValidity(checkBoxMaster.dataset.invalidEmpty);
			checkBoxMaster.reportValidity();
			event.preventDefault();
			return;
		}
		try {
			await new Promise((resolve, reject) => {
				ui.bus.dispatchEvent(new CustomEvent('interface:presetsShare', { 
					detail: { presetsIndex, promise: { resolve, reject } }
				}));
			});
		} catch (error) {
			showToast(event.target.dataset.failure);
		}
	}

	async function importPresets(form) {
		try {
			await new Promise((resolve, reject) => {
				ui.bus.dispatchEvent(new CustomEvent('interface:presetsImport', { 
					detail: { resolve, reject }
				}));
			});
			cancelButton.setAttribute('form', form.id);
			showToast(form.dataset.success);
		} catch (error) {
			showToast(form.dataset.failure);
		}
	}

	function reportNameValidity({ action, customValidity }) {
		const input = document.forms[action].elements.name;
		const datasetNames = {
			empty: 'invalidEmpty',
			duplicated: 'invalidDuplicated',
		}
		const validity = input.dataset[datasetNames[customValidity]] ?? '';
		if (validity === '') {
			settings.close();
		}
		else {
			input.setCustomValidity(validity);
			input.reportValidity();
			input.addEventListener('input', () => {
				input.setCustomValidity('');
			}, { once: true });
		}
	}

	function showToast(message) {
		cancelButton.hidden = !cancelButton.form;
		toastMessage.textContent = message;
		toast.showPopover();
	}

	return { openSettings, openShared, reportNameValidity };
}