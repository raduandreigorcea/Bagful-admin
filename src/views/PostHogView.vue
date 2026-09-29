<script setup lang="ts">
import { computed } from 'vue'
import PageHeader from '../components/PageHeader.vue'
import PanelCard from '../components/PanelCard.vue'
import StateBlock from '../components/StateBlock.vue'
import StatTile from '../components/StatTile.vue'
import LineChart from '../components/LineChart.vue'
import BarChart from '../components/BarChart.vue'
import { useQuery, describeError } from '../lib/useQuery'
import { fetchPostHogActivity, serviceProblem } from '../lib/data/services'
import type { Bar, Series } from '../lib/uiTypes'
import { formatCompact, formatCount, formatDayMonth } from '../lib/format'

// PostHog: what people DO in the app, which the database cannot see because it
// only learns about writes. Searches, scans, filters, who came back today.
//
// Counts per day and nothing else. admin-services runs one query that never
// selects a person (see posthogActivityQuery in FamCart's
// supabase/functions/_shared/services.ts), so this page cannot show who did
// what even to an admin. Funnels and retention, which need per-person data,
// stay in PostHog itself behind its own login: the link in the header.
//
// Follows the project switcher by channel: production's database reads
// production's events, famcart-dev reads nightly's. Both land in the same
// PostHog project and are told apart by the `channel` property.

const POSTHOG_DASHBOARD = 'https://eu.posthog.com/project/287898/dashboard/982750'

const activity = useQuery((signal) => fetchPostHogActivity(signal))

const problem = computed(() => serviceProblem(activity.error.value))
const loadError = computed(() => {
  const error = activity.error.value
  return error && !problem.value ? describeError(error).detail : ''
})

const counts = computed(() => activity.data.value?.counts ?? {})
const labels = computed(() => (activity.data.value?.days ?? []).map((d) => formatDayMonth(d)))
const zeros = computed(() => labels.value.map(() => 0))

/** One event's daily numbers, all breakdowns summed. */
function daily(event: string): number[] {
  const parts = Object.values(counts.value[event] ?? {})
  return zeros.value.map((_, i) => parts.reduce((sum, values) => sum + (values[i] ?? 0), 0))
}
const total = (event: string) => (activity.data.value ? daily(event).reduce((a, b) => a + b, 0) : null)

function byPart(event: string, names: Record<string, string>): Series[] {
  return Object.entries(names).map(([part, label]) => ({
    key: part,
    label,
    values: counts.value[event]?.[part] ?? zeros.value,
  }))
}

const activeToday = computed(() => (activity.data.value ? (daily('$active').at(-1) ?? 0) : null))

const activeSeries = computed<Series[]>(() => [{ key: 'active', label: 'People', values: daily('$active') }])
const itemSeries = computed<Series[]>(() => [
  { key: 'added', label: 'Added', values: daily('item_added') },
  { key: 'checked', label: 'Checked off', values: daily('item_checked') },
])
const sourceSeries = computed(() =>
  byPart('item_added', { search: 'From search', typed: 'Typed', barcode: 'Scanned', custom: 'Own product' }),
)
const scanSeries = computed(() => byPart('barcode_scanned', { true: 'Found', false: 'Not found' }))
const listSeries = computed<Series[]>(() => [
  { key: 'created', label: 'Lists created', values: daily('list_created') },
  { key: 'joined', label: 'Lists joined', values: daily('list_joined') },
  { key: 'invites', label: 'Invites sent', values: daily('invite_sent') },
  { key: 'onboarding', label: 'Tour finished', values: daily('onboarding_completed') },
])
const shopBars = computed<Bar[]>(() =>
  Object.entries(counts.value.shop_filter_used ?? {})
    .map(([shop, values]) => ({ key: shop, label: shop, value: values.reduce((a, b) => a + b, 0) }))
    .filter((bar) => bar.value > 0)
    .sort((a, b) => b.value - a.value),
)

const hint = computed(() => `Last ${labels.value.length || 30} days, ${activity.data.value?.channel ?? ''} app`)
</script>

<template>
  <div class="page">
    <PageHeader
      title="PostHog"
      description="What people do in the app, counted per day. No person is ever named here."
      :fetched-at="activity.fetchedAt.value"
      :busy="activity.fetching.value"
      @refresh="activity.refetch"
    />

    <PanelCard v-if="problem" title="PostHog">
      <StateBlock state="empty" :title="problem.title" :message="problem.message" />
    </PanelCard>

    <PanelCard v-else-if="loadError" title="PostHog">
      <StateBlock state="error" title="Could not load PostHog" :message="loadError" />
    </PanelCard>

    <template v-else>
      <div class="grid">
        <div class="span-3">
          <StatTile label="Active today" :value="activeToday" hint="People who opened the app" :loading="activity.loading.value" />
        </div>
        <div class="span-3">
          <StatTile label="Items added" :value="total('item_added')" :hint="hint" :loading="activity.loading.value" />
        </div>
        <div class="span-3">
          <StatTile label="Searches" :value="total('search_performed')" :hint="hint" :loading="activity.loading.value" />
        </div>
        <div class="span-3">
          <StatTile label="Barcode scans" :value="total('barcode_scanned')" :hint="hint" :loading="activity.loading.value" />
        </div>
      </div>

      <div class="grid">
        <div class="span-6">
          <PanelCard title="Active people" note="Distinct people per day, counted by PostHog." fill>
            <StateBlock v-if="activity.loading.value" state="loading" :lines="5" />
            <LineChart v-else :series="activeSeries" :labels="labels" :format="formatCompact" />
          </PanelCard>
        </div>
        <div class="span-6">
          <PanelCard title="Items" note="Put on a list, and ticked off in the shop." fill>
            <StateBlock v-if="activity.loading.value" state="loading" :lines="5" />
            <LineChart v-else :series="itemSeries" :labels="labels" :format="formatCompact" />
          </PanelCard>
        </div>
        <div class="span-6">
          <PanelCard title="How items get added" fill>
            <StateBlock v-if="activity.loading.value" state="loading" :lines="5" />
            <LineChart v-else :series="sourceSeries" :labels="labels" :format="formatCompact" />
          </PanelCard>
        </div>
        <div class="span-6">
          <PanelCard title="Barcode scans" note="Not found means the catalog does not know the code yet." fill>
            <StateBlock v-if="activity.loading.value" state="loading" :lines="5" />
            <LineChart v-else :series="scanSeries" :labels="labels" :format="formatCompact" />
          </PanelCard>
        </div>
        <div class="span-8">
          <PanelCard title="Lists and invites" fill>
            <StateBlock v-if="activity.loading.value" state="loading" :lines="5" />
            <LineChart v-else :series="listSeries" :labels="labels" :format="formatCompact" />
          </PanelCard>
        </div>
        <div class="span-4">
          <PanelCard title="Shop filters" note="Times each shop was picked in search." fill>
            <StateBlock v-if="activity.loading.value" state="loading" :lines="5" />
            <StateBlock v-else-if="!shopBars.length" state="empty" title="No filter used yet" message="" />
            <BarChart v-else :bars="shopBars" :format="formatCount" dense :limit="8" />
          </PanelCard>
        </div>
      </div>

      <p class="posthog__more">
        Funnels, retention and session recordings live in
        <a :href="POSTHOG_DASHBOARD" target="_blank" rel="noopener noreferrer">PostHog itself</a>.
      </p>
    </template>
  </div>
</template>

<style scoped>
.posthog__more {
  color: var(--text-secondary);
  font-size: var(--text-sm);
}
</style>
