import { describe, expect, it, vi, beforeEach } from 'vitest'

// The Duplicates page's five calls into the catalog (033_dedupe.sql). Thin
// wrappers, so the thing worth pinning is the argument NAMES: PostgREST resolves
// an RPC by them, the catalog is another repository, and a rename on either side
// is a 404 that mentions neither.

const rpc = vi.fn()
const abortSignal = vi.fn()

vi.mock('../src/lib/supabase', () => ({
  getAppSupabase: () => null,
  getCatalogSupabase: () => ({ rpc }),
}))

const { fetchNearDuplicates, mergeProducts, rejectGroup, fetchMerges, unmerge } = await import(
  '../src/lib/data/duplicates'
)

function resolving(data: unknown = null, error: unknown = null) {
  abortSignal.mockResolvedValue({ data, error })
  rpc.mockReturnValue({ abortSignal })
}

const signal = () => new AbortController().signal

describe('duplicates', () => {
  beforeEach(() => {
    rpc.mockReset()
    abortSignal.mockReset()
  })

  it('pages the candidate groups and reads the total off the first row', async () => {
    resolving([
      { family: 'mountain dew|ml:1000|1', products: [{ id: 'a', name: 'Mountain Dew 1L', brand: 'Mountain Dew', match_key: 'k', retailers: ['carrefour'] }], total: 40 },
    ])
    const page = await fetchNearDuplicates({ limit: 25, offset: 50 }, signal())

    expect(rpc).toHaveBeenCalledWith('catalog_admin_near_duplicates', { p_limit: 25, p_offset: 50 })
    expect(page.total).toBe(40)
    expect(page.rows[0].products[0].retailers).toEqual(['carrefour'])
  })

  it('merges the second product into the first', async () => {
    resolving('merge-1')
    const id = await mergeProducts('keep', 'drop', signal())

    expect(rpc).toHaveBeenCalledWith('catalog_admin_merge', { p_keep: 'keep', p_drop: 'drop' })
    expect(id).toBe('merge-1')
  })

  it('rejects a whole group in one call', async () => {
    resolving()
    await rejectGroup(['a', 'b', 'c'], signal())

    expect(rpc).toHaveBeenCalledWith('catalog_admin_reject_group', { p_ids: ['a', 'b', 'c'] })
  })

  it('pages the merge history', async () => {
    resolving([])
    const page = await fetchMerges({ limit: 25, offset: 0 }, signal())

    expect(rpc).toHaveBeenCalledWith('catalog_admin_merges', { p_limit: 25, p_offset: 0 })
    expect(page).toEqual({ rows: [], total: 0, offset: 0 })
  })

  it('undoes a merge by its id', async () => {
    resolving()
    await unmerge('merge-1', signal())

    expect(rpc).toHaveBeenCalledWith('catalog_admin_unmerge', { p_merge_id: 'merge-1' })
  })

  it('throws what the database said', async () => {
    resolving(null, { message: 'both products are listed by the same shop', code: 'P0001' })

    await expect(mergeProducts('a', 'b', signal())).rejects.toThrow(/same shop/)
  })
})
