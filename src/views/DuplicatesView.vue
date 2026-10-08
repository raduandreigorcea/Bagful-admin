<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import PageHeader from '../components/PageHeader.vue'
import PanelCard from '../components/PanelCard.vue'
import DataTable from '../components/DataTable.vue'
import StateBlock from '../components/StateBlock.vue'
import TablePager from '../components/TablePager.vue'
import ConfirmDialog from '../components/ConfirmDialog.vue'
import SegmentedControl from '../components/SegmentedControl.vue'
import { useQuery, useQueryGroup, describeError } from '../lib/useQuery'
import {
  fetchMerges,
  fetchNearDuplicates,
  mergeProducts,
  rejectGroup,
  unmerge,
  type DuplicateGroup,
  type MergeRecord,
} from '../lib/data/duplicates'
import type { Column } from '../lib/uiTypes'
import { formatDateTime, formatRelative } from '../lib/format'

// Products two shops wrote differently. The catalog merges on its own what it
// can prove (033_dedupe.sql); these are the near misses, one brand, size and
// pack with more than one set of words, smallest groups first because two or
// three wordings of one size are usually one product.
//
// "Same product" merges the ticked ones into the FIRST ticked, so the order of
// ticking is the choice of which name stays. "Different" remembers every pair in
// the group, so the group is not asked again until a new product joins it.
// Both are live for both apps at once; a merge can be undone from Merged.

const LIMIT = 25

type Scope = 'candidates' | 'merged'
const scope = ref<Scope>('candidates')
const onCandidates = computed(() => scope.value === 'candidates')

function setScope(next: string) {
  scope.value = next === 'merged' ? 'merged' : 'candidates'
}

const segments = [
  { value: 'candidates', label: 'Candidates', title: 'One brand and size, written differently by different shops' },
  { value: 'merged', label: 'Merged', title: 'Every merge so far, by the cleanup or by hand, and its Undo' },
]

const candidatesOffset = ref(0)
const mergedOffset = ref(0)

const candidates = useQuery(
  (signal) => fetchNearDuplicates({ limit: LIMIT, offset: candidatesOffset.value }, signal),
  { watch: [candidatesOffset], enabled: () => onCandidates.value },
)
const merges = useQuery(
  (signal) => fetchMerges({ limit: LIMIT, offset: mergedOffset.value }, signal),
  { watch: [mergedOffset], enabled: () => !onCandidates.value },
)
const page = useQueryGroup([candidates, merges])

const groups = computed(() => candidates.data.value?.rows ?? [])
const noCandidates = computed(() => candidates.data.value !== null && groups.value.length === 0)

// ─── deciding a group ────────────────────────────────────────────────────────
// Ticks are kept in the order they were made, per group.
const ticked = ref<Record<string, string[]>>({})
const working = ref<string | null>(null)
const groupError = ref<Record<string, string>>({})

function isTicked(family: string, id: string): boolean {
  return ticked.value[family]?.includes(id) ?? false
}

function toggle(family: string, id: string, on: boolean) {
  const current = (ticked.value[family] ?? []).filter((x) => x !== id)
  ticked.value = { ...ticked.value, [family]: on ? [...current, id] : current }
}

async function decide(group: DuplicateGroup, action: () => Promise<void>) {
  working.value = group.family
  groupError.value = { ...groupError.value, [group.family]: '' }
  try {
    await action()
  } catch (caught) {
    groupError.value = { ...groupError.value, [group.family]: caught instanceof Error ? caught.message : String(caught) }
  } finally {
    // Reloaded on failure too: a merge loop that fails on its third product has
    // already merged two, and a page still showing them makes a retry fail on
    // each with "product not found".
    ticked.value = { ...ticked.value, [group.family]: [] }
    working.value = null
    await candidates.refetch()
  }
}

// Deciding the last group on a later page leaves that page empty, and an empty
// page says "Nothing left to decide" while earlier pages still hold groups.
watch(
  () => candidates.data.value,
  (page) => {
    if (page && page.rows.length === 0 && candidatesOffset.value > 0) {
      candidatesOffset.value = Math.max(0, candidatesOffset.value - LIMIT)
    }
  },
)

function same(group: DuplicateGroup) {
  const [keep, ...rest] = ticked.value[group.family] ?? []
  if (!keep || rest.length === 0) return
  return decide(group, async () => {
    // One at a time: the database refuses a pair one shop lists twice, and the
    // message names that pair rather than failing the whole group.
    for (const drop of rest) await mergeProducts(keep, drop, new AbortController().signal)
  })
}

function different(group: DuplicateGroup) {
  return decide(group, () => rejectGroup(group.products.map((p) => p.id), new AbortController().signal))
}

// ─── undo ────────────────────────────────────────────────────────────────────
const columns: Column<MergeRecord>[] = [
  { key: 'drop_name', label: 'Merged', width: '62%' },
  { key: 'actions', label: '', align: 'right', width: '38%' },
]

const mergeRows = computed(() => merges.data.value?.rows ?? [])
const undoing = ref<MergeRecord | null>(null)
const undoBusy = ref(false)
const undoError = ref('')

function askUndo(row: MergeRecord) {
  undoError.value = ''
  undoing.value = row
}

async function confirmUndo() {
  const target = undoing.value
  if (!target || undoBusy.value) return
  undoBusy.value = true
  undoError.value = ''
  try {
    await unmerge(target.id, new AbortController().signal)
    undoing.value = null
    await merges.refetch()
  } catch (caught) {
    undoError.value = caught instanceof Error ? caught.message : String(caught)
  } finally {
    undoBusy.value = false
  }
}

