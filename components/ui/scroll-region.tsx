"use client";

/** Keep wide tables keyboard-scrollable without giving them a misleading widget role. */
export function ScrollRegion({ label, className, children }: { label: string; className: string; children: React.ReactNode }) {
  // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- A named scroll region must be focusable for native arrow-key scrolling.
  return <div className={className} tabIndex={0} role="region" aria-label={label}>{children}</div>;
}
