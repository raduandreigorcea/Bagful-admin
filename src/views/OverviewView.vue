<script setup lang="ts">
import { computed, ref } from 'vue'
import { RouterLink } from 'vue-router'
import PageHeader from '../components/PageHeader.vue'
import PanelCard from '../components/PanelCard.vue'
import StatTile from '../components/StatTile.vue'
import LineChart from '../components/LineChart.vue'
import type { Series } from '../lib/uiTypes'
import BarChart from '../components/BarChart.vue'
import StateBlock from '../components/StateBlock.vue'
import SegmentedControl from '../components/SegmentedControl.vue'
import { useQuery, useQueryGroup, describeError } from '../lib/useQuery'
import {
  deltaOf,
  fetchActivitySeries,
  fetchOverview,
  fetchCumulativeWindow,
  searchVolume,
} from '../lib/data/overview'
import { probeProjects } from '../lib/data/health'
import { DEFAULT_RANGE, TIME_RANGES, bucketLabel, resolveRange } from '../lib/timeRange'
import { formatCompact, formatCount } from '../lib/format'

// The landing screen. Totals that ignore the range, a window that respects it,
// and the shape of activity over time.

const rangeKey = ref<string>(DEFAULT_RANGE)
const range = computed(() => resolveRange(rangeKey.value))

const overview = useQuery((signal) => fetchOverview(range.value, signal), { watch: [range] })
// Both windows at once, not the earlier one -- deltaOf() does the subtraction.
const cumulative = useQuery((signal) => fetchCumulativeWindow(range.value, signal), {
  watch: [range],
})
const series = useQuery((signal) => fetchActivitySeries(range.value, signal), { watch: [range] })
const probes = useQuery((signal) => probeProjects(signal))

// All four. `busy` used to watch three of them, so the spinner stopped while
// the delta and the probes were still in flight.
const page = useQueryGroup([overview, cumulative, series, probes])

const rangeSegments = TIME_RANGES.map((r) => ({
  value: r.key,
  label: r.label,
  title: r.description,
}))

/** A window delta, or null while either half of the comparison is missing. */
function delta(field: keyof NonNullable<typeof overview.data.value>['window']) {
  const current = overview.data.value?.window[field]
  const both = cumulative.data.value?.[field]
  if (current === undefined || both === undefined) return null
  return deltaOf(current, both)
}

const buckets = computed(() => series.data.value ?? [])
const chartLabels = computed(() => buckets.value.map((b) => bucketLabel(b.bucket, range.value.bucket)))

const activitySeries = computed<Series[]>(() => [
  { key: 'items_added', label: 'Items added', values: buckets.value.map((b) => b.items_added) },
  { key: 'purchases', label: 'Items bought', values: buckets.value.map((b) => b.purchases) },
  { key: 'active_users', label: 'Active users', values: buckets.value.map((b) => b.active_users) },
  { key: 'members_joined', label: 'Members joined', values: buckets.value.map((b) => b.members_joined) },
])

/** Sparkline data for the tiles, from the same buckets the chart uses. */
const sparks = computed(() => ({
  items: buckets.value.map((b) => b.items_added),
  purchases: buckets.value.map((b) => b.purchases),
  actives: buckets.value.map((b) => b.active_users),
  joins: buckets.value.map((b) => b.members_joined),
}))

const listSizes = computed(() =>
  (overview.data.value?.distribution.list_sizes ?? []).map((row) => ({
    key: `size-${row.members}`,
    label: row.members === 1 ? '1 member' : `${row.members} members`,
    value: row.lists,
  })),
)

const membershipSpread = computed(() =>
  (overview.data.value?.distribution.members_per_user ?? []).map((row) => ({
    key: `hh-${row.lists}`,
    label:
      row.lists === 0
        ? 'In no list'
        : row.lists === 1
          ? 'In 1 list'
          : `In ${row.lists} lists`,
    value: row.users,
  })),
)

const searches = searchVolume(DEFAULT_RANGE)

const overviewError = computed(() => describeError(overview.error.value))
</script>

