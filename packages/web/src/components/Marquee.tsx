import { useEffect, useRef, useState, type ReactNode } from "react";

interface MarqueeProps {
  children: ReactNode;
  className?: string;
}

export function Marquee({ children, className }: MarqueeProps) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLSpanElement>(null);
  const [overflowing, setOverflowing] = useState(false);
  const [viewportPx, setViewportPx] = useState(0);

  useEffect(() => {
    const viewport = viewportRef.current;
    const track = trackRef.current;
    if (!viewport || !track) return;

    function measure() {
      if (!viewport || !track) return;
      const vw = viewport.clientWidth;
      const tw = track.scrollWidth;
      setViewportPx(vw);
      setOverflowing(tw > vw + 1);
    }

    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(viewport);
    ro.observe(track);
    return () => ro.disconnect();
  }, [children]);

  return (
    <div
      ref={viewportRef}
      className={`${overflowing ? "marquee-viewport" : "min-w-0 truncate"} ${className ?? ""}`}
      style={
        overflowing
          ? ({ ["--marquee-viewport" as string]: `${viewportPx}px` } as React.CSSProperties)
          : undefined
      }
    >
      <span
        ref={trackRef}
        className={overflowing ? "marquee-track" : undefined}
      >
        {children}
      </span>
    </div>
  );
}
