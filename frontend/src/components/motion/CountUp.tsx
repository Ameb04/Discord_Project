import { useMotionValue, useSpring, useReducedMotion } from "motion/react";
import { useEffect, useState } from "react";

type CountUpProps = {
  value: number;
  className?: string;
};

/**
 * A number that springs to its new value instead of snapping.
 *
 * Used on the small counters that change while the user is looking at them
 * (unread tallies, result counts) so a change registers without a flash. The
 * rendered text is always a whole number — a counter mid-tween showing "3.7"
 * would read as a bug.
 */
function CountUp({ value, className }: CountUpProps) {
  const prefersReducedMotion = useReducedMotion();
  const target = useMotionValue(value);
  const spring = useSpring(target, { stiffness: 180, damping: 24, mass: 0.5 });
  const [springValue, setSpringValue] = useState(value);

  useEffect(() => {
    target.set(value);
  }, [target, value]);

  useEffect(
    () => spring.on("change", (latest) => setSpringValue(Math.round(latest))),
    [spring]
  );

  // The tween is a presentation detail; the real value is what assistive tech
  // and a reduced-motion viewer get, with no intermediate frames.
  const displayed = prefersReducedMotion ? value : springValue;

  return (
    <span className={className} aria-label={String(value)}>
      <span aria-hidden="true">{displayed}</span>
    </span>
  );
}

export { CountUp };
