import { QueryClient } from "@tanstack/react-query";

//This code creates a React Query client that manages how the app fetches and stores data, retries failed requests once, and automatically fetches
// fresh data when you return to the browser window.

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: true } },
  });
}
