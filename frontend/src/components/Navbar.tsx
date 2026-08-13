import { CalendarClock, House, Search, Settings } from "lucide-react";
import { motion } from "motion/react";
import { Link, useLocation } from "react-router-dom";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { springTransition } from "@/components/motion/transitions";
import { initialsFor, personDisplayName } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useAuth } from "../context/AuthContext";
import { BrandMark } from "./BrandMark";

type NavItem = {
  label: string;
  to: string;
  active: boolean;
  icon: typeof House;
};

function Navbar() {
  const { pathname } = useLocation();
  const { user } = useAuth();

  const items: NavItem[] = [
    {
      label: "Home",
      to: "/home",
      active:
        pathname === "/home" ||
        pathname.startsWith("/chats/") ||
        pathname.startsWith("/channels/"),
      icon: House,
    },
    {
      label: "Search",
      to: "/search",
      active: pathname.startsWith("/search"),
      icon: Search,
    },
    {
      label: "Scheduled",
      to: "/scheduled",
      active: pathname.startsWith("/scheduled"),
      icon: CalendarClock,
    },
    {
      label: "Settings",
      to: "/settings",
      active: pathname.startsWith("/settings"),
      icon: Settings,
    },
  ];

  const displayName = personDisplayName(user ?? null, "You");
  const initials = initialsFor(displayName, "U");

  return (
    <header className="z-40 shrink-0 border-b border-border bg-background/70 backdrop-blur-xl">
      <div className="mx-auto flex h-16 w-full max-w-[96rem] items-center justify-between gap-2 px-3 sm:gap-4 sm:px-6 lg:px-8">
        <Link
          to="/home"
          aria-label="Go to home"
          className="shrink-0 rounded-2xl outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40"
        >
          {/* The wordmark is the first thing to go when width runs out. */}
          <BrandMark className="hidden md:flex" />
          <BrandMark className="md:hidden" compact />
        </Link>

        <div className="flex min-w-0 items-center gap-1.5 sm:gap-2">
          <nav
            aria-label="Main navigation"
            className="flex items-center gap-0.5 rounded-2xl border border-border bg-white/[0.03] p-1 sm:gap-1"
          >
            {items.map(({ to, label, active, icon: Icon }) => (
              <Link
                key={to}
                to={to}
                title={label}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "relative inline-flex items-center gap-2 rounded-xl px-2.5 py-2 text-sm font-medium transition-colors sm:px-3 lg:px-4",
                  active
                    ? "text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {active ? (
                  // One shared element slides between tabs instead of each tab
                  // fading its own background in and out.
                  <motion.span
                    layoutId="nav-active-pill"
                    className="absolute inset-0 rounded-xl bg-primary/15"
                    transition={springTransition}
                    aria-hidden="true"
                  />
                ) : null}
                <Icon className="relative size-4" aria-hidden="true" />
                <span className="relative hidden lg:inline">{label}</span>
              </Link>
            ))}
          </nav>

          <Link
            to="/settings"
            aria-label="Your account"
            className="shrink-0 rounded-full outline-none ring-primary/50 transition focus-visible:ring-[3px]"
          >
            <Avatar className="size-9 border border-border">
              {user?.avatar_url ? (
                <AvatarImage src={user.avatar_url} alt={displayName} />
              ) : null}
              <AvatarFallback className="bg-primary/20 text-xs font-semibold text-foreground">
                {initials}
              </AvatarFallback>
            </Avatar>
          </Link>
        </div>
      </div>
    </header>
  );
}

export default Navbar;
