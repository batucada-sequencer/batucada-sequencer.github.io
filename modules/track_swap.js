export class TrackSwap {
	#container;
	#dropzones;
	#draggedClass;
	#tracks;
	#instrument;
	#volume;
	static setDraggable;

	constructor(references) {
		this.#container = references.container;
		this.#dropzones = references.dropzones;
		this.#draggedClass = references.draggedClass;
		this.#tracks = references.tracks;
		this.#instrument = references.instruments[0];
		this.#volume = references.volumes[0];
		this.setDraggable = (event) => this.#handleChange(event.target);
	}

	init() {
		this.#container.querySelectorAll('[draggable]').forEach(item => {
			item.addEventListener('dragstart', (event) => this.#handleDragStart(event));
			item.addEventListener('dragend', () => this.#leaveAll());
		});
		[...this.#dropzones].forEach(item => {
			item.addEventListener('dragover', (event) => this.#handleDragOver(event));
			item.addEventListener('dragenter', (event) => this.#handleDragEnter(event));
			item.addEventListener('dragleave', () => this.#leaveAll());
			item.addEventListener('drop', (event) => this.#handleDrop(event));
		});
	}

	#handleChange(target) {
		if (target.name === this.#instrument.name) {
			target.closest('[draggable]').draggable = target.value !== '0';
		}
	}

	#handleDragStart(event) {
		event.dataTransfer.setData('text', this.#getIndex(event.target));
		event.dataTransfer.setDragImage(event.target, 0, 15);
		event.dataTransfer.effectAllowed = 'move';
	}

	#handleDragOver(event) {
		const sourceIndex = parseInt(event.dataTransfer.getData('text'));
		const destinationIndex = this.#getIndex(event.target);
		//if (destinationIndex !== sourceIndex && destinationIndex !== sourceIndex + 1) {
			event.preventDefault();
			event.dataTransfer.dropEffect = 'move';
		//}
	}

	#handleDragEnter(event) {
		this.#leaveAll();
		const sourceIndex = parseInt(event.dataTransfer.getData('text'));
		const destinationIndex = this.#getIndex(event.target);
		//if (destinationIndex !== sourceIndex && destinationIndex !== sourceIndex + 1) {
			this.#tracks.item(destinationIndex).classList.add(this.#draggedClass);
		//}
	}

	#handleDrop(event) {
		event.stopPropagation();
		const sourceIndex = parseInt(event.dataTransfer.getData('text'));
		const targetIndex = this.#getIndex(event.target);
		this.#leaveAll();
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
