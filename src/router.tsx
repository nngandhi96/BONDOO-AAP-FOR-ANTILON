import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

export const getRouter = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 1000 * 60 * 2, // 2 minutes cache to avoid redundant API refetches
        gcTime: 1000 * 60 * 10,   // 10 minutes garbage collection
        refetchOnWindowFocus: false, // Prevent lag/freezes on tab refocusing
        refetchOnMount: false,   // Use cached data instantly on component mount if fresh
        retry: 1,
      },
    },
  });

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreload: "intent",
    defaultPreloadStaleTime: 1000 * 30, // 30 seconds preload freshness
  });

  return router;
};