<template>
  <div class="page">
    <PageHeader
      title="Overview"
      description="Totals as they stand now, and what moved inside the chosen window. Every number is read live from the app database."
      :fetched-at="page.fetchedAt.value"
      :busy="page.busy.value"
      @refresh="page.refresh"
    >
      <template #tools>
        <SegmentedControl v-model="rangeKey" :segments="rangeSegments" aria-label="Time range" />
      </template>
    </PageHeader>

    <StateBlock
      v-if="overview.error.value"
      state="error"
      :title="overviewError.title"
      :message="overviewError.detail"
    />

    <template v-else>
      <!-- Totals. These ignore the range on purpose: a 24h view should not make
           it look as though there are three lists in the world. -->
      <div class="grid">
        <div class="span-2">
          <StatTile
            label="Users"
            :value="overview.data.value?.totals.users ?? null"
            :delta="delta('new_users')"
            :spark="sparks.actives"
            hint="Profiles that exist"
          />
        </div>
        <div class="span-2">
          <StatTile
            label="Active users"
            :value="overview.data.value?.window.active_users ?? null"
            :delta="delta('active_users')"
            :spark="sparks.actives"
            spark-color="var(--chart-3)"
            hint="Wrote something in the window"
          />
        </div>
        <div class="span-2">
          <StatTile
            label="Lists"
            :value="overview.data.value?.totals.lists ?? null"
            :delta="delta('new_lists')"
            :spark="sparks.joins"
            spark-color="var(--chart-2)"
            hint="Groups that exist"
          />
        </div>
        <div class="span-2">
          <StatTile
            label="Open list items"
            :value="overview.data.value?.totals.list_items_open ?? null"
            :delta="delta('items_added')"
            :spark="sparks.items"
            hint="Unchecked, right now"
          />
        </div>
        <div class="span-2">
          <StatTile
            label="Items bought"
            :value="overview.data.value?.totals.purchases ?? null"
            :delta="delta('purchases')"
            :spark="sparks.purchases"
            spark-color="var(--chart-2)"
            hint="Rows in purchase history"
          />
        </div>
        <div class="span-2">
          <StatTile
            label="Searches"
            :unrecorded="!searches.available"
            :unrecorded-reason="searches.available ? '' : 'search_catalog() writes nothing'"
          />
        </div>
      </div>

      <div class="grid">
        <div class="span-12">
          <PanelCard
            title="Activity"
            :note="`Counted per ${range.bucket}. Empty buckets are drawn, not skipped.`"
            fill
          >
            <StateBlock v-if="series.loading.value" state="loading" :lines="5" />
            <StateBlock
              v-else-if="series.error.value"
              state="error"
              title="Could not load the series"
              :message="series.error.value.message"
            />
            <!-- The chart scales with its width and keeps its proportions, so
                 across the full row a shorter viewBox is what keeps it about as
                 tall as it was at two thirds of the row. -->
            <LineChart
              v-else
              :series="activitySeries"
              :labels="chartLabels"
              :height="175"
              :format="formatCompact"
            />
          </PanelCard>
        </div>

      </div>

      <div class="grid">
        <div class="span-4">
          <PanelCard title="List sizes" note="How many lists have how many members." fill>
            <StateBlock v-if="overview.loading.value" state="loading" :lines="4" />
            <StateBlock
              v-else-if="!listSizes.length"
              state="empty"
              title="No lists"
              message="Nothing to distribute yet."
            />
            <BarChart v-else :bars="listSizes" :format="formatCount" dense />
          </PanelCard>
        </div>

        <div class="span-4">
          <PanelCard title="Membership spread" note="How many lists each account belongs to." fill>
            <StateBlock v-if="overview.loading.value" state="loading" :lines="4" />
            <StateBlock
              v-else-if="!membershipSpread.length"
              state="empty"
              title="No accounts"
              message="Nothing to distribute yet."
            />
            <BarChart v-else :bars="membershipSpread" :format="formatCount" dense />
          </PanelCard>
        </div>

        <div class="span-4">
          <PanelCard title="System" note="Reachability measured from this browser." fill>
            <StateBlock v-if="probes.loading.value" state="loading" :lines="3" />
            <div v-else class="system">
              <div v-for="probe in probes.data.value ?? []" :key="probe.target" class="system__row">
                <StatusPill :tone="probe.ok ? 'good' : 'bad'" :label="probe.ok ? 'Reachable' : 'Failing'" />
                <span class="system__name">{{ probe.label }}</span>
                <span class="system__value u-num">
                  {{ probe.latencyMs === null ? '--' : `${Math.round(probe.latencyMs)} ms` }}
                </span>
              </div>

              <dl class="system__facts">
                <div>
                  <dt>Memberships</dt>
                  <dd class="u-num">{{ formatCount(overview.data.value?.totals.memberships ?? 0) }}</dd>
                </div>
                <div>
                  <dt>Checkouts</dt>
                  <dd class="u-num">{{ formatCount(overview.data.value?.totals.checkouts ?? 0) }}</dd>
                </div>
                <div>
                  <dt>Contributed products</dt>
                  <dd class="u-num">{{ formatCount(overview.data.value?.totals.community_products ?? 0) }}</dd>
                </div>
                <div>
                  <dt>Audit events</dt>
                  <dd class="u-num">{{ formatCount(overview.data.value?.totals.security_events ?? 0) }}</dd>
                </div>
              </dl>

              <RouterLink to="/health" class="system__link">Open System Health</RouterLink>
            </div>
          </PanelCard>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>

/* A flex row, not a run of text with a chip dropped into it.
 *
 * UserChip is inline-flex and its first child is an image, so a browser asked
 * for its baseline synthesises one from that image's bottom edge -- which sat
 * the name nearly four pixels above the list name printed right next to
 * it, at the same size. Making both of them flex items centres them on each
 * other instead, and at one font size that is the same thing as sharing a
 * baseline. Any line that puts a chip beside loose text needs this. */

.system {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.system__row {
  display: grid;
  grid-template-columns: auto 1fr auto;
  align-items: center;
  gap: var(--space-2);
  font-size: var(--text-sm);
}

.system__name {
  color: var(--text-primary);
}

.system__value {
  color: var(--text-secondary);
  font-size: var(--text-xs);
}

.system__facts {
  margin: 0;
  display: grid;
  grid-template-columns: 1fr auto;
  gap: var(--space-1) var(--space-3);
  padding-top: var(--space-3);
  border-top: var(--border-width-thin) solid var(--border-light);
}

.system__facts > div {
  display: contents;
}

.system__facts dt {
  font-size: var(--text-xs);
  color: var(--text-secondary);
}

.system__facts dd {
  margin: 0;
  font-size: var(--text-xs);
  font-weight: var(--weight-semibold);
  color: var(--text-primary);
  text-align: right;
}

.system__link {
  font-size: var(--text-xs);
  color: var(--color-primary);
  text-decoration: none;
  font-weight: var(--weight-semibold);
}

.system__link:hover {
  text-decoration: underline;
}
</style>
