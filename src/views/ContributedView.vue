<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import PageHeader from '../components/PageHeader.vue'
import PanelCard from '../components/PanelCard.vue'
import DataTable from '../components/DataTable.vue'
import TablePager from '../components/TablePager.vue'
import FilterBar from '../components/FilterBar.vue'
import SegmentedControl from '../components/SegmentedControl.vue'
import StatusPill from '../components/StatusPill.vue'
import CopyValue from '../components/CopyValue.vue'
import UserChip from '../components/UserChip.vue'
import ConfirmDialog from '../components/ConfirmDialog.vue'
import ProductFormDialog from '../components/ProductFormDialog.vue'
import AppIcon from '../components/AppIcon.vue'
import { useQuery, describeError } from '../lib/useQuery'
import {
  fetchContributedProducts,
  fetchCatalogMisses,
  MISSES_LIMIT,
  createProduct,
  updateProduct,
  deleteProduct,
  type ContributedScope,
  type ProductDraft,
} from '../lib/data/contributed'
import { formatCount, formatDateTime, formatRelative } from '../lib/format'
import { collectPages } from '../lib/csv'
import { removeEach } from '../lib/bulkRemove'
import { useRowSelection } from '../lib/useRowSelection'
import type { CatalogMissRow, LocalProductRow } from '../lib/data/types'
import type { Column } from '../lib/uiTypes'

// What lists typed for themselves, and what got promoted out of it.
//
// This page replaced a four-tab Catalog section that read a Supabase project
// which no longer has any of the RPCs it called. See lib/data/contributed.ts for
// why what remains is worth a page of its own rather than a panel: it is the one
// route by which text one person wrote becomes a suggestion everybody sees.

// ─── paging ──────────────────────────────────────────────────────────────────
// Deliberately NOT useTableState, which exists to keep a sort, a direction and
// a pager in step. admin_local_products takes no sort argument -- it is ordered
// `popularity desc, created_at desc` inside the function and that is not
// negotiable from here -- so a sort state would be a control that reports a
// change the server ignores, which is the most misleading thing a table can do.
// No column is marked sortable for the same reason.
const LIMIT = 25

const query = ref('')
// 'misses' is a fourth tab rather than a fourth scope: it reads a different RPC
// with no paging, search or sort, so it never reaches fetchContributedProducts.
const scope = ref<ContributedScope | 'misses'>('all')
const onMisses = computed(() => scope.value === 'misses')
const offset = ref(0)

// The one rule useTableState would have given us: any filter change returns to
// the first page. Page 4 of a search is not page 4 of the next one.
watch([query, scope], () => {
  offset.value = 0
})

const products = useQuery(
  (signal) =>
    fetchContributedProducts(
      {
        query: query.value,
        limit: LIMIT,
        offset: offset.value,
        scope: scope.value as ContributedScope,
      },
      signal,
    ),
  { watch: [query, scope, offset], enabled: () => !onMisses.value },
)

const misses = useQuery((signal) => fetchCatalogMisses(signal), { enabled: () => onMisses.value })
// The RPC takes a limit and nothing else, so the search is done here on the rows
// already loaded: it narrows the top 100, it does not look beyond them.
const missQuery = ref('')
const fold = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
const missRows = computed(() => {
  const needle = fold(missQuery.value.trim())
  return (
    (misses.data.value ?? [])
      // admin_catalog_misses has no id, and a name is not unique across makers.
      .map((row, i) => ({ ...row, key: String(i) }))
      .filter((row) => !needle || fold(`${row.name} ${row.maker ?? ''}`).includes(needle))
  )
})
const missError = computed(() => (misses.error.value ? describeError(misses.error.value).detail : ''))

/** Whichever tab is showing, for the header's refresh and busy light. */
const active = computed(() => (onMisses.value ? misses : products))

const rows = computed(() => products.data.value?.rows ?? [])
const total = computed(() => products.data.value?.total ?? 0)
/** Nothing has answered yet, so `total` is a placeholder rather than a count. */
const countUnknown = computed(() => products.data.value === null)
const error = computed(() => (products.error.value ? describeError(products.error.value).detail : ''))

