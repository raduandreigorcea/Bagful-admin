<script setup lang="ts">
import { computed, ref } from 'vue'
import { useUser } from '@clerk/vue'
import PageHeader from '../components/PageHeader.vue'
import PanelCard from '../components/PanelCard.vue'
import DataTable from '../components/DataTable.vue'
import StateBlock from '../components/StateBlock.vue'
import StatTile from '../components/StatTile.vue'
import StatusPill from '../components/StatusPill.vue'
import SegmentedControl from '../components/SegmentedControl.vue'
import ConfirmDialog from '../components/ConfirmDialog.vue'
import { useQuery, describeError } from '../lib/useQuery'
import {
  fetchPushNotifications,
  pushKind,
  pushStates,
  pushTotals,
  serviceProblem,
  type PushKind,
  type PushNotification,
  DASHBOARDS,
  sendTestPush,
} from '../lib/data/services'
import type { Column } from '../lib/uiTypes'
import { formatCount, formatDate, formatDateTime, formatRelative } from '../lib/format'

// OneSignal: the push notifications this project sent, and whether they arrived.
//
// Before this page a failed push was invisible. push-on-item-insert writes
// nothing to a table, and its failures only reach the edge function's logs, so
// Health can say nothing about push. OneSignal keeps the count per notification.
//
// Follows the project switcher. bagful-dev has no push on purpose (its webhook
// is unset and it holds no OneSignal secrets), so there this page says it is
// not connected, which is the true answer.

const notifications = useQuery((signal) => fetchPushNotifications(signal))

const problem = computed(() => serviceProblem(notifications.error.value))
const loadError = computed(() => {
  const error = notifications.error.value
  return error && !problem.value ? describeError(error).detail : ''
})

// Which kind of notification is on screen. Names only, like the Bans toggle.
type Scope = 'all' | PushKind
const scope = ref<Scope>('all')
const segments = [
  { value: 'all', label: 'All' },
  { value: 'added', label: 'Added', title: 'Somebody added an item to a list' },
  { value: 'bought', label: 'Bought', title: 'Somebody checked out a list' },
  { value: 'test', label: 'Tests', title: 'Sent from this dashboard' },
]
function setScope(next: string) {
  scope.value = next === 'added' || next === 'bought' || next === 'test' ? next : 'all'
}

const all = computed(() => notifications.data.value ?? [])
const rows = computed(() => (scope.value === 'all' ? all.value : all.value.filter((row) => pushKind(row.text) === scope.value)))
// Totals follow the whole list, not the filter: the tiles describe the project,
// the filter only narrows the table.
const totals = computed(() => (notifications.data.value ? pushTotals(all.value) : null))
// The period the tiles cover. OneSignal returns the newest 50 with no date range,
// so the only honest answer to "since when" is the oldest one it sent back.
const since = computed(() => {
  const stamps = all.value.map((row) => row.at).filter((at): at is string => at !== null).sort()
  return stamps.length ? formatDate(stamps[0]) : ''
})
const notDelivered = computed(() => (totals.value ? totals.value.unsubscribed + totals.value.errored : null))

const columns: Column<PushNotification>[] = [
  { key: 'kind', label: 'Type', width: '9%' },
  { key: 'text', label: 'Notification', width: '47%' },
  { key: 'at', label: 'Sent', width: '16%' },
  { key: 'delivered', label: 'Delivered', numeric: true, width: '10%' },
  { key: 'status', label: 'Status', width: '18%', title: 'Per device, as OneSignal counts them. Hover a pill for what it means.' },
]

// Not green: Delivered is green, and a type pill the same colour as a state pill
// reads as a second status.
const KINDS: Record<PushKind, { label: string; tone: 'live' | 'warn' | 'idle' }> = {
  added: { label: 'Added', tone: 'live' },
  bought: { label: 'Bought', tone: 'warn' },
  test: { label: 'Test', tone: 'idle' },
}

const asRow = (row: unknown) => row as PushNotification

// A test notification to one phone, to check push works end to end without
// waiting for somebody to add an item. OneSignal knows a device by its owner's
// Clerk id, so that is what is asked for. It starts as the signed-in admin's own.
const { user: me } = useUser()
// The same shape the edge function accepts; checked here so a typo is caught
// before the round trip.
const CLERK_ID = /^user_[A-Za-z0-9]{10,64}$/

const testOpen = ref(false)
const testId = ref('')
const testBusy = ref(false)
const testError = ref('')
const testNotice = ref<{ title: string; message: string } | null>(null)

function openTest() {
  testId.value = me.value?.id ?? ''
  testError.value = ''
  testOpen.value = true
}

function closeTest() {
  if (!testBusy.value) testOpen.value = false
}

async function sendTest() {
  if (testBusy.value) return
  const id = testId.value.trim()
  if (!CLERK_ID.test(id)) {
    testError.value = 'That is not a Clerk ID. It is "user_" followed by letters and digits.'
    return
  }
  testBusy.value = true
  testError.value = ''
  try {
    const { sent } = await sendTestPush(id, new AbortController().signal)
    testOpen.value = false
    testNotice.value = sent
      ? { title: 'Test notification sent', message: 'It should reach the phone in a few seconds.' }
      : { title: 'Nobody to send to', message: 'That account has no phone subscribed to notifications on this project, so nothing was delivered.' }
    void notifications.refetch()
  } catch (caught) {
    testError.value = caught instanceof Error ? caught.message : String(caught)
  } finally {
    testBusy.value = false
  }
}
</script>

