import type { ReactNode } from "react";
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
    <div className="min-h-screen bg-[#090909] text-white">
      <div className="mx-auto grid min-h-screen w-full max-w-7xl lg:grid-cols-[1.2fr_0.8fr]">
        <section className="relative flex min-h-screen flex-col px-6 py-6 sm:px-8 lg:px-12">
          <div className="absolute left-6 top-6 sm:left-8 sm:top-8">
            <BrandMark />
          </div>

          <div className="flex flex-1 items-center justify-center pt-20 lg:pt-0">
            <div className="w-full max-w-md">{children}</div>
          </div>
        </section>

        <aside className="hidden border-l border-white/10 bg-[radial-gradient(circle_at_top,_rgba(255,255,255,0.12),_transparent_42%),linear-gradient(180deg,#151515_0%,#090909_100%)] lg:block">
          <div className="flex h-full items-center justify-center p-10">
            <div className="w-full max-w-md rounded-[2rem] border border-white/10 bg-white/[0.03] p-6 shadow-2xl shadow-black/40 backdrop-blur-sm">
              <div className="mb-6 rounded-[1.6rem] border border-white/10 bg-[linear-gradient(135deg,rgba(255,255,255,0.16),rgba(255,255,255,0.03))] p-6">
                <div className="flex h-[22rem] items-center justify-center rounded-[1.25rem] border border-white/10 bg-black/25">
                  <div className="relative h-40 w-40">
                    <div className="absolute inset-0 rounded-full border border-white/15" />
                    <div className="absolute left-3 top-10 h-16 w-16 rounded-full bg-white/90 opacity-90" />
                    <div className="absolute right-0 top-8 h-24 w-24 rounded-full border border-white/20 bg-white/5" />
                    <div className="absolute bottom-4 left-11 h-10 w-24 rounded-full bg-white/75 opacity-85" />
                    <div className="absolute bottom-10 right-2 h-6 w-6 rounded-full bg-white/70" />
                  </div>
                </div>
              </div>

              <h2 className="text-2xl font-semibold tracking-tight text-white">{visualTitle}</h2>
              <p className="mt-3 text-sm leading-7 text-white/60">{visualText}</p>

              <div className="mt-8 space-y-3">
                {visualBullets.map((item) => (
                  <div
                    key={item}
                    className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-white/80"
                  >
                    {item}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}