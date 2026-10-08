import { getCatalogSupabase } from '../supabase'
import { CatalogNotConfigured } from './catalog'
import { queryError } from './errors'
import type { Page, PageParams } from './types'

// Products two shops wrote differently, and what a person decided about them.
// All of it is in the catalog's 033_dedupe.sql.
//
// The catalog already merges what it can prove: same brand, same size, same
// pack, and the same words once filler like "Bautura carbogazoasa" is gone. What
// is left here are the near misses -- one brand, size and pack, more than one
// set of words -- such as Mega Image's "Bautura carbogazoasa cu gust de citrice
// 1L", which is Mountain Dew 1L to a person and not to the rule.
//
// A MERGE IS LIVE FOR BOTH APPS AT ONCE, like every write to the catalog. It is
// also recorded whole, and Undo puts the merged product back with exactly the
// shops it had; a shop that reached the kept product later stays where it is.

function client() {
  const supabase = getCatalogSupabase()
  if (!supabase) throw new CatalogNotConfigured()
  return supabase
}

export interface DuplicateProduct {
  id: string
  name: string
  brand: string | null
  /** brand | words | size | pack. Two products with the same key are the cleanup's, not this page's. */
  match_key: string
  /** Shop slugs. Two products sharing one are never offered as a pair. */
  retailers: string[]
}

/** Two products of one brand, size and pack, worded differently. Most alike first. */
export interface DuplicateGroup {
  /** brand | size | pack | id | id: unique per pair. */
  family: string
  /** Always two. The one most shops list first: the natural one to keep. */
  products: DuplicateProduct[]
  total: number
}

export async function fetchNearDuplicates(params: PageParams, signal: AbortSignal): Promise<Page<DuplicateGroup>> {
  const offset = params.offset ?? 0
  const { data, error } = await client()
    .rpc('catalog_admin_near_duplicates', { p_limit: params.limit ?? 25, p_offset: offset })
    .abortSignal(signal)

  if (error) queryError('catalog_admin_near_duplicates', error)
  const rows = (data ?? []) as DuplicateGroup[]
  return { rows, total: rows[0]?.total ?? 0, offset }
}

/** Moves `drop`'s shops and barcodes onto `keep`. Returns the merge's id, which Undo takes. */
export async function mergeProducts(keep: string, drop: string, signal: AbortSignal): Promise<string> {
  const { data, error } = await client()
    .rpc('catalog_admin_merge', { p_keep: keep, p_drop: drop })
    .abortSignal(signal)

  if (error) queryError('catalog_admin_merge', error)
  return data as string
}

/**
 * "These are different": every pair in the group is remembered, in one
 * statement, and never offered again. Idempotent.
 */
export async function rejectGroup(ids: string[], signal: AbortSignal): Promise<void> {
  const { error } = await client().rpc('catalog_admin_reject_group', { p_ids: ids }).abortSignal(signal)
  if (error) queryError('catalog_admin_reject_group', error)
}

export interface MergeRecord {
  id: string
  keep_id: string
  /** null when the kept product was deleted since. */
  keep_name: string | null
  drop_name: string
  /** cleanup: the one-off `npm run catalog:dedupe`. admin: somebody on this page. The nightly import never merges; it attaches a new listing to the product it matches. */
  source: 'cleanup' | 'admin'
  merged_by: string | null
  merged_at: string
  undone_at: string | null
  total: number
}

export async function fetchMerges(params: PageParams, signal: AbortSignal): Promise<Page<MergeRecord>> {
  const offset = params.offset ?? 0
  const { data, error } = await client()
    .rpc('catalog_admin_merges', { p_limit: params.limit ?? 25, p_offset: offset })
    .abortSignal(signal)

  if (error) queryError('catalog_admin_merges', error)
  const rows = (data ?? []) as MergeRecord[]
  return { rows, total: rows[0]?.total ?? 0, offset }
}

export async function unmerge(mergeId: string, signal: AbortSignal): Promise<void> {
  const { error } = await client().rpc('catalog_admin_unmerge', { p_merge_id: mergeId }).abortSignal(signal)
  if (error) queryError('catalog_admin_unmerge', error)
}
