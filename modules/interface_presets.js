export function init(ui) {

	let checkBoxShare;
	const share = ui.container.querySelector('#share');
	const shared = ui.container.querySelector('#shared');
	const shareList = ui.container.querySelector('#share ul');
	const sharedList = ui.container.querySelector('#shared ul');
	const shareButton = ui.container.querySelector('#share button[name="share"]');
	const checkBoxMaster = ui.container.querySelector('#legend input');
	const checkBoxCurrent = ui.container.querySelector('#share input[name="current"]');
	const settings = ui.container.querySelector('#settings');
	const settingsButton = ui.container.querySelector('#combo_presets button');
	const presetName = ui.container.querySelector('#preset');
	const toast = ui.container.querySelector('#toast');
	const toastMessage = ui.container.querySelector('#toast p');
	const cancelButton = ui.container.querySelector('#toast button');

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
		ui.bus.dispatchEvent(new CustomEvent('interface:presetSelected', { detail: { name, value } }));
	}

	function loadClickedPreset(event) {
		const url = event.target.href;
		if (!url) return;
		event.preventDefault();
		shared.close();
		iu.bus.dispatchEvent(new CustomEvent('interface:presetClicked', { detail: url }));
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
		const hasStroke = ui.hasStroke();
		const { items, checkedBox, checkBoxList } = Array.from(ui.presetsSelection.options).reduce(
			(data, option, index) => {
				const name = option.text;
				// Conserve uniquement les morceaux avec un nom
				if (option.disabled || name === ui.untitled) return data;
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
				data.checkBoxList.push(checkBox);
				if (checked) data.checkedBox = checkBox;
				return data;
			},
			{ items: [], checkedBox: null, checkBoxList: [] }
		);
		if (!items.length) {
			const li = document.createElement('li');
			li.textContent = 'Aucun morceau';
			items.push(li);
		}
		shareList.replaceChildren(...items);
		checkBoxShare = checkBoxList;
		checkBoxMaster.checked = items.length === 1 && checkedBox;
		checkBoxMaster.disabled = items.length === 0;
		checkBoxCurrent.disabled = !!checkedBox || !hasStroke;
		checkBoxCurrent.checked = !checkBoxCurrent.disabled;
		shareButton.disabled = !hasStroke;
		share.showModal();
		if (checkedBox) {
			checkedBox.scrollIntoView({ behavior: 'instant', block: 'center' });
		}
	}

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

	function checkValues(event) {
		if (event.target === checkBoxMaster) {
			checkBoxShare.forEach(checkbox => checkbox.checked = checkBoxMaster.checked);
		}
		const checkedCount =checkBoxShare.filter(checkbox => checkbox.checked).length;
		checkBoxMaster.checked = checkedCount > 0 && checkedCount === checkBoxShare.length;
		shareButton.disabled = checkedCount === 0 && !checkBoxCurrent.checked;
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
			sharePresets(event.target);
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

	async function sharePresets(form) {
		const data = new FormData(form);
		const presetsIndex = data.getAll('index');
		const hasCurrent = checkBoxCurrent.checked;
		try {
			await new Promise((resolve, reject) => {
				ui.bus.dispatchEvent(new CustomEvent('interface:presetsShare', { 
					detail: { presetsIndex, hasCurrent, promise: { resolve, reject } }
				}));
			});
		} catch (error) {
			showToast(form.dataset.failure);
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
		if (customValidity === '') {
			settings.close();
		}
		else {
			input.setCustomValidity(customValidity);
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