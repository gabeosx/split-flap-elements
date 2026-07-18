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
  const minimumCadence = Math.max(16, stepDuration * 0.6);
  const maximumCadence = Math.max(minimumCadence, stepDuration * 1.4);
  const maximumCycles =
    Math.ceil(minimumDuration / (minimumCadence * reel.length)) + 2;
  let selected:
    { steps: number; stepDuration: number; totalDuration: number } | undefined;

  for (let cycles = 0; cycles <= maximumCycles; cycles += 1) {
    const steps = physicalDistance + cycles * reel.length;
    const earliest = steps * minimumCadence;
    const latest = steps * maximumCadence;
    if (latest < minimumDuration) continue;
    const totalDuration = Math.max(minimumDuration, earliest);
    if (totalDuration > latest) continue;
    const candidate = {
      steps,
      stepDuration: totalDuration / steps,
      totalDuration,
    };
    if (
      !selected ||
      candidate.totalDuration < selected.totalDuration ||
      (candidate.totalDuration === selected.totalDuration &&
        Math.abs(candidate.stepDuration - stepDuration) <
          Math.abs(selected.stepDuration - stepDuration))
    ) {
      selected = candidate;
    }
  }

  const plan = selected ?? {
    steps: physicalDistance,
    stepDuration,
    totalDuration: physicalDistance * stepDuration,
  };

  const path = Array.from({ length: plan.steps }, (_, index) => {
    const reelIndex =
      (currentIndex + direction * (index + 1) + reel.length * plan.steps) %
      reel.length;
    return reel[reelIndex]!;
  });
  return {
    path,
    stepDuration: plan.stepDuration,
    totalDuration: plan.totalDuration,
  };
}
