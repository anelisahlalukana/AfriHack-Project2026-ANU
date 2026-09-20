import { useCallback, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'

// Search, filters, sort and page for one table, kept in the URL so a view can be
// linked to or returned to — the same pattern the Clients table uses.
//
// `prefix` namespaces the parameters so two tables on one page (the compliance tabs)
// keep their own state without colliding. Values equal to a default are dropped from
// the URL, so an untouched table adds nothing to it.
export function useTableState(prefix = '', defaults = {}) {
  const [params, setParams] = useSearchParams()

  // Call sites pass an object literal, so it is a new reference on every render.
  // Re-deriving it from its contents keeps the callbacks below stable.
  const defaultsKey = JSON.stringify(defaults)
  const fallback = useMemo(() => JSON.parse(defaultsKey), [defaultsKey])
  const at = useCallback(name => (prefix ? `${prefix}_${name}` : name), [prefix])

  const state = useMemo(() => {
    const read = name => params.get(at(name)) ?? fallback[name] ?? ''
    return {
      q: read('q'),
      status: read('status'),
      cycle: read('cycle'),
      sort: read('sort'),
      dir: read('dir'),
      size: read('size'),
      page: read('page') || '1',
    }
  }, [params, at, fallback])

  const onChange = useCallback(changes => {
    const next = new URLSearchParams(params)
    for (const [name, value] of Object.entries(changes)) {
      const key = at(name)
      if (value === '' || value == null || String(value) === String(fallback[name] ?? '')) next.delete(key)
      else next.set(key, String(value))
    }
    setParams(next, { replace: true })
  }, [params, setParams, at, fallback])

  return [state, onChange]
}
