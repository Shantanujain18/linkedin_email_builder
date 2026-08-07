"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";

export function Providers({ children }: { children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // Short stale window so in-app nav stays snappy; focus always refetches
            // (extension may have written posts/drafts while this tab was backgrounded).
            staleTime: 15_000,
            gcTime: 5 * 60_000,
            refetchOnWindowFocus: "always"
          }
        }
      })
  );

  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
