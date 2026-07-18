import type { IntermediateOrder } from "./types.js";

export const DEFAULT_FLIP_DURATION = 140;
export const DEFAULT_SPIN_DURATION = 1400;
export const DEFAULT_STAGGER = 120;

export interface SpinPlan {
  path: string[];
  stepDuration: number;
  totalDuration: number;
}

export function planSpin(
  reel: readonly string[],
  current: string,
  target: string,
  order: IntermediateOrder,
  minimumDuration: number,
  requestedStepDuration: number,
  random: () => number = Math.random,
): SpinPlan {
  const stepDuration = Math.max(16, requestedStepDuration);
  const minimumSteps =
    minimumDuration === 0
      ? 0
      : Math.max(1, Math.ceil(minimumDuration / stepDuration));

  if (minimumSteps === 0 || reel.length === 0) {
    return { path: [], stepDuration, totalDuration: 0 };
  }

  if (order === "random") {
    const path: string[] = [];
    let previous = current;
    for (let index = 0; index < minimumSteps - 1; index += 1) {
      const choices = reel.filter(
        (value) => value !== previous && value !== target,
      );
      const fallback = reel.filter((value) => value !== previous);
      const available = choices.length > 0 ? choices : fallback;
      const next = available[Math.floor(random() * available.length)] ?? target;
      path.push(next);
      previous = next;
    }
    path.push(target);
    return {
      path,
      stepDuration,
      totalDuration: path.length * stepDuration,
    };
  }

  const direction = order === "reverse" ? -1 : 1;
  const currentIndex = Math.max(0, reel.indexOf(current));
  const targetIndex = reel.indexOf(target);
  const distance =
    direction === 1
      ? (targetIndex - currentIndex + reel.length) % reel.length
      : (currentIndex - targetIndex + reel.length) % reel.length;
  const physicalDistance = distance === 0 ? reel.length : distance;
  const steps = Math.max(physicalDistance, minimumSteps);

  const path = Array.from({ length: steps }, (_, index) => {
    const reelIndex =
      (targetIndex - direction * (steps - index - 1) + reel.length * steps) %
      reel.length;
    return reel[reelIndex]!;
  });
  return {
    path,
    stepDuration,
    totalDuration: path.length * stepDuration,
  };
}
