export function init(ui) {

	const over = [];
	const swapClass = 'swap';
	const overClass = 'over';
	const trashClass = 'trash';
	const draggedClass = 'dragged';
	const dropzoneClass = 'dropzone';
	const trash = document.querySelector('#trash');

	for (const track of ui.tracks) {
		track.addEventListener('dragstart', (event) => handleDragStart(ui, event));
		track.addEventListener('dragenter', (event) => handleDragEnter(event));
		track.addEventListener('drop',      (event) => handleDrop(ui, event));
	};
	ui.container.addEventListener('dragover',  (event) => handleDragOver(event));
	ui.container.addEventListener('dragleave', (event) => handleDragLeave(event));
	ui.container.addEventListener('dragend',   (event) => handleDragEnd(event));
	trash.addEventListener('dragenter', (event) => handleDragEnter(event));
	trash.addEventListener('drop', (event) => handleDrop(ui, event));

	function handleDragStart({ tracks, isDraggable }, event) {
		const track = event.currentTarget;
		track.classList.add(draggedClass);
		if (isDraggable(track)) {
			ui.container.classList.add(swapClass);
		}
		ui.container.classList.add(trashClass);
		event.dataTransfer.setData('text/plain', [...tracks].indexOf(track));
		event.dataTransfer.setDragImage(event.target, 0, 15);
		event.dataTransfer.effectAllowed = 'move';
	}

	function handleDragOver(event) {
		const { target } = event;
		if (ui.container.classList.contains(swapClass) && target.className === dropzoneClass || target === trash) {
			event.preventDefault();
		}
		else {
			removeOver();
		}
	}

	function handleDragEnter(event) {
		const { target } = event;
		if (ui.container.classList.contains(swapClass) && target.className === dropzoneClass || target === trash) {
			over.push(event.currentTarget);
			event.currentTarget.classList.add(overClass);
		}
	}

	function handleDragLeave(event) {
		if (event.target.className === dropzoneClass) {
			removeOver();
		}
	}

	function handleDragEnd(event) {
		ui.container.classList.remove(swapClass, trashClass);
		removeOver();
	}

	function handleDrop({ tracks, bus } , event) {
		removeOver();
		const isTrash = event.currentTarget === trash;
		const sourceIndex = Number(event.dataTransfer.getData('text'))
		const draggedTrack = tracks.item(sourceIndex);
		const targetTrack = isTrash ? null : event.currentTarget;
		const targetIndex = isTrash ? null : [...tracks].indexOf(targetTrack);
		const isLastTrack = sourceIndex === tracks.length - 1;
		const canSwap = ui.container.classList.contains(swapClass);
		// useAnimation si on déplace à la corbeille le dernière piste affichée
		const useAnimation = isTrash && (!canSwap || isLastTrack);
		const moveTrack = () => {
			if (isTrash) {
				draggedTrack.parentNode.appendChild(draggedTrack);
			}
			else {
				targetTrack.before(draggedTrack);
			}
			bus.dispatchEvent(
				new CustomEvent('interface:moveTrack', { detail: { sourceIndex, targetIndex } })
			);
		};
		if (useAnimation) {
			draggedTrack.animate([{ opacity: 0 }], { duration: 200, easing: 'ease' }).finished.then(moveTrack);
		}
		else {
			document.startViewTransition(moveTrack);
		}
	}

	function removeOver() {
		while (over.length) {
			over.pop().classList.remove(overClass);
		}
	}

}

