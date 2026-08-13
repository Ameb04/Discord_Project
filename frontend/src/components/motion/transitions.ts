/**
 * Shared motion vocabulary.
 *
 * Every animated surface in the app pulls its easing and duration from here, so
 * a reveal in the sidebar reads as the same gesture as a reveal in a dialog.
 * Keep the list short — the point is a house style, not a palette of options.
 */

import type { Transition } from "motion/react";

/** Standard ease-out curve; the default for anything entering the screen. */
export const EASE_OUT = [0.22, 1, 0.36, 1] as const;

/** Content arriving: long enough to read as deliberate, short enough to ignore. */
export const enterTransition: Transition = {
  duration: 0.45,
  ease: EASE_OUT,
};

/** Overlays and popovers: snappier, because they answer a direct click. */
export const overlayTransition: Transition = {
  duration: 0.22,
  ease: EASE_OUT,
};

/** Springy motion for things that track a pointer or a live value. */
export const springTransition: Transition = {
  type: "spring",
  stiffness: 260,
  damping: 26,
  mass: 0.6,
};

/** Gap between successive children in a staggered reveal. */
export const STAGGER_SECONDS = 0.055;

/** Cap the stagger so a long list never leaves the last row waiting. */
export const MAX_STAGGER_INDEX = 12;

export function staggerDelay(index: number, step = STAGGER_SECONDS) {
  return Math.min(index, MAX_STAGGER_INDEX) * step;
}
