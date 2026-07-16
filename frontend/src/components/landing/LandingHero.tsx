import { ArrowRight, Paperclip, Send, Sparkles, Zap } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { BrandMark } from "../BrandMark";

function ChatPreview() {
  return (
    <div className="relative w-full max-w-md">
      <div
        className="absolute -inset-6 -z-10 bg-primary/25 blur-3xl"
        aria-hidden="true"
      />
      <div className="overflow-hidden rounded-3xl border border-border bg-card/70 shadow-2xl shadow-black/50 backdrop-blur-xl">
        {/* window header */}
        <div className="flex items-center gap-3 border-b border-border px-5 py-4">
          <span className="bg-brand-gradient grid size-9 place-items-center rounded-full text-sm font-semibold text-white">
            A
          </span>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground">Ava Mirzaei</p>
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span className="size-1.5 rounded-full bg-emerald-400" /> Online
            </p>
          </div>
        </div>

        {/* messages */}
        <div className="space-y-3 px-5 py-5">
          <div className="max-w-[80%] rounded-2xl rounded-tl-sm border border-border bg-white/[0.04] px-4 py-2.5 text-sm text-foreground/85">
            Hey! Did you get the project files?
          </div>
          <div className="bg-brand-gradient ml-auto max-w-[80%] rounded-2xl rounded-tr-sm px-4 py-2.5 text-sm text-white shadow-lg shadow-primary/30">
            Just opened them — looks great 🔥
          </div>
          <div className="max-w-[80%] rounded-2xl rounded-tl-sm border border-border bg-white/[0.04] px-4 py-2.5 text-sm text-foreground/85">
            Sending the final deck now.
          </div>
        </div>

        {/* composer */}
        <div className="flex items-center gap-2 border-t border-border px-4 py-3">
          <span className="grid size-9 place-items-center rounded-xl border border-border text-muted-foreground">
            <Paperclip className="size-4" />
          </span>
          <div className="h-9 flex-1 rounded-xl border border-border bg-white/[0.04]" />
          <span className="bg-brand-gradient grid size-9 place-items-center rounded-xl text-white">
            <Send className="size-4" />
          </span>
        </div>
      </div>
    </div>
  );
}

export function LandingHero() {
  return (
    <div className="min-h-dvh">
      <div className="mx-auto flex min-h-dvh w-full max-w-6xl flex-col px-5 py-6 sm:px-8">
        <header className="flex items-center justify-between">
          <BrandMark />
          <div className="flex items-center gap-2 sm:gap-3">
            <Button asChild variant="ghost">
              <Link to="/login">Login</Link>
            </Button>
            <Button asChild>
              <Link to="/signup">Sign up</Link>
            </Button>
          </div>
        </header>

        <main className="grid flex-1 items-center gap-14 py-12 lg:grid-cols-2 lg:py-0">
          <section className="max-w-2xl">
            <span className="inline-flex items-center gap-2 rounded-full border border-border bg-white/[0.04] px-3 py-1 text-xs font-medium text-muted-foreground backdrop-blur-sm">
              <Sparkles className="size-3.5 text-primary" />
              Real-time chat, beautifully simple
            </span>

            <h1 className="mt-6 text-4xl font-semibold leading-[1.05] tracking-tight text-foreground sm:text-6xl">
              Where your{" "}
              <span className="text-brand-gradient">conversations</span> come
              together.
            </h1>

            <p className="mt-6 max-w-xl text-base leading-8 text-muted-foreground">
              Direct messaging, media sharing, and a calm, focused interface —
              wrapped in a modern dark experience built for speed.
            </p>

            <div className="mt-9 flex flex-col gap-3 sm:flex-row">
              <Button asChild size="lg" className="shadow-glow">
                <Link to="/signup">
                  Get started free
                  <ArrowRight className="size-4" />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <Link to="/login">I already have an account</Link>
              </Button>
            </div>

            <div className="mt-10 flex flex-wrap items-center gap-x-6 gap-y-3 text-sm text-muted-foreground">
              <span className="inline-flex items-center gap-2">
                <Zap className="size-4 text-primary" /> Instant delivery
              </span>
              <span className="inline-flex items-center gap-2">
                <Paperclip className="size-4 text-primary" /> File & media sharing
              </span>
            </div>
          </section>

          <section className="flex justify-center lg:justify-end">
            <ChatPreview />
          </section>
        </main>
      </div>
    </div>
  );
}
