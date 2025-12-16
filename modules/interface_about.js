export function init(ui) {

	const about = document.querySelector('#about');
	const contact = document.querySelector('#contact');
	const dataDate = document.querySelector('#dataDate');
	const aboutButton = document.querySelector('footer button');
	const updateButton = document.querySelector('#update');
	const applicationVersion = document.querySelector('#applicationVersion');
	const instrumentsVersion = document.querySelector('#instrumentsVersion');

	aboutButton.addEventListener('click', openAbout);
	updateButton.addEventListener('click', update);

	contact.href = `mailto:${ui.email}`;
	contact.textContent = ui.email;

	function showUpdateButton() {
		updateButton.hidden = false;
	}

	function update() {
		about.close();
		document.body.inert = true;
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