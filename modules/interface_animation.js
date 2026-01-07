export default class InterfaceAnimation {
	#ui;
	#frameId        = null;
	#currentClass   = 'current';
	#animationQueue = new Map();

	constructor({ parent }) {
		this.#ui = parent;
	}

	setAnimations({ animations }) {
		const queueLimit = this.#ui.subdivision * 2;
		//Supprime les pistes qui ne sont plus actives
		for (const [trackIndex, steps] of this.#animationQueue.entries()) {
			if (!animations.has(trackIndex)) {
				steps[0]?.step?.classList.remove(this.#currentClass);
				this.#animationQueue.delete(trackIndex);
			}
		}
		//Ajout des animations à la pile animationQueue
		animations.forEach((items, trackIndex) => {
			let steps = this.#animationQueue.get(trackIndex);
			if (!steps) {
				//step fictif pour gérer la première animation
				steps = [{ step: null }];
				this.#animationQueue.set(trackIndex, steps);
			}
			items.forEach(({ barIndex, stepIndex, time }) => {
				const step = this.#ui.getStepFromIndexes({ trackIndex, barIndex, stepIndex });
				steps.push({ step, time });
			});
			//Évite l'accumulation d'animations non exécutées (onglet inactif, latence)
			if (steps.length > queueLimit) {
				steps.splice(1, steps.length - queueLimit);
			}
		});
		if (!this.#frameId) {
			const loop = () => {
				const now = performance.now();
				for (const steps of this.#animationQueue.values()) {
					if (steps.length < 2) continue;
					let currentIndex = 0;
					for (let i = 1; i < steps.length; i++) {
						if (now >= steps[i].time) {
							currentIndex = i;
						} else {
							break;
						}
					}
					if (currentIndex === 0) continue;
					steps[0]?.step?.classList.remove(this.#currentClass);
					steps[currentIndex].step?.classList.add(this.#currentClass);
					steps.splice(0, currentIndex);
				}
				this.#frameId = this.#animationQueue.size > 0
					? requestAnimationFrame(loop)
					: null;
			};
			this.#frameId = requestAnimationFrame(loop);
		}
	}

	get isRunning() {
		return !!this.#frameId;
	}

}