import { useQuery, UseQueryOptions, UseQueryResult } from '@tanstack/react-query';

export function useQueryWith402Retry<TData = unknown, TError = unknown>(
  options: UseQueryOptions<TData, TError>
): UseQueryResult<TData, TError> {
  const { ...queryOptions } = options;

  return useQuery({
    retry: (_, error: any) => error?.response?.status === 402,
    ...queryOptions,
  });
}
