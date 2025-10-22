export function init(ui) {

	let frameId = null;
	const animationQueue = new Map();
	const currentClass = 'current';

	function setAnimations({ animations }) {
		//Supprime les pistes qui ne sont plus actives
		for (const [trackIndex, steps] of animationQueue.entries()) {
			if (!animations.has(trackIndex)) {
				steps[0]?.step?.classList.remove(currentClass);
				animationQueue.delete(trackIndex);
			}
		}
		//Ajout des animations à la pile animationQueue
		animations.forEach((items, trackIndex) => {
			let steps = animationQueue.get(trackIndex);
			if (!steps) {
				//step fictif pour gérer la première animation
				steps = [{ step: null }];
				animationQueue.set(trackIndex, steps);
			}
			items.forEach(({ barIndex, stepIndex, time }) => {
				const step = ui.getStepFromIndexes({ trackIndex, barIndex, stepIndex });
				steps.push({ step, time });
			});
			//Évite l'accumulation d'animations non exécutées (onglet inactif, latence)
			if (steps.length > ui.queueLimit) {
				steps.splice(1, steps.length - maxLength);
			}
		});
		if (!frameId) {
			const loop = () => {
				const now = performance.now();
				for (const steps of animationQueue.values()) {
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
					steps[0]?.step?.classList.remove(currentClass);
					steps[currentIndex].step?.classList.add(currentClass);
					steps.splice(0, currentIndex);
				}
				frameId = animationQueue.size > 0
					? requestAnimationFrame(loop)
					: null;
			};
			frameId = requestAnimationFrame(loop);
		}
	}

	function isRunning() {
		return !!frameId;
	}

	return { setAnimations, isRunning };
}