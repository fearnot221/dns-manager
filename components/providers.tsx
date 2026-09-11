"use client";

import { ThemeProvider, useTheme } from "next-themes";
import { Toaster } from "sonner";

function Notifications() {
  const { resolvedTheme } = useTheme();
  return <Toaster richColors position="bottom-right" theme={resolvedTheme === "dark" ? "dark" : "light"} />;
}

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider attribute="data-theme" storageKey="aegis-theme" defaultTheme="system" enableSystem disableTransitionOnChange>
      {children}
      <Notifications />
    </ThemeProvider>
  );
}