const columns: Column<LocalProductRow>[] = [
  { key: 'select', label: '', width: '4%', minPx: 36 },
  { key: 'name', label: 'Product', width: '19%' },
  { key: 'maker', label: 'Brand', width: '9%' },
  { key: 'barcode', label: 'Barcode / GTIN', width: '11%', hideBelow: 1100 },
  { key: 'scope', label: 'Scope', width: '9%' },
  { key: 'list_name', label: 'List', width: '9%' },
  { key: 'contributor_name', label: 'Contributed by', width: '10%', hideBelow: 1400 },
  { key: 'add_count', label: 'Adds', numeric: true, width: '6%' },
  { key: 'created_at', label: 'Added', width: '8%', hideBelow: 1100 },
  // Every other column gave up a point or two to pay for this one; the widths
  // are asserted to total 100% in test/designSystem.ts, which is how the first
  // draft of this row was caught at 112.
  // The same pair as the catalog and the same reasoning. 12% was too narrow for
  // the labelled state before any of this -- 132px at a 1401px window against a
  // 155px need -- so `Remove` was already being clipped there; the three points
  // come off the columns that could best afford one each.
  { key: 'actions', label: '', width: '15%', align: 'right', minPx: 80 },
]

const missColumns: Column<CatalogMissRow & { key: string }>[] = [
  { key: 'name', label: 'Product', width: '30%' },
  { key: 'maker', label: 'Brand', width: '16%' },
  { key: 'lists', label: 'Lists', numeric: true, width: '9%', title: 'Distinct lists or accounts that typed it. Three promotes it.' },
  { key: 'add_count', label: 'Adds', numeric: true, width: '9%' },
  { key: 'first_seen', label: 'First asked', width: '12%', hideBelow: 1100 },
  { key: 'last_seen', label: 'Last asked', width: '12%' },
  { key: 'promoted', label: 'Status', width: '12%' },
]

// ─── export ──────────────────────────────────────────────────────────────────
const exportAll = () =>
  collectPages((offset, limit) =>
    fetchContributedProducts(
      { query: query.value, limit, offset, scope: scope.value as ContributedScope },
      new AbortController().signal,
    ),
  )

// ─── selecting ───────────────────────────────────────────────────────────────
// Page-wide only. Selecting "everything that matches" would mean removing rows
// the person has never seen.
const selection = useRowSelection(rows, (r) => r.id, [query, scope, offset])
const removingMany = ref(false)

async function confirmRemoveMany() {
  const batch = selection.selected.value
  writing.value = true
  writeError.value = ''
  const signal = new AbortController().signal
  const { done, failed } = await removeEach(batch, (row) => deleteProduct(row.id, signal))
  await products.refetch()
  writing.value = false
  if (failed.length === 0) {
    removingMany.value = false
    return
  }
  // Keep the dialog open on what is left, so the person sees what did not go.
  writeError.value = `Removed ${done} of ${batch.length}. ${failed[0]!.message}`
}

// ─── writing ─────────────────────────────────────────────────────────────────
// One busy flag and one error string for all three writes, because only one can
// be in flight: each is behind a dialog and the dialog holds the screen until it
// settles. Two flags would only create the possibility of them disagreeing.
const editing = ref<LocalProductRow | null>(null)
const formOpen = ref(false)
const removing = ref<LocalProductRow | null>(null)
const writing = ref(false)
const writeError = ref('')

function add() {
  editing.value = null
  writeError.value = ''
  formOpen.value = true
}

function edit(row: LocalProductRow) {
  editing.value = row
  writeError.value = ''
  formOpen.value = true
}

function closeForm() {
  if (writing.value) return
  formOpen.value = false
  editing.value = null
  writeError.value = ''
}

/**
 * Run one write, then refetch.
 *
 * The refetch is not optional and not an optimistic local edit. A create can
 * land anywhere in an ordering this page does not control -- the RPC sorts by
 * popularity, not by recency -- and an edit can change which scope filter the
 * row belongs to. Patching the array in place would show a row in a position it
 * does not hold, which is worse than a round trip.
 *
 * The error is rendered rather than thrown: every one of these RPCs raises a
 * sentence written to be shown ("Another product already claims that barcode."),
 * which is the whole reason they check instead of letting a 23505 surface.
 */
async function run(work: (signal: AbortSignal) => Promise<unknown>, done: () => void) {
  writing.value = true
  writeError.value = ''
  try {
    await work(new AbortController().signal)
    done()
    await products.refetch()
  } catch (err) {
    writeError.value = describeError(err as Error).detail
  } finally {
    writing.value = false
  }
}

function submitForm(draft: ProductDraft) {
  const row = editing.value
  void run(
    (signal) => (row ? updateProduct(row.id, draft, signal) : createProduct(draft, signal)),
    () => {
      formOpen.value = false
      editing.value = null
    },
  )
}

function confirmRemove() {
  const row = removing.value
  if (!row) return
  void run(
    (signal) => deleteProduct(row.id, signal),
    () => {
      removing.value = null
    },
  )
}

