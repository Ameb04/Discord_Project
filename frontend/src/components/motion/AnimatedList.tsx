import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import type { ReactNode } from "react";

import { enterTransition, staggerDelay } from "./transitions";

type AnimatedListItemProps = {
  children: ReactNode;
  /** Position in the list; drives the stagger. */
  index?: number;
  className?: string;
  /**
   * Slide the row to its new slot when the list reorders.
   *
   * Off by default, and `"position"` rather than `true` when on. A full layout
   * animation interpolates the row's *size*, which motion implements by
   * scaling the element — a card mid-animation renders wider than the box it
   * lives in, its border and radius stretched, until it settles. Position-only
   * animation moves the row without ever touching its measured size.
   */
  reorder?: boolean;
};

/**
 * One row of a staggered list.
 *
 * Rendered as `<li>` because every list in this app is a real `<ul>` — dropping
 * a `<div>` between them would break the list semantics screen readers rely on.
 * Wrap the group in `<AnimatedListPresence>` when rows can be removed, so the
 * exit animation has somewhere to run.
 */
function AnimatedListItem({
  children,
  index = 0,
  className,
  reorder = false,
}: AnimatedListItemProps) {
  const prefersReducedMotion = useReducedMotion();

  if (prefersReducedMotion) {
    return <li className={className}>{children}</li>;
  }

  return (
    <motion.li
      {...(reorder ? { layout: "position" as const } : {})}
      className={className}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ ...enterTransition, delay: staggerDelay(index) }}
    >
      {children}
    </motion.li>
  );
}

/**
 * Presence boundary for a list whose rows can disappear.
 *
 * `sync` rather than `popLayout`: popping a row out of flow only pays for
 * itself when the survivors animate into the gap, and that needs `reorder` on
 * the rows. Without it, `popLayout` just yanks the leaving row to
 * `position: absolute`, which makes it overlap whatever slid up underneath.
 * Pass `reorder` to opt a list into the full effect.
 */
function AnimatedListPresence({
  children,
  reorder = false,
}: {
  children: ReactNode;
  reorder?: boolean;
}) {
  return (
    <AnimatePresence mode={reorder ? "popLayout" : "sync"}>
      {children}
    </AnimatePresence>
  );
}

export { AnimatedListItem, AnimatedListPresence };
