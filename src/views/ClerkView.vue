<script setup lang="ts">
import { computed, ref } from 'vue'
import PageHeader from '../components/PageHeader.vue'
import PanelCard from '../components/PanelCard.vue'
import DataTable from '../components/DataTable.vue'
import StateBlock from '../components/StateBlock.vue'
import FilterBar from '../components/FilterBar.vue'
import ClerkAccountActions from '../components/ClerkAccountActions.vue'
import { banState } from '../lib/banAccount'
import { fetchBannedUsers } from '../lib/data/users'
import StatusPill from '../components/StatusPill.vue'
import UserChip from '../components/UserChip.vue'
import { useQuery, describeError } from '../lib/useQuery'
import MethodBadges from '../components/MethodBadges.vue'
import { DASHBOARDS, fetchClerkSummary, searchClerkUsers, serviceProblem, type ClerkUser } from '../lib/data/services'
import type { Column } from '../lib/uiTypes'
import { formatDateTime, formatRelative } from '../lib/format'

// Clerk: the accounts as the sign-in service knows them.
//
// What an admin can do to an account's sessions lives in ClerkAccountActions. There
// is no Ban here: the one ban (Bagful and Clerk together) is on the person's page and
// in Bans. This page only shows where an account stands.
//
// There is one Clerk instance for both app projects, so the accounts here are
// the same on either. A row links to the person's page on the project being
// read, which says so when that project has never seen them.

const summary = useQuery((signal) => fetchClerkSummary(signal))
// Bagful's side of the one ban, so a row says Banned only when both doors are shut
// and calls a half-ban what it is. Failing to read it just leaves the rows as Clerk sees them.
const appBans = useQuery((signal) => fetchBannedUsers(signal))
const appBannedIds = computed(() => new Set((appBans.data.value ?? []).map((row) => row.user_id)))
const banOf = (user: ClerkUser) => banState(appBannedIds.value.has(user.id), user.banned)

const problem = computed(() => serviceProblem(summary.error.value))
const loadError = computed(() => {
  const error = summary.error.value
  return error && !problem.value ? describeError(error).detail : ''
})

// A search asks Clerk itself, so it finds accounts that never signed in recently
// and not only the 25 the summary lists.
const query = ref('')
const searching = computed(() => query.value.trim().length > 0)
const search = useQuery((signal) => searchClerkUsers(query.value.trim(), signal), {
  watch: [query],
  enabled: () => searching.value,
})

const shown = computed(() => (searching.value ? (search.data.value ?? []) : (summary.data.value?.recent ?? [])))

function refreshAll() {
  void appBans.refetch()
  void summary.refetch()
  if (searching.value) void search.refetch()
}

const columns: Column<ClerkUser>[] = [
  { key: 'name', label: 'Account', width: '20%' },
  { key: 'email', label: 'Email', width: '22%', hideBelow: 1100 },
  { key: 'methods', label: 'Signs in with', width: '12%' },
  { key: 'lastSignInAt', label: 'Last sign-in', width: '11%' },
  { key: 'createdAt', label: 'Created', width: '9%', hideBelow: 1400 },
  { key: 'actions', label: '', width: '26%' },
]

const asUser = (row: unknown) => row as ClerkUser
</script>

<template>
  <div class="page">
    <PageHeader
      :dashboard="DASHBOARDS.clerk"
      title="Clerk"
      description="Accounts in the sign-in service, which both app projects share."
      :fetched-at="summary.fetchedAt.value"
      :busy="summary.fetching.value"
      @refresh="refreshAll"
    />

    <PanelCard v-if="problem" title="Clerk">
      <StateBlock state="empty" :title="problem.title" :message="problem.message" />
    </PanelCard>

    <template v-else>
      <PanelCard flush>
        <div class="u-toolbar">
          <FilterBar v-model="query" placeholder="Search by email or name" :busy="search.fetching.value" />
        </div>
        <DataTable
          :columns="columns"
          :rows="shown"
          row-key="id"
          :loading="searching ? search.loading.value : summary.loading.value"
          :error="searching && search.error.value ? describeError(search.error.value).detail : loadError"
          :empty-title="searching ? 'No account matches' : 'No accounts'"
          :empty-message="searching ? 'Try part of an email address, or a first name.' : 'Nobody has signed up to this Clerk instance yet.'"
        >
          <template #cell-name="{ row }">
            <span class="clerk__who">
              <UserChip :id="asUser(row).id" :name="asUser(row).name" :src="asUser(row).imageUrl" />
              <StatusPill v-if="banOf(asUser(row))" :tone="banOf(asUser(row))!.tone" :label="banOf(asUser(row))!.label" :title="banOf(asUser(row))!.title" />
              <StatusPill v-else-if="asUser(row).locked" tone="warn" label="Locked" />
            </span>
          </template>
          <template #cell-email="{ row }">
            <span class="u-truncate clerk__email">{{ asUser(row).email ?? '' }}</span>
          </template>
          <template #cell-methods="{ row }"><MethodBadges :methods="asUser(row).methods" /></template>
          <template #cell-lastSignInAt="{ row }">
            <time v-if="asUser(row).lastSignInAt" :title="formatDateTime(asUser(row).lastSignInAt)">
              {{ formatRelative(asUser(row).lastSignInAt) }}
            </time>
            <span v-else class="u-muted">Never</span>
          </template>
          <template #cell-actions="{ row }">
            <div class="clerk__actions">
              <ClerkAccountActions :user="asUser(row)" @changed="refreshAll" />
            </div>
          </template>
          <template #cell-createdAt="{ row }">
            <time v-if="asUser(row).createdAt" :title="formatDateTime(asUser(row).createdAt)">
              {{ formatRelative(asUser(row).createdAt) }}
            </time>
          </template>
        </DataTable>
      </PanelCard>
    </template>
  </div>
</template>

<style scoped>
/* A span is inline and cannot be clipped: without this a long address ran under the next column. */
.clerk__email {
  display: block;
}

/* Pushed to the end of the row, so the buttons line up with the right edge of
   the card whatever the column widths do. */
.clerk__actions {
  display: flex;
  justify-content: flex-end;
}

.clerk__who {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  min-width: 0;
}
</style>
