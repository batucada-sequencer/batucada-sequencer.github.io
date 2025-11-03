export function init(ui) {

	const over = [];
	const swapClass = 'swap';
	const overClass = 'over';
	const trashClass = 'trash';
	const dropzoneClass = 'dropzone';
	const trash = ui.container.querySelector('#trash');

	for (const track of ui.tracks) {
		track.addEventListener('dragstart', (event) => handleDragStart(ui, event));
		track.addEventListener('dragenter', (event) => handleDragEnter(event));
		track.addEventListener('drop',      (event) => handleDrop(ui, event));
	};
	ui.container.addEventListener('dragover',  (event) => handleDragOver(event));
	ui.container.addEventListener('dragleave', (event) => handleDragLeave(event));
	ui.container.addEventListener('dragend',   (event) => handleDragEnd(event));
	trash.addEventListener('dragenter', (event) => handleDragEnter(event));
	trash.addEventListener('drop', (event) => handleDropToTrash(ui, event));

	function handleDragStart({ tracks, isDraggable }, event) {
		const track = event.currentTarget;
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

	function handleDropToTrash({ tracks, bus } , event) {
		removeOver();
		const index = Number(event.dataTransfer.getData('text'))
		const track = tracks.item(index);
		let animation;
		if (!ui.container.classList.contains(swapClass) || index === tracks.length) {
			animation = track.animate([{ opacity: .5 }], { duration: 100, easing: 'ease' });
		}
		else {
			animation = track.animate([
				{ opacity: 0, height: `${track.offsetHeight}px`, offset: .05 },
				{ opacity: 0, height: '0px', offset: 1 }
			], { duration: 300, easing: 'ease' });
		}
		animation.finished.then(() => {
			track.parentNode.appendChild(track);
			bus.dispatchEvent(new CustomEvent('interface:removeTrack', { detail: index }));
		});
	}

	function handleDrop({ tracks, bus } , event) {
		if (event.target.className !== dropzoneClass) return;
		removeOver();
		const sourceIndex = Number(event.dataTransfer.getData('text'));
		const targetTrack = event.currentTarget;
		const targetIndex = [...tracks].indexOf(targetTrack);
		if (targetIndex !== sourceIndex && targetIndex !== sourceIndex + 1) {
			const draggedTrack = tracks.item(sourceIndex);
			const oldPositions = getTracksYPositions(tracks);
			targetTrack.before(draggedTrack);
			const newPositions =  getTracksYPositions(tracks);
			newPositions.forEach((newPosition, track) => {
				const oldPosition = oldPositions.get(track);
				const deltaY = oldPosition - newPosition;
				if (track === draggedTrack) {
					const clipFrom = deltaY > 0 ? 'inset(0 0 50% 0)' : 'inset(90% 0 0 0)';
					track.animate([
						{ clipPath: clipFrom },
						{ clipPath: 'inset(-1em)' }
					], { duration: 500, easing: 'ease' });
				}
				else {
					if (deltaY !== 0) {
						track.animate([
							{ transform: `translateY(${deltaY}px)` },
							{ transform: 'translateY(0)' }
						], { duration: 300, easing: 'ease' });
					}
				}
			});
			bus.dispatchEvent(new CustomEvent('interface:swapTracks', { detail: { sourceIndex, targetIndex } }));
		}
	}

	function removeOver() {
		while (over.length) {
			over.pop().classList.remove(overClass);
		}
	}

	function getTracksYPositions(tracks) {
		return new Map(
			Array.from(tracks).map(track => [track, track.getBoundingClientRect().top])
		);
	}

}

