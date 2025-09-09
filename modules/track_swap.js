export class TrackSwap {
	#container;
	#draggedClass;
	#dropzoneClass;
	#tracks;
	#instrument;
	#volume;

	constructor(references) {
		this.#container = references.container;
		this.#draggedClass = references.draggedClass;
		this.#dropzoneClass = references.dropzoneClass;
		this.#tracks = references.tracks;
		this.#instrument = references.instruments[0];
		this.#volume = references.volumes[0];
		addEventListener('dragstart', (event) => this.#handleDragStart(event));
		addEventListener('dragend', (event) => this.#handleDragEnd(event));
		addEventListener('dragover', (event) => this.#handleDragOver(event));
		addEventListener('dragenter', (event) => this.#handleDragEnter(event));
		addEventListener('drop', (event) => this.#handleDrop(event));
	}

	#handleDragStart(event) {
		const index = this.#getIndex(event.target);
		if (this.#tracks[index].dataset[this.#instrument.name] === '0') {
			return event.preventDefault();
		}
		event.dataTransfer.setData('text/plain', index);
		event.dataTransfer.setDragImage(event.target, 0, 15);
		event.dataTransfer.effectAllowed = 'move';
	}

	#handleDragEnd(event) {
		this.#leaveAll();
	}

	#handleDragEnter(event) {
		if (event.target.className == this.#dropzoneClass) {
			this.#tracks.item(this.#getIndex(event.target)).classList.add(this.#draggedClass);
		}
		else {
			this.#leaveAll();
		}
	}

	#handleDragOver(event) {
		if (event.target.className === this.#dropzoneClass) {
			event.preventDefault();
		}
	}

	#handleDrop(event) {
		if (event.target.className !== this.#dropzoneClass) return;
		const sourceIndex = parseInt(event.dataTransfer.getData('text'));
		const targetIndex = this.#getIndex(event.target);
		if (targetIndex !== sourceIndex && targetIndex !== sourceIndex + 1) {
			const draggedTrack = this.#tracks.item(sourceIndex);
			const targetTrack = this.#tracks.item(targetIndex);
			const oldPositions = this.#getYPositions();
			targetTrack.before(draggedTrack);
			const newPositions =  this.#getYPositions();
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
			this.#volume.dispatchEvent(new Event('change', { bubbles: true }));
			this.#instrument.dispatchEvent(new Event('change', { bubbles: true }));
		}
	}

	#getIndex(element) {
		return [...this.#tracks].findIndex(track => track.contains(element));
	}

	#getYPositions() {
		return new Map(
			Array.from(this.#tracks).map(track => [track, track.getBoundingClientRect().top])
		);
	}

	#leaveAll() {
		[...this.#tracks].forEach(track => track.classList.remove(this.#draggedClass));
	}
}
