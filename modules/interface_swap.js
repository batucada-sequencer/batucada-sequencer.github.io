export default class InterfaceSwap {
	#ui;
	#bus;
	#over          = new Set();
	#swapClass     = 'swap';
	#overClass     = 'over';
	#trashClass    = 'trash';
	#draggedClass  = 'dragged';
	#dropzoneClass = 'dropzone';
	#trash         = document.querySelector('#trash');

	constructor({ bus, parent }) {
		this.#bus = bus;
		this.#ui = parent;

		this.#ui.container.addEventListener('dragstart', (event) => this.#handleDragStart(event));
		this.#ui.container.addEventListener('dragenter', (event) => this.#handleDragEnter(event));
		this.#ui.container.addEventListener('dragover',  (event) => this.#handleDragOver(event));
		this.#ui.container.addEventListener('dragleave', (event) => this.#handleDragLeave(event));
		this.#ui.container.addEventListener('dragend',   (event) => this.#handleDragEnd(event));
		this.#ui.container.addEventListener('drop',      (event) => this.#handleDrop(event));
	}

	#handleDragStart(event) {
		const { track } = this.#ui.getTrackData(event.target);
		if (!track) return;
		track.classList.add(this.#draggedClass);
		if (this.#ui.hasInstrument(track)) {
			this.#ui.container.classList.add(this.#swapClass);
		}
		this.#ui.container.classList.add(this.#trashClass);
		event.dataTransfer.setData('text/plain', track.dataset.index);
		event.dataTransfer.setDragImage(event.target, 0, 15);
		event.dataTransfer.effectAllowed = 'move';
	}

	#handleDragOver(event) {
		if (this.#isDropZone(event.target)) {
			event.preventDefault();
		}
	}

	#handleDragEnter(event) {
		this.#removeOver();
		if (!this.#isDropZone(event.target)) return;
		const target =
			event.target.closest(`#${this.#trash.id}`) ||
			this.#ui.getTrackData(event.target).track;
		if (!target || this.#over.has(target)) return;
		this.#over.add(target);
		target.classList.add(this.#overClass);
	}


	#handleDragLeave(event) {
		if (this.#isDropZone(event.target)) {
			this.#removeOver();
		}
	}

	#handleDragEnd(event) {
		this.#ui.container.classList.remove(this.#swapClass, this.#trashClass);
		this.#removeOver();
	}

	#handleDrop(event) {
		this.#removeOver();
		const { track: targetTrack, trackIndex: targetIndex } = this.#ui.getTrackData(event.target);
		const sourceIndex = Number(event.dataTransfer.getData('text/plain'));
		const draggedTrack = this.#ui.tracks.item(sourceIndex);
		const isLastTrack = sourceIndex === this.#ui.tracks.length - 1 || !this.#ui.hasInstrument(draggedTrack);
		// useAnimation si on déplace à la corbeille le dernière piste affichée
		const useAnimation = !targetTrack && isLastTrack;
		const moveTrack = () => {
			if (!targetTrack) {
				draggedTrack.parentNode.appendChild(draggedTrack);
			}
			else {
				targetTrack.before(draggedTrack);
			}
			Array.from(this.#ui.tracks).forEach((track, index) => {
				track.dataset.index = index;
			});
			this.#bus.dispatchEvent(
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

	#isDropZone(target) {
		return this.#ui.container.classList.contains(this.#swapClass) 
			&& target.className === this.#dropzoneClass
			|| target === this.#trash;
	}

	#removeOver() {
		for (const target of this.#over) {
			target.classList.remove(this.#overClass);
		}
		this.#over.clear();
	}
}

