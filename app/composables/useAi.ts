// Whether this server has AI set up; one request per page load, shared by every caller
export function useAi() {
  const { data } = useFetch<{ enabled: boolean, mcp: boolean }>('/api/ai/status', { key: 'ai-status', default: () => ({ enabled: false, mcp: false }), lazy: true, server: false })
  return { enabled: computed(() => data.value.enabled), mcp: computed(() => data.value.mcp) }
}