const SOURCE: Record<MergeRecord['source'], string> = {
  cleanup: 'cleanup',
  admin: 'by hand',
}
</script>

<template>
  <div class="page">
    <PageHeader
      title="Duplicates"
      description="Products two shops wrote differently. Merge the ones that are the same product, mark the rest as different. Every merge is live for both apps and can be undone."
      :fetched-at="page.fetchedAt.value"
      :busy="page.busy.value"
      @refresh="page.refresh"
    />

    <PanelCard
      :note="onCandidates
        ? 'Same brand, size and pack. Tick the ones that are one product; the first ticked keeps its name.'
        : 'Undo puts the merged product back with the shops it had.'"
      flush
    >
      <template #actions>
        <SegmentedControl :model-value="scope" :segments="segments" aria-label="Which duplicates" @update:model-value="setScope" />
      </template>

      <template v-if="onCandidates">
        <StateBlock
          v-if="candidates.error.value"
          state="error"
          title="Could not load the candidates"
          :message="describeError(candidates.error.value).detail"
        />
        <StateBlock
          v-else-if="noCandidates"
          state="empty"
          title="Nothing left to decide"
          message="Every near duplicate has been merged or marked as different."
        />
        <template v-else>
          <ul class="dups">
            <li v-for="group in groups" :key="group.family" class="dup">
              <ul class="dup__products">
                <li v-for="product in group.products" :key="product.id" class="dup__product">
                  <label class="dup__pick">
                    <input
                      type="checkbox"
                      :checked="isTicked(group.family, product.id)"
                      :disabled="working !== null"
                      @change="toggle(group.family, product.id, ($event.target as HTMLInputElement).checked)"
                    />
                    <span class="dup__name">{{ product.name }}</span>
                  </label>
                  <span class="dup__shops u-caption">{{ product.retailers.join(', ') || 'no shop' }}</span>
                </li>
              </ul>
              <div class="dup__actions">
                <span v-if="groupError[group.family]" class="dup__error">{{ groupError[group.family] }}</span>
                <button
                  type="button"
                  class="u-btn dup__different"
                  :disabled="working !== null"
                  @click="different(group)"
                >Different</button>
                <button
                  type="button"
                  class="u-btn dup__same"
                  :disabled="working !== null || (ticked[group.family]?.length ?? 0) < 2"
                  @click="same(group)"
                >{{ working === group.family ? 'Working…' : 'Same product' }}</button>
              </div>
            </li>
          </ul>
        </template>
      </template>

      <template v-else>
        <DataTable
          :columns="columns"
          :rows="mergeRows"
          row-key="id"
          :loading="merges.loading.value"
          :error="merges.error.value ? describeError(merges.error.value).detail : ''"
          empty-title="No merges yet"
          empty-message="Merges made by the cleanup or on this page appear here."
        >
          <template #cell-drop_name="{ row }">
            <div class="merge">
              <span class="u-truncate">{{ row.drop_name }}</span>
              <span class="u-caption u-truncate">
                into {{ row.keep_name ?? 'a product since deleted' }} · {{ SOURCE[row.source] }}
                · <span :title="formatDateTime(row.merged_at)">{{ formatRelative(row.merged_at) }}</span>
              </span>
            </div>
          </template>
          <template #cell-actions="{ row }">
            <span v-if="row.undone_at" class="u-caption" :title="formatDateTime(row.undone_at)">undone</span>
            <button v-else type="button" class="u-btn" @click="askUndo(row)">Undo</button>
          </template>
        </DataTable>
      </template>
      <!-- In the footer, like every other pager here: the flush body has no padding of its own. -->
      <template #footer>
        <TablePager
          v-if="onCandidates"
          :total="candidates.data.value?.total ?? 0"
          :offset="candidatesOffset"
          :limit="LIMIT"
          :loading="candidates.loading.value"
          @go="candidatesOffset = $event"
        />
        <TablePager
          v-else
          :total="merges.data.value?.total ?? 0"
          :offset="mergedOffset"
          :limit="LIMIT"
          :loading="merges.loading.value"
          @go="mergedOffset = $event"
        />
      </template>
    </PanelCard>

    <ConfirmDialog
      :open="undoing !== null"
      title="Undo this merge?"
      :message="undoing
        ? `${undoing.drop_name} comes back as its own product, with the shops it had when it was merged. Both apps see the change at once.`
        : ''"
      confirm-label="Undo merge"
      :busy="undoBusy"
      :error="undoError"
      @cancel="undoing = null"
      @confirm="confirmUndo"
    />
  </div>
</template>

<style scoped>
.dups {
  list-style: none;
  margin: 0;
  padding: 0;
}

.dup {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--space-4);
  padding: var(--space-3) var(--space-4);
  border-bottom: var(--border-width-thin) solid var(--border-light);
}

/* The footer draws its own top border. */
.dup:last-child {
  border-bottom: 0;
}

.dup__products {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  min-width: 0;
  flex: 1;
}

.dup__product {
  display: flex;
  align-items: baseline;
  gap: var(--space-3);
  min-width: 0;
}

.dup__pick {
  display: flex;
  align-items: baseline;
  gap: var(--space-2);
  min-width: 0;
  cursor: pointer;
}

.dup__name {
  font-size: var(--text-sm);
  color: var(--text-primary);
}

.dup__shops {
  flex: none;
  color: var(--text-secondary);
}

.dup__actions {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  flex: none;
}

.dup__error {
  font-size: var(--text-xs);
  color: var(--danger-text);
  max-width: 18rem;
}

.merge {
  display: flex;
  flex-direction: column;
  min-width: 0;
}
</style>
