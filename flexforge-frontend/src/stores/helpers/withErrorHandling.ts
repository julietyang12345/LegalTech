type SetState<T> = (partial: Partial<T> | ((state: T) => Partial<T>)) => void;

interface ErrorState {
  isLoading: boolean;
  error: string | null;
}

/**
 * Wrapper for async store actions with consistent error handling
 * Automatically sets isLoading and error states
 */
export async function withErrorHandling<T extends ErrorState, R>(
  set: SetState<T>,
  action: () => Promise<R>,
  errorMessage: string = 'Operation failed'
): Promise<R> {
  set({ isLoading: true, error: null } as Partial<T>);
  try {
    const result = await action();
    set({ isLoading: false } as Partial<T>);
    return result;
  } catch (error: any) {
    set({
      error: error.response?.data?.message || errorMessage,
      isLoading: false,
    } as Partial<T>);
    throw error;
  }
}

/**
 * Creates a bound helper for a specific store
 * Usage: const handleError = createErrorHandler(set);
 *        await handleError(() => api.call(), 'Failed message');
 */
export function createErrorHandler<T extends ErrorState>(set: SetState<T>) {
  return <R>(action: () => Promise<R>, errorMessage?: string) =>
    withErrorHandling(set, action, errorMessage);
}
