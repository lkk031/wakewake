import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      networkMode: 'always',
      staleTime: 15_000,
      retry: 1,
    },
    mutations: {
      networkMode: 'always',
    },
  },
});
