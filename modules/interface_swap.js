export default class InterfaceSwap {
	#ui;
	#bus;
	#over =          [];
	#swapClass =     'swap';
	#overClass =     'over';
	#trashClass =    'trash';
	#draggedClass =  'dragged';
	#dropzoneClass = 'dropzone';
	#trash =         document.querySelector('#trash');

	constructor({ bus, parent }) {
		this.#bus = bus;
		this.#ui = parent;

		for (const track of this.#ui.tracks) {
			track.addEventListener('dragstart', (event) => this.#handleDragStart(event));
			track.addEventListener('dragenter', (event) => this.#handleDragEnter(event));
			track.addEventListener('drop',      (event) => this.#handleDrop( event));
		};

		this.#trash.       addEventListener('dragenter', (event) => this.#handleDragEnter(event));
		this.#trash.       addEventListener('drop',      (event) => this.#handleDrop(event));
		this.#ui.container.addEventListener('dragover',  (event) => this.#handleDragOver(event));
		this.#ui.container.addEventListener('dragleave', (event) => this.#handleDragLeave(event));
		this.#ui.container.addEventListener('dragend',   (event) => this.#handleDragEnd(event));
	}

	#handleDragStart(event) {
		const track = event.currentTarget;
		track.classList.add(this.#draggedClass);
		if (this.#ui.hasInstrument(track)) {
			this.#ui.container.classList.add(this.#swapClass);
		}
		this.#ui.container.classList.add(this.#trashClass);
		event.dataTransfer.setData('text/plain', [...this.#ui.tracks].indexOf(track));
		event.dataTransfer.setDragImage(event.target, 0, 15);
		event.dataTransfer.effectAllowed = 'move';
	}

	#handleDragOver(event) {
		if (this.#isOver(event.target)) {
			event.preventDefault();
		}
		else {
			this.#removeOver();
		}
	}

	#handleDragEnter(event) {
		if (this.#isOver(event.target)) {
			this.#over.push(event.currentTarget);
			event.currentTarget.classList.add(this.#overClass);
		}
	}

	#handleDragLeave(event) {
		if (event.target.className === this.#dropzoneClass) {
			this.#removeOver();
		}
	}

	#handleDragEnd(event) {
		this.#ui.container.classList.remove(this.#swapClass, this.#trashClass);
		this.#removeOver();
	}

	#handleDrop(event) {
		this.#removeOver();
		const isTrash = event.currentTarget === this.#trash;
		const sourceIndex = Number(event.dataTransfer.getData('text'))
		const draggedTrack = this.#ui.tracks.item(sourceIndex);
		const targetTrack = isTrash ? null : event.currentTarget;
		const targetIndex = isTrash ? null : [...this.#ui.tracks].indexOf(targetTrack);
		const isLastTrack = sourceIndex === this.#ui.tracks.length - 1;
		const canSwap = this.#ui.container.classList.contains(this.#swapClass);
		// useAnimation si on déplace à la corbeille le dernière piste affichée
		const useAnimation = isTrash && (!canSwap || isLastTrack);
		const moveTrack = () => {
			if (isTrash) {
				draggedTrack.parentNode.appendChild(draggedTrack);
			}
			else {
				targetTrack.before(draggedTrack);
			}
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

	#isOver(target) {
		return this.#ui.container.classList.contains(this.#swapClass) 
			&& target.className === this.#dropzoneClass
			|| target === this.#trash;
	}

	#removeOver() {
		while (this.#over.length) {
			this.#over.pop().classList.remove(this.#overClass);
		}
	}

}

