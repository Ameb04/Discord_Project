import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { X } from "lucide-react";
import { useEffect, useId, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { overlayTransition } from "@/components/motion/transitions";

type DialogProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  /** Icon shown beside the title. */
  icon?: ReactNode;
  children: ReactNode;
  /** Pinned to the bottom of the dialog, outside the scroll area. */
  footer?: ReactNode;
  className?: string;
};

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Currently-open dialogs, innermost last.
 *
 * Every dialog listens on `document`, and listeners on the same node fire in
 * registration order regardless of `stopPropagation` — so without this an
 * Escape meant for a confirmation layered over a panel would close the panel
 * underneath it too. Only the top of the stack reacts to keys.
 */
const openDialogStack: symbol[] = [];

/**
 * Modal dialog: portalled, focus-trapped, and animated with `motion`.
 *
 * Built here rather than pulled in as another dependency — the app already owns
 * its overlay styling, and the behaviour a dialog actually needs (escape to
 * close, focus trapped inside, body scroll locked, focus returned on close) is
 * a few dozen lines.
 *
 * On small screens it becomes a bottom sheet: a centred box tall enough to hold
 * a calendar has nowhere to go on a phone, but a sheet can simply scroll.
 */
function Dialog({
  open,
  onClose,
  title,
  description,
  icon,
  children,
  footer,
  className,
}: DialogProps) {
  const prefersReducedMotion = useReducedMotion();
  const panelRef = useRef<HTMLDivElement | null>(null);
  const titleId = useId();
  const descriptionId = useId();

  // Lock body scroll for as long as the dialog is up, and hand focus back to
  // whatever opened it on the way out.
  useEffect(() => {
    if (!open) return;

    const previouslyFocused = document.activeElement as HTMLElement | null;
    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";

    const focusTimer = window.setTimeout(() => {
      const panel = panelRef.current;
      if (!panel) return;
      // Prefer the first real control; fall back to the panel itself so focus
      // never escapes to the page behind the overlay.
      const firstControl = panel.querySelector<HTMLElement>(FOCUSABLE);
      (firstControl ?? panel).focus();
    }, 0);

    return () => {
      window.clearTimeout(focusTimer);
      document.body.style.overflow = overflow;
      previouslyFocused?.focus?.();
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;

    const dialogId = Symbol("dialog");
    openDialogStack.push(dialogId);

    function handleKeyDown(event: KeyboardEvent) {
      // Let the innermost open dialog have the keyboard to itself.
      if (openDialogStack[openDialogStack.length - 1] !== dialogId) return;

      if (event.key === "Escape") {
        event.stopPropagation();
        onClose();
        return;
      }
      if (event.key !== "Tab") return;

      const panel = panelRef.current;
      if (!panel) return;
      const focusable = Array.from(
        panel.querySelectorAll<HTMLElement>(FOCUSABLE)
      ).filter((node) => node.offsetParent !== null);
      if (focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;

      if (event.shiftKey && (active === first || !panel.contains(active))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown, true);
    return () => {
      document.removeEventListener("keydown", handleKeyDown, true);
      const index = openDialogStack.indexOf(dialogId);
      if (index >= 0) openDialogStack.splice(index, 1);
    };
  }, [onClose, open]);

  const panelMotion = prefersReducedMotion
    ? {}
    : {
        initial: { opacity: 0, y: 24, scale: 0.97 },
        animate: { opacity: 1, y: 0, scale: 1 },
        exit: { opacity: 0, y: 16, scale: 0.98 },
        transition: overlayTransition,
      };

  return createPortal(
    <AnimatePresence>
      {open ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
          <motion.div
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            aria-hidden="true"
            onClick={onClose}
            initial={prefersReducedMotion ? undefined : { opacity: 0 }}
            animate={prefersReducedMotion ? undefined : { opacity: 1 }}
            exit={prefersReducedMotion ? undefined : { opacity: 0 }}
            transition={overlayTransition}
          />

          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            aria-describedby={description ? descriptionId : undefined}
            tabIndex={-1}
            className={cn(
              "relative flex max-h-[92dvh] w-full flex-col overflow-hidden border border-border bg-card shadow-2xl shadow-black/60",
              "rounded-t-3xl sm:max-w-lg sm:rounded-3xl",
              className
            )}
            {...panelMotion}
          >
            <header className="flex items-start gap-3 border-b border-border px-5 py-4">
              {icon ? (
                <span className="bg-brand-gradient mt-0.5 grid size-9 shrink-0 place-items-center rounded-xl text-white">
                  {icon}
                </span>
              ) : null}
              <div className="min-w-0 flex-1">
                <h2
                  id={titleId}
                  className="text-base font-semibold text-foreground"
                >
                  {title}
                </h2>
                {description ? (
                  <p
                    id={descriptionId}
                    className="mt-0.5 text-sm text-muted-foreground"
                  >
                    {description}
                  </p>
                ) : null}
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-8 shrink-0"
                aria-label="Close dialog"
                onClick={onClose}
              >
                <X className="size-4" aria-hidden="true" />
              </Button>
            </header>

            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4">
              {children}
            </div>

            {footer ? (
              <div className="border-t border-border bg-black/20 px-5 py-4">
                {footer}
              </div>
            ) : null}
          </motion.div>
        </div>
      ) : null}
    </AnimatePresence>,
    document.body
  );
}

export { Dialog };
