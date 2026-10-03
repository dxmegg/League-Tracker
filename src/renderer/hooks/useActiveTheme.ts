import { useEffect, useState } from "react";

export function useActiveTheme(): string {
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

  return theme;
}
