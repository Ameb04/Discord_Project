import type { ReactNode } from "react";
import { Check } from "lucide-react";
import { Link } from "react-router-dom";

import { AnimatedContent } from "@/components/motion/AnimatedContent";
import { AnimatedListItem } from "@/components/motion/AnimatedList";
import { BlurText } from "@/components/motion/BlurText";
import { BrandMark } from "../BrandMark";

interface AuthShellProps {
  children: ReactNode;
  visualTitle: string;
  visualText: string;
  visualBullets: string[];
}

export function AuthShell({
  children,
  visualTitle,
  visualText,
  visualBullets,
}: AuthShellProps) {
  return (
    <div className="grid h-dvh grid-cols-1 overflow-hidden lg:grid-cols-2">
      {/* Form column */}
      <section className="flex h-full min-h-0 flex-col overflow-y-auto px-6 py-6 sm:px-10">
        <header className="flex items-center justify-between">
          <Link to="/" aria-label="Go to home">
            <BrandMark />
          </Link>
        </header>

        <div className="flex min-h-0 flex-1 items-center justify-center py-6">
          <AnimatedContent direction="up" distance={20} className="w-full max-w-md">
            {children}
          </AnimatedContent>
        </div>
      </section>

      {/* Decorative brand column */}
      <aside className="relative hidden overflow-hidden border-l border-border lg:block">
        <div className="bg-brand-gradient absolute inset-0 opacity-[0.14]" aria-hidden="true" />
        <div
          className="absolute -right-24 top-1/4 size-96 rounded-full bg-primary/25 blur-3xl"
          aria-hidden="true"
        />
        <div
          className="absolute -left-16 bottom-0 size-80 rounded-full bg-sky-500/15 blur-3xl"
          aria-hidden="true"
        />

        <div className="relative flex h-full flex-col justify-center px-14">
          <div className="max-w-md">
            <span className="inline-flex items-center gap-2 rounded-full border border-border bg-white/[0.04] px-3 py-1 text-xs font-medium text-muted-foreground backdrop-blur-sm">
              <span className="size-1.5 rounded-full bg-primary" />
              Real-time messaging
            </span>

            <BlurText
              as="h2"
              text={visualTitle}
              delay={0.15}
              className="mt-6 block text-4xl font-semibold leading-tight tracking-tight text-foreground"
            />
            <AnimatedContent direction="up" delay={0.35}>
              <p className="mt-4 text-base leading-7 text-muted-foreground">
                {visualText}
              </p>
            </AnimatedContent>

            <ul className="mt-9 space-y-3">
              {visualBullets.map((item, index) => (
                <AnimatedListItem
                  key={item}
                  index={index}
                  className="flex items-center gap-3 rounded-2xl border border-border bg-white/[0.03] px-4 py-3 text-sm text-foreground/85 backdrop-blur-sm"
                >
                  <span className="bg-brand-gradient grid size-6 shrink-0 place-items-center rounded-lg">
                    <Check className="size-3.5 text-white" />
                  </span>
                  {item}
                </AnimatedListItem>
              ))}
            </ul>
          </div>
        </div>
      </aside>
    </div>
  );
}
