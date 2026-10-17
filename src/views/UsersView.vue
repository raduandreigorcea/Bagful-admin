<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import UserChip from '../components/UserChip.vue'
import PageHeader from '../components/PageHeader.vue'
import PanelCard from '../components/PanelCard.vue'
import DataTable from '../components/DataTable.vue'
import TablePager from '../components/TablePager.vue'
import FilterBar from '../components/FilterBar.vue'
import StatusPill from '../components/StatusPill.vue'
import CopyValue from '../components/CopyValue.vue'
import UserId from '../components/UserId.vue'
import { useQuery, describeError } from '../lib/useQuery'
import { useTableState } from '../lib/useTableState'
import { fetchUsers, isUserSort } from '../lib/data/users'
import { cachedSubscriber, deviceSummary, fetchClerkSummary, fetchReplayers, fetchPushSubscribers, serviceProblem, subscriberPill } from '../lib/data/services'
import type { AdminUserRow } from '../lib/data/types'
import type { Column } from '../lib/uiTypes'
import { formatCount, formatDateTime, formatRelative, shortUserId } from '../lib/format'

// Every account, and whether each one can be sent a notification.
//
// Sorting and paging are server-side: the RPC gets the sort and the offset, and
// the table only reports the click. Sorting 25 of 300 rows in the browser would
// look like sorting and be a lie.


const router = useRouter()

// The query, sort, direction and page, and the rules that keep them coherent --
// including the one that matters most here, that USER_SORTS is checked before a
// header click can reach admin_list_users. See useTableState.ts.
const { query, sort, dir, offset, limit, params, onSort } = useTableState({
  isSort: isUserSort,
  sort: 'last_active',
})

const users = useQuery((signal) => fetchUsers(params.value, signal), { watch: [params] })

// How many accounts Clerk holds, beside how many have a profile here: the gap is
// people who signed in once and never made a list. A failure is not worth a
// banner, the number just does not appear.
const clerkTotal = useQuery((signal) =>
  fetchClerkSummary(signal).then((summary) => summary.total, () => null),
)

const columns: Column<AdminUserRow>[] = [
  // They sum to 100 because fixed layout scales the whole set down when they do
  // not, which once made a column overflow while claiming a share of a set that
  // added up to 105.
  { key: 'display_name', label: 'Account', sortable: true, width: '24%' },
  { key: 'user_id', label: 'Clerk id', width: '10%', hideBelow: 1400 },
  { key: 'push', label: 'Notifications', width: '14%', title: 'From OneSignal: whether this person has a device subscribed to push.' },
  { key: 'devices', label: 'Devices', width: '16%', hideBelow: 1100 },
  { key: 'telemetry', label: 'Telemetry', width: '12%', hideBelow: 1100, title: 'From PostHog: On when this person recorded a session in the last 30 days (Session replay is on in their Settings). Off can also mean the app has not been opened since.' },
  { key: 'first_seen', label: 'First seen', sortable: true, width: '10%', hideBelow: 1100 },
  { key: 'last_active', label: 'Last active', sortable: true, width: '14%' },
]

const rows = computed(() => users.data.value?.rows ?? [])

// Notification state for the people on this page, one OneSignal answer each.
// Asked after the page of users is known, and never allowed to hold it up or
// break it: where OneSignal is not connected (bagful-dev has no push) or does
// not answer, the cells simply stay empty.
const pushState = useQuery((signal) => fetchPushSubscribers(rows.value.map((row) => row.user_id), signal), {
  watch: [rows],
  enabled: () => rows.value.length > 0,
})
// Same idea for telemetry: asked after the page is known, and silent when PostHog is not connected.
const replayState = useQuery((signal) => fetchReplayers(rows.value.map((row) => row.user_id), signal), {
  watch: [rows],
  enabled: () => rows.value.length > 0,
})
const replayById = computed(() => new Map((replayState.data.value ?? []).map((r) => [r.userId, r.replay])))
const pushById = computed(() => {
  const fresh = pushState.data.value
  if (fresh) return new Map(fresh.map((sub) => [sub.userId, sub]))
  // Not answered yet: what an earlier visit learned, if anything.
  const remembered: [string, NonNullable<ReturnType<typeof cachedSubscriber>>][] = []
  for (const row of rows.value) {
    const sub = cachedSubscriber(row.user_id)
    if (sub) remembered.push([row.user_id, sub])
  }
  return new Map(remembered)
})
const pillById = computed(() => new Map([...pushById.value].map(([id, sub]) => [id, subscriberPill(sub)])))
const pushNote = computed(() => {
  const error = pushState.error.value
  if (!error) return ''
  return serviceProblem(error) ? 'Notifications are not connected on this database.' : 'Could not read notification state from OneSignal.'
})
const total = computed(() => users.data.value?.total ?? 0)
/** Nothing has answered yet, so `total` is a placeholder rather than a count. */
const countUnknown = computed(() => users.data.value === null)
const error = computed(() => (users.error.value ? describeError(users.error.value).detail : ''))

