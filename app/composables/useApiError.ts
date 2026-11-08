type ApiError = { data?: { statusMessage?: string, message?: string, data?: { field?: string, message?: string } }, statusMessage?: string, message?: string }

// Turns an h3 error into the sentence we show people, preferring field-level messages
export function apiErrorMessage(err: unknown, fallback = 'Something went wrong. Try again.') {
  const e = err as ApiError
  return e?.data?.data?.message ?? e?.data?.statusMessage ?? e?.data?.message ?? e?.statusMessage ?? fallback
}

export function apiErrorField(err: unknown) {
  return (err as ApiError)?.data?.data?.field
}

export function useNotify() {
  const toast = useToast()
  return {
    success: (title: string, description?: string) => toast.add({ title, description, color: 'success', icon: 'i-lucide-check' }),
    error: (err: unknown, fallback?: string) => toast.add({ title: apiErrorMessage(err, fallback), color: 'error', icon: 'i-lucide-circle-alert' })
  }
}
