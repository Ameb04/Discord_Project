import { Link } from "react-router-dom";
import { BrandMark } from "../BrandMark";

export function LandingHero() {
  return (
    <div className="min-h-screen bg-[#090909] text-white">
      <div className="mx-auto flex min-h-screen w-full max-w-7xl flex-col px-6 py-6 sm:px-8 lg:px-12">
        <div className="flex items-center justify-between">
          <BrandMark />
          <div className="hidden items-center gap-3 sm:flex">
            <Link
              to="/login"
              className="rounded-full border border-white/15 px-5 py-2 text-sm font-medium text-white/80 transition hover:border-white/30 hover:bg-white/5"
            >
              Login
            </Link>
            <Link
              to="/signup"
              className="rounded-full bg-white px-5 py-2 text-sm font-medium text-black transition hover:bg-white/90"
            >
              Sign up
            </Link>
          </div>
        </div>

        <main className="grid flex-1 items-center gap-12 py-12 lg:grid-cols-2 lg:py-0">
          <section className="max-w-2xl">
            <p className="mb-4 text-xs uppercase tracking-[0.45em] text-white/40">
              Minimal • Silver • Clean
            </p>
            <h1 className="text-5xl font-semibold tracking-tight text-white sm:text-6xl">
              A calm black and silver space for your project.
            </h1>
            <p className="mt-6 max-w-xl text-base leading-8 text-white/60">
              Simple login, simple sign up, and a clean landing page with a modern dark aesthetic.
            </p>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link
                to="/login"
                className="inline-flex items-center justify-center rounded-2xl bg-white px-6 py-3 text-sm font-semibold text-black transition hover:bg-white/90"
              >
                Go to Login
              </Link>
              <Link
                to="/signup"
                className="inline-flex items-center justify-center rounded-2xl border border-white/15 px-6 py-3 text-sm font-semibold text-white transition hover:border-white/30 hover:bg-white/5"
              >
                Create Account
              </Link>
            </div>
          </section>

          <section className="lg:justify-self-end">
            <div className="w-full max-w-md rounded-[2rem] border border-white/10 bg-white/[0.03] p-6 shadow-2xl shadow-black/40 backdrop-blur-sm">
              <div className="rounded-[1.6rem] border border-white/10 bg-[linear-gradient(135deg,rgba(255,255,255,0.15),rgba(255,255,255,0.03))] p-6">
                <div className="flex h-80 items-center justify-center rounded-[1.25rem] border border-white/10 bg-black/25">
                  <div className="relative h-40 w-40">
                    <div className="absolute inset-0 rounded-full border border-white/15" />
                    <div className="absolute left-4 top-8 h-16 w-16 rounded-full bg-white/90 opacity-85" />
                    <div className="absolute right-3 top-4 h-24 w-24 rounded-full border border-white/20 bg-white/5" />
                    <div className="absolute bottom-4 left-11 h-10 w-24 rounded-full bg-white/75 opacity-85" />
                  </div>
                </div>
              </div>
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}