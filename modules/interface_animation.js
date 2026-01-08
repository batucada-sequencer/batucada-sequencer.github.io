export default class InterfaceAnimation {
	#ui;
	#queueLimit;
	#frameId        = null;
	#currentClass   = 'current';
	#animationQueue = new Map();

	constructor({ parent }) {
		this.#ui = parent;
		this.#queueLimit = this.#ui.subdivision * 2;
	}

	setAnimations({ animations }) {
		//Supprime les pistes qui ne sont plus actives
		for (const [trackIndex, steps] of this.#animationQueue.entries()) {
			if (!animations.has(trackIndex)) {
				steps[0]?.step?.classList.remove(this.#currentClass);
				this.#animationQueue.delete(trackIndex);
			}
		}

		//Ajout des animations à la pile animationQueue
		for (const [trackIndex, items] of animations) {
			let steps = this.#animationQueue.get(trackIndex);
			// step fictif pour gérer la première animation
			if (!steps) {
				steps = [{ step: null, time: 0 }];
				this.#animationQueue.set(trackIndex, steps);
			}
			for (const { barIndex, stepIndex, time } of items) {
				const step = this.#ui.getStepFromIndexes({ trackIndex, barIndex, stepIndex });
				steps.push({ step, time });
			}
			//Évite l'accumulation d'animations non exécutées (onglet inactif, latence)
			if (steps.length > this.#queueLimit) {
				steps.splice(1, steps.length - this.#queueLimit);
			}
		}
		this.#startLoop();
	}

	#startLoop() {
		if (!this.#frameId) {
			this.#frameId = requestAnimationFrame(this.#loop);
		}
	}

	#loop = () => {
		if (this.#animationQueue.size === 0) {
			this.#frameId = null;
			return;
		}
		const now = performance.now();
		for (const steps of this.#animationQueue.values()) {
			if (steps.length < 2) continue;
			let nextIndex = 0;
			for (let i = steps.length - 1; i >= 1; i--) {
				if (now >= steps[i].time) {
					nextIndex = i;
					break;
				}
			}
			if (nextIndex === 0) continue;
			steps[0]?.step?.classList.remove(this.#currentClass);
			steps[nextIndex]?.step?.classList.add(this.#currentClass);
			steps.splice(0, nextIndex);
		}
		this.#frameId = requestAnimationFrame(this.#loop);
	};

	get isRunning() {
		return !!this.#frameId;
	}
}
