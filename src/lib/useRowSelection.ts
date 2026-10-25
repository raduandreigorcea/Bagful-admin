import { computed, ref, watch, type Ref, type WatchSource } from 'vue'

// Which rows of the visible page are ticked, for a bulk action.
//
// It forgets everything when the page or the filter changes (`reset`), because a
// selection that survives onto a page you can no longer see is a selection you
// can no longer check before pressing Remove. Keyed by id, so a refetch that
// reorders the rows keeps the ticks on the same products.
export function useRowSelection<T>(
  rows: Ref<T[]>,
  idOf: (row: T) => string,
  reset: WatchSource[],
) {
  const ids = ref<Set<string>>(new Set())

  watch(reset, () => {
    ids.value = new Set()
  })
  // A refetch after a write drops rows that no longer exist from the selection.
  watch(rows, (now) => {
    const live = new Set(now.map(idOf))
    ids.value = new Set([...ids.value].filter((id) => live.has(id)))
  })

  const count = computed(() => ids.value.size)
  const all = computed(() => rows.value.length > 0 && ids.value.size === rows.value.length)
  const has = (row: T) => ids.value.has(idOf(row))

  function toggle(row: T) {
    const next = new Set(ids.value)
    if (!next.delete(idOf(row))) next.add(idOf(row))
    ids.value = next
  }

  function toggleAll() {
    ids.value = all.value ? new Set() : new Set(rows.value.map(idOf))
  }

  const clear = () => (ids.value = new Set())
  const selected = computed(() => rows.value.filter(has))

  return { ids, count, all, has, toggle, toggleAll, clear, selected }
}
