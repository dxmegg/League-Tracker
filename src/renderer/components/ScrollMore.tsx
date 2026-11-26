import { useEffect, useRef } from "react";

// Rows a long list adds at a time
export const SCROLL_PAGE = 30;

// Sits under a list and asks for the next page when it scrolls into view.
// A new `onMore` observes again, so it keeps asking while it stays in view.
export default function ScrollMore({ onMore }: { onMore: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) onMore();
      },
      { rootMargin: "300px" },
    );
    observer.observe(ref.current!);
    return () => observer.disconnect();
  }, [onMore]);
  return <div ref={ref} className="h-1 shrink-0" />;
}