function open(row: AdminUserRow) {
  void router.push(`/users/${encodeURIComponent(row.user_id)}`)
}

/** Inactive for longer than this reads as dormant rather than quiet. */
const DORMANT_DAYS = 30

function activityTone(lastActive: string): 'good' | 'idle' {
  const days = (Date.now() - new Date(lastActive).getTime()) / 86_400_000
  return days <= DORMANT_DAYS ? 'good' : 'idle'
}
</script>

<template>
  <div class="page">
    <PageHeader
      title="Users"
      description="Every profile on this database, and whether each person can be sent a notification. First seen and last active are derived rather than recorded: nothing logs a signup or a session."
      :fetched-at="users.fetchedAt.value"
      :busy="users.fetching.value"
      @refresh="users.refetch"
    />

    <PanelCard title="Accounts" :note="pushNote || 'Open one to see its lists and what it has done.'" flush>
      <div class="u-toolbar">
        <FilterBar
          v-model="query"
          placeholder="Search by name or Clerk id"
          :busy="users.fetching.value"
        >
          <template #end>
            <!-- Withheld until it is known: see the note in TablePager. -->
            <span v-if="!countUnknown" class="u-toolbar__count u-num">
              {{ formatCount(total) }} accounts<template v-if="clerkTotal.data.value != null">
                · {{ formatCount(clerkTotal.data.value) }} in Clerk</template>
            </span>
          </template>
        </FilterBar>
      </div>

      <DataTable
        :columns="columns"
        :rows="rows"
        row-key="user_id"
        :sort="sort"
        :dir="dir"
        :loading="users.loading.value"
        :error="error"
        clickable
        empty-title="No accounts match"
        empty-message="Clear the search, or check that you are pointed at the database you meant."
        @sort="onSort"
        @select="open"
      >
        <template #cell-display_name="{ row }">
          <div class="who">
            <!-- Not linked: the whole row is already the way in, and a link
                 inside a row that navigates on click is one target too many. -->
            <UserChip
              :id="String(row.user_id)"
              :name="row.display_name ? String(row.display_name) : null"
              :src="row.image_url ? String(row.image_url) : null"
              :link="false"
            />
            <StatusPill v-if="row.is_admin" tone="accent" label="Admin" :dot="false" />
            <StatusPill v-if="Number(row.owned_lists) > 0" tone="idle" label="Owner" :dot="false" />
          </div>
        </template>

        <template #cell-user_id="{ row }">
          <!-- The copy button is the focusable part, so the card opens from it. -->
          <UserId :id="String(row.user_id)" wraps>
            <CopyValue :value="String(row.user_id)" :display="shortUserId(String(row.user_id))" label="Clerk id" />
          </UserId>
        </template>

        <template #cell-push="{ row }">
          <StatusPill
            v-if="pillById.get(String(row.user_id))"
            :tone="pillById.get(String(row.user_id))!.tone"
            :label="pillById.get(String(row.user_id))!.label"
            :title="pillById.get(String(row.user_id))!.title"
          />
          <span v-else class="u-muted" :title="pushNote" :aria-busy="pushState.fetching.value">{{ pushState.fetching.value ? '…' : '–' }}</span>
        </template>

        <template #cell-telemetry="{ row }">
          <StatusPill v-if="replayById.has(String(row.user_id))" :tone="replayById.get(String(row.user_id)) ? 'good' : 'idle'" :label="replayById.get(String(row.user_id)) ? 'On' : 'Off'" />
          <span v-else class="u-muted">{{ replayState.fetching.value ? '…' : '–' }}</span>
        </template>

        <template #cell-devices="{ row }">
          <span class="u-truncate">{{ deviceSummary(pushById.get(String(row.user_id))?.devices ?? []) }}</span>
        </template>

        <template #cell-first_seen="{ row }">
          <span :title="formatDateTime(String(row.first_seen))">{{ formatRelative(String(row.first_seen)) }}</span>
        </template>

        <template #cell-last_active="{ row }">
          <span class="last" :title="formatDateTime(String(row.last_active))">
            <StatusPill
              :tone="activityTone(String(row.last_active))"
              :label="formatRelative(String(row.last_active))"
            />
          </span>
        </template>
      </DataTable>

      <template #footer>
        <TablePager
          :total="total"
          :offset="offset"
          :limit="limit"
          :loading="users.fetching.value"
          @go="offset = $event"
        />
      </template>
    </PanelCard>
  </div>
</template>

<style scoped>
.who {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  min-width: 0;
}

.last {
  display: inline-flex;
}
</style>
