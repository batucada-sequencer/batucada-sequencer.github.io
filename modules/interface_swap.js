export function init(ui) {

	const overTracks = [];
	const draggedClass = 'dragged';
	const dropzoneClass = 'dropzone';

	for (const track of ui.tracks) {
		track.addEventListener('dragstart', (event) => handleDragStart(ui, event));
		track.addEventListener('dragover',  (event) => handleDragOver(event));
		track.addEventListener('dragenter', (event) => handleDragEnter(event));
		track.addEventListener('dragleave', (event) => handleDragLeave(event));
		track.addEventListener('dragend',   (event) => handleDragEnd(event));
		track.addEventListener('drop',      (event) => handleDrop(ui, event));
	};

	function handleDragStart({ tracks, isDraggable }, event) {
		const track = event.currentTarget;
		if (!isDraggable(track)) {
			return event.preventDefault();
		}
		event.dataTransfer.setData('text/plain', [...tracks].indexOf(track));
		event.dataTransfer.setDragImage(event.target, 0, 15);
		event.dataTransfer.effectAllowed = 'move';
	}

	function handleDragOver(event) {
		if (event.target.className === dropzoneClass) {
			event.preventDefault();
		}
		else {
			removeTrackOver();
		}
	}

	function handleDragEnter(event) {
		if (event.target.className === dropzoneClass) {
			overTracks.push(event.currentTarget);
			event.currentTarget.classList.add(draggedClass);
		}
	}

	function handleDragLeave(event) {
		if (event.target.className === dropzoneClass) {
			removeTrackOver();
		}
	}

	function handleDragEnd(event) {
		removeTrackOver();
	}

	function handleDrop({ tracks, bus } , event) {
			if (event.target.className !== dropzoneClass) return;
			removeTrackOver();
			const sourceIndex = Number(event.dataTransfer.getData('text'));
			const targetTrack = event.currentTarget;
			const targetIndex = [...tracks].indexOf(targetTrack);
			if (targetIndex !== sourceIndex && targetIndex !== sourceIndex + 1) {
				const draggedTrack = tracks.item(sourceIndex);
				const oldPositions = getTracksYPositions(tracks);
				targetTrack.before(draggedTrack);
				const newPositions =  getTracksYPositions(tracks);
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
				bus.dispatchEvent(new CustomEvent('interface:swapTracks', { detail: { sourceIndex, targetIndex } }));
			}
		}

	function removeTrackOver() {
		while (overTracks.length) {
			overTracks.pop().classList.remove(draggedClass);
		}
	}

	function getTracksYPositions(tracks) {
		return new Map(
			Array.from(tracks).map(track => [track, track.getBoundingClientRect().top])
		);
	}

}

