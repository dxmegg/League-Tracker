import { Fragment } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { sectionsForScope } from "../lib/historySections";

export function HistorySideNav({ scope }: { scope?: string }) {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const sections = sectionsForScope(scope);
  const prefix = scope === "full" || scope === undefined ? "/history/full/" : `/history/${scope}/`;

  return (
    <nav className="w-[220px] shrink-0 max-[1199px]:hidden self-start">
      <div className="w-full rounded-md border border-lol-border/50 bg-lol-card/30 overflow-hidden">
        {sections.map(({ section, label }, i) => {
          const target = `${prefix}${section}`;
          const isCurrent = pathname === target;
          return (
            <Fragment key={section}>
              {i > 0 && (
                <div className="h-px bg-gradient-to-r from-lol-gold/40 via-lol-gold/15 to-lol-gold/5" />
              )}
              <NavLink
                to={target}
                onClick={(e) => {
                  if (isCurrent) {
                    e.preventDefault();
                    navigate("/");
                  }
                }}
                className={({ isActive }) =>
                  [
                    "block px-4 py-3 text-[13px] font-bold tracking-wider transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lol-gold/60 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--theme-bg-deep)]",
                    isActive
                      ? "bg-lol-crimson/30 text-lol-text-bright"
                      : "text-lol-text hover:bg-white/[0.06] hover:text-lol-text-bright",
                  ].join(" ")
                }
              >
                {label}
              </NavLink>
            </Fragment>
          );
        })}
      </div>
    </nav>
  );
}
