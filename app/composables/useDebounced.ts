export function useDebounced<T>(source: Ref<T>, ms = 300) {
  const value = ref(source.value) as Ref<T>
  let t: ReturnType<typeof setTimeout> | undefined
  watch(source, (v) => {
    clearTimeout(t)
    t = setTimeout(() => { value.value = v }, ms)
  })
  return value
}
