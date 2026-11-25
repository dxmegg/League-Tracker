import { useEffect, useState } from "react";

export function useActiveTheme({ exact = false }: { exact?: boolean } = {}): string {
  const [theme, setTheme] = useState<string>(() => {
    return document.documentElement.getAttribute("data-theme") ?? "";
  });

  useEffect(() => {
    const observer = new MutationObserver(() => {
      setTheme(document.documentElement.getAttribute("data-theme") ?? "");
    });
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });
    return () => observer.disconnect();
  }, []);

  if (exact) return theme;

  // Redesign shares the Legacy theme's layouts; exact: true tells them apart
  return theme === "redesign" ? "experiment" : theme;
}