const SEGMENTS = [
  { value: 'all', label: 'All' },
  {
    value: 'community',
    label: 'List-scoped',
    title:
      'Contributed by one list and visible only to it. Still short of the three lists and three accounts a promotion needs.',
  },
  {
    value: 'promoted',
    label: 'Promoted',
    title:
      'Global rows, visible to everyone. The scoped rows they were collapsed from no longer exist.',
  },
  {
    value: 'misses',
    label: 'Misses',
    title:
      'What people searched for, did not find, and typed in themselves: the most asked first. A list of what the catalog could stock, not a log of every empty search.',
  },
]
</script>

<template>
  <div class="page">
    <PageHeader
      title="Contributed"
      description="Products a list added itself, and the ones enough lists asked for that everybody now sees them."
      :fetched-at="active.fetchedAt.value"
      :busy="active.fetching.value"
      @refresh="active.refetch()"
    >
      <template #tools>
        <button type="button" class="u-btn" @click="add">Add product</button>
      </template>
    </PageHeader>

    <PanelCard flush>
      <template #actions>
        <SegmentedControl
          :model-value="scope"
          :segments="SEGMENTS"
          aria-label="Which rows"
          @update:model-value="scope = $event as ContributedScope | 'misses'"
        />
      </template>

      <template v-if="onMisses">
        <div class="u-toolbar">
          <FilterBar
            v-model="missQuery"
            :placeholder="`Filter the top ${MISSES_LIMIT} by name or brand`"
            :busy="misses.fetching.value"
          />
        </div>

        <DataTable
          :columns="missColumns"
          :rows="missRows"
          row-key="key"
          :loading="misses.loading.value"
          :error="missError"
          export-name="catalog-misses"
          :empty-title="missQuery ? 'No match in the top ' + MISSES_LIMIT : 'Nothing typed in yet'"
          empty-message="No list has added a product the catalog did not already have."
        >
          <template #cell-name="{ row }">
            <span class="u-truncate product__name">{{ row.name }}</span>
          </template>
          <template #cell-maker="{ row }">
            <span class="u-truncate" :class="{ 'u-muted': !row.maker }">{{ row.maker || '--' }}</span>
          </template>
          <template #cell-first_seen="{ row }">
            <span :title="formatDateTime(row.first_seen)">{{ formatRelative(row.first_seen) }}</span>
          </template>
          <template #cell-last_seen="{ row }">
            <span :title="formatDateTime(row.last_seen)">{{ formatRelative(row.last_seen) }}</span>
          </template>
          <template #cell-promoted="{ row }">
            <StatusPill
              :tone="row.promoted ? 'good' : 'warn'"
              :label="row.promoted ? 'Closed' : 'Open'"
              :dot="false"
              :title="
                row.promoted
                  ? 'A global product already exists for this name'
                  : 'No global product yet: still only visible to the lists that typed it'
              "
            />
          </template>
        </DataTable>
      </template>

      <template v-else>
      <div v-if="selection.count.value" class="u-toolbar u-bulkbar">
        <span class="u-num">{{ formatCount(selection.count.value) }} selected</span>
        <button type="button" class="u-btn u-btn--danger" @click="writeError = '', removingMany = true">
          Remove selected
        </button>
        <button type="button" class="u-btn" @click="selection.clear()">Clear</button>
      </div>

      <div class="u-toolbar">
        <FilterBar
          v-model="query"
          placeholder="Search name, brand or barcode"
          :busy="products.fetching.value"
        >
          <template #end>
            <!-- Withheld until it is known rather than shown as a zero, which
                 would read as "nothing matched" during the first fetch. See the
                 note in TablePager. -->
            <span v-if="!countUnknown" class="u-toolbar__count u-num">
              {{ formatCount(total) }} contributed
            </span>
          </template>
        </FilterBar>
      </div>

      <DataTable
        :columns="columns"
        :rows="rows"
        row-key="id"
        :loading="products.loading.value"
        :error="error"
        export-name="contributed-products"
        :export-all="exportAll"
        empty-title="No contributed products"
        empty-message="Nothing has been added through add_custom_product() on this database yet."
      >
        <template #head-select>
          <input
            type="checkbox"
            :checked="selection.all.value"
            aria-label="Select every row on this page"
            @change="selection.toggleAll()"
          />
        </template>
        <template #cell-select="{ row }">
          <input
            type="checkbox"
            :checked="selection.has(row)"
            :aria-label="`Select ${row.name}`"
            @change="selection.toggle(row)"
          />
        </template>
        <template #cell-name="{ row }">
          <span class="u-truncate product__name">{{ row.name }}</span>
        </template>
        <template #cell-maker="{ row }">
          <span class="u-truncate" :class="{ 'u-muted': !row.maker }">{{ row.maker || '--' }}</span>
        </template>
        <template #cell-barcode="{ row }">
          <CopyValue v-if="row.barcode" :value="String(row.barcode)" label="barcode" />
          <span v-else class="u-muted">--</span>
        </template>
        <!-- List-scoped or global, which is the whole point of the page:
             a promoted row is one everybody can see. -->
        <template #cell-scope="{ row }">
          <StatusPill
            :tone="row.list_id ? 'idle' : 'good'"
            :label="row.list_id ? 'List' : 'Promoted'"
            :dot="false"
            :title="
              row.list_id
                ? 'Visible only to the contributing list'
                : 'Global in this database: three distinct lists asked for it'
            "
          />
        </template>
        <template #cell-list_name="{ row }">
          <RouterLink
            v-if="row.list_id"
            :to="`/lists/${row.list_id}`"
            class="u-link u-truncate"
          >
            {{ row.list_name || 'Unknown' }}
          </RouterLink>
          <span v-else class="u-muted">--</span>
        </template>
        <!-- The trail back to an account. A row worth removing is usually a row
             whose author is worth looking at. -->
        <template #cell-contributor_name="{ row }">
          <UserChip
            v-if="row.contributed_by"
            :id="String(row.contributed_by)"
            :name="row.contributor_name ? String(row.contributor_name) : null"
            :src="row.contributor_image_url ? String(row.contributor_image_url) : null"
            :size="20"
          />
          <span v-else class="u-muted">--</span>
        </template>
        <template #cell-created_at="{ row }">
          <span :title="formatDateTime(String(row.created_at))">
            {{ formatRelative(String(row.created_at)) }}
          </span>
        </template>
        <!-- Remove wears the danger class and Edit does not: correcting a name
             is reversible by correcting it again, and removing is not. -->
        <template #cell-actions="{ row }">
          <!-- The labels are hidden rather than dropped below 1400: see
               .u-row-actions. `title` says the same word on hover, so nobody
               loses it. -->
          <span class="u-row-actions">
            <button type="button" class="u-btn" title="Edit" @click="edit(row)">
              <span class="u-btn__icon"><AppIcon name="square-pen" :size="14" /></span>
              <span class="u-btn__label">Edit</span>
            </button>
            <button
              type="button"
              class="u-btn u-btn--danger"
              title="Remove"
              @click="removing = row"
            >
              <span class="u-btn__icon"><AppIcon name="trash-2" :size="14" /></span>
              <span class="u-btn__label">Remove</span>
            </button>
          </span>
        </template>
      </DataTable>

      </template>

      <template v-if="!onMisses" #footer>
        <TablePager
          :total="total"
          :offset="offset"
          :limit="LIMIT"
          :loading="products.fetching.value"
          @go="offset = $event"
        />
      </template>
    </PanelCard>

    <ProductFormDialog
      :open="formOpen"
      :product="editing"
      :busy="writing"
      :error="writeError"
      @submit="submitForm"
      @cancel="closeForm"
    />

    <!-- One question for the whole batch, and it says how many. Each row still
         goes through admin_delete_product, so a half-failed batch reports
         "Removed 3 of 5" and the dialog stays on what is left. -->
    <ConfirmDialog
      :open="removingMany"
      :title="`Remove ${selection.count.value} products?`"
      message="Each one is removed the same way a single Remove does it: list-scoped rows leave only that list's suggestions, global rows leave everyone's. Items already on any list are plain text and are untouched."
      confirm-label="Remove"
      tone="danger"
      :busy="writing"
      :error="writeError"
      @confirm="confirmRemoveMany"
      @cancel="writing || ((removingMany = false), (writeError = ''))"
    />

    <!-- Names the product rather than asking an abstract question, for the
         reason ConfirmDialog's own header gives: "Remove this product?" is
         answerable without knowing which one. -->
    <ConfirmDialog
      :open="removing !== null"
      :title="`Remove ${removing?.name ?? 'product'}?`"
      :message="
        removing?.list_id
          ? 'This is one list\u2019s own row. Removing it takes the suggestion away from them; the items already on their list are plain text and are untouched.'
          : 'This is a global product, so removing it takes the suggestion away from everyone. Items already on any list are plain text and are untouched.'
      "
      confirm-label="Remove"
      tone="danger"
      :busy="writing"
      :error="writeError"
      @confirm="confirmRemove"
      @cancel="writing || ((removing = null), (writeError = ''))"
    />
  </div>
</template>