<template>
  <div class="page">
    <PageHeader
      :dashboard="DASHBOARDS.onesignal"
      title="OneSignal"
      description="Push notifications this project sent, newest first, and whether they were delivered to devices."
      :fetched-at="notifications.fetchedAt.value"
      :busy="notifications.fetching.value"
      @refresh="notifications.refetch"
    >
      <template #tools>
        <button type="button" class="u-btn" title="Send a test notification to a phone" @click="openTest">
          Test notification
        </button>
      </template>
    </PageHeader>

    <PanelCard v-if="problem" title="OneSignal">
      <StateBlock state="empty" :title="problem.title" :message="problem.message" />
    </PanelCard>

    <template v-else>
      <div class="grid">
        <div class="span-4">
          <StatTile
            label="Notifications"
            :value="notifications.data.value ? all.length : null"
            :hint="since ? `Sent since ${since} (OneSignal returns the newest 50 at most)` : ''"
            :loading="notifications.loading.value"
          />
        </div>
        <div class="span-4">
          <StatTile
            label="Delivered"
            :value="totals?.delivered ?? null"
            hint="Device deliveries: one per device, per notification"
            :loading="notifications.loading.value"
          />
        </div>
        <div class="span-4">
          <StatTile
            label="Not delivered"
            :value="notDelivered"
            :hint="totals ? `${formatCount(totals.unsubscribed)} unsubscribed devices, ${formatCount(totals.errored)} failed` : ''"
            polarity="down-good"
            :loading="notifications.loading.value"
          />
        </div>
      </div>

      <PanelCard
        title="Notifications"
        note="Newest first. One goes out for every item added and one for every checkout."
        :busy="notifications.fetching.value && !notifications.loading.value"
        flush
      >
        <template #actions>
          <SegmentedControl :model-value="scope" :segments="segments" aria-label="Which notifications" @update:model-value="setScope" />
        </template>
        <DataTable
          :columns="columns"
          :rows="rows"
          row-key="id"
          :loading="notifications.loading.value"
          :error="loadError"
          :empty-title="scope === 'all' ? 'Nothing sent yet' : 'None of this kind'"
          :empty-message="scope === 'all' ? 'OneSignal has no notifications for this app.' : 'Switch to All to see everything it sent.'"
        >
          <template #cell-kind="{ row }">
            <StatusPill
              v-if="pushKind(asRow(row).text)"
              :tone="KINDS[pushKind(asRow(row).text)!].tone"
              :label="KINDS[pushKind(asRow(row).text)!].label"
            />
          </template>
          <template #cell-text="{ row }">
            <span class="u-truncate push__text" :title="asRow(row).text">{{ asRow(row).text || '(no text)' }}</span>
          </template>
          <template #cell-at="{ row }">
            <time v-if="asRow(row).at" :title="formatDateTime(asRow(row).at)">{{ formatRelative(asRow(row).at) }}</time>
          </template>
          <template #cell-delivered="{ row }">{{ formatCount(asRow(row).delivered) }}</template>
          <template #cell-status="{ row }">
            <span class="push__states">
              <StatusPill
                v-for="state in pushStates(asRow(row))"
                :key="state.label"
                :tone="state.tone"
                :label="state.label"
                :title="state.title"
                :busy="state.tone === 'live'"
              />
            </span>
          </template>
        </DataTable>
      </PanelCard>
    </template>

    <ConfirmDialog
      :open="testOpen"
      title="Send a test notification"
      message="The phone gets a push that says it is a test. It does nothing else."
      confirm-label="Send"
      :busy="testBusy"
      :error="testError"
      focus-selector="input"
      @confirm="sendTest"
      @cancel="closeTest"
    >
      <label class="os__field">
        <span class="os__label">Clerk ID</span>
        <input
          v-model="testId"
          class="os__input"
          placeholder="user_..."
          autocomplete="off"
          spellcheck="false"
          :disabled="testBusy"
          @keydown.enter.prevent="sendTest"
        />
        <span class="os__hint">Starts as yours. Copy someone else's from their page under Users.</span>
      </label>
    </ConfirmDialog>

    <ConfirmDialog
      :open="testNotice !== null"
      :title="testNotice?.title ?? ''"
      :message="testNotice?.message ?? ''"
      confirm-label="OK"
      hide-cancel
      @confirm="testNotice = null"
      @cancel="testNotice = null"
    />
  </div>
</template>

<style scoped>
.os__field {
  display: grid;
  gap: var(--space-1-5);
  margin-top: var(--space-3);
}

.os__label {
  font-size: var(--text-xs);
  font-weight: var(--weight-semibold);
  color: var(--text-primary);
}

.os__input {
  width: 100%;
  padding: var(--space-2);
  font: inherit;
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  border: var(--border-width-thin) solid var(--border-main);
  border-radius: var(--radius-md);
  background: var(--bg-main);
  color: var(--text-primary);
}

.os__hint {
  font-size: var(--text-2xs);
  color: var(--text-disabled);
}

.push__text {
  display: block;
  color: var(--text-primary);
}

.push__states {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-1-5);
}
</style>
