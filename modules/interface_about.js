export function init(ui) {

	const about =  ui.container.querySelector('#about');
	const contact = ui.container.querySelector('#contact');
	const dataDate = ui.container.querySelector('#dataDate');
	const aboutButton = ui.container.querySelector('#aboutButton');
	const updateButton = ui.container.querySelector('#update');
	const applicationVersion = ui.container.querySelector('#applicationVersion');
	const instrumentsVersion = ui.container.querySelector('#instrumentsVersion');

	aboutButton.addEventListener('click', openAbout);
	updateButton.addEventListener('click', update);

	contact.href = `mailto:${ui.email}`;
	contact.textContent = ui.email;

	function showUpdateButton() {
		updateButton.hidden = false;
	}

	function update() {
		ui.container.hidden = true;
		ui.bus.dispatchEvent(new CustomEvent('interface:install'));
	}

	async function openAbout() {
		try {
			ui.bus.dispatchEvent(new CustomEvent('interface:findUpdate'));
			const lastModified = await new Promise(resolve => {
				ui.bus.dispatchEvent(new CustomEvent('interface:getPresetsDate', { detail: resolve }));
			});
			if (lastModified) {
				const date = new Date(lastModified);
				const localeOpts = { hour12: false };
				dataDate.textContent =
					`${date.toLocaleDateString('fr-FR')} ${date.toLocaleTimeString('fr-FR', localeOpts)}`;
			}
			const versions = await new Promise(resolve => {
				ui.bus.dispatchEvent(new CustomEvent('interface:getVersions', { detail: resolve }));
			});
			if (versions) {
				applicationVersion.textContent = versions.app;
				instrumentsVersion.textContent = versions.static;
				updateButton.hidden = !versions.hasUpdate;
			}
		} catch {}
		about.showModal();
		about.focus();
	}

	return { showUpdateButton };
}