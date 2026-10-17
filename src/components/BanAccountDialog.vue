<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useUser } from '@clerk/vue'
import ConfirmDialog from './ConfirmDialog.vue'
import UserAvatar from './UserAvatar.vue'
import FilterBar from './FilterBar.vue'
import { useQuery } from '../lib/useQuery'
import { banUser, fetchUsers } from '../lib/data/users'
import { banClerkUser } from '../lib/data/services'
import type { AdminUserRow } from '../lib/data/types'

// Bans an account in the app and in Clerk in one go.
//
// They are two different refusals. The app's ban stops the account opening
// Bagful and keeps its lists; Clerk's stops it signing in at all and ends its
// sessions. Doing both used to mean two pages and two dialogs, so this does them
// together, each on by default and each switchable off for the case where only
// one is wanted.
//
// The app goes first: it is the one this dashboard owns and the one a reader of
// the Bans page sees. If Clerk then fails, the app ban STANDS and the dialog says
// so, with the app box locked, so pressing the button again retries only Clerk.

const props = defineProps({ open: { type: Boolean, default: false } })
const emit = defineEmits<{ (e: 'close'): void; (e: 'banned'): void }>()

const { user: me } = useUser()

const query = ref('')
const picked = ref<AdminUserRow | null>(null)
const reason = ref('')
const inApp = ref(true)
const inClerk = ref(true)
const appDone = ref(false)
const busy = ref(false)
const error = ref('')

// Typing finds people; nothing is fetched until there is something to find.
const results = useQuery(
  (signal) => fetchUsers({ query: query.value, limit: 6, sort: 'last_active', dir: 'desc' }, signal),
  { watch: [query], enabled: () => props.open && !picked.value && query.value.trim().length >= 2 },
)
// Never offered: banning yourself locks you out, and the server refuses it.
const found = computed(() => (results.data.value?.rows ?? []).filter((row) => row.user_id !== me.value?.id))
const searched = computed(() => query.value.trim().length >= 2 && results.data.value !== null)

watch(
  () => props.open,
  (open) => {
    if (!open) return
    query.value = ''
    picked.value = null
    reason.value = ''
    inApp.value = true
    inClerk.value = true
    appDone.value = false
    error.value = ''
  },
)

function pick(row: AdminUserRow) {
  picked.value = row
  error.value = ''
}

const name = computed(() => picked.value?.display_name || 'this account')
const canSubmit = computed(() => Boolean(picked.value) && (inApp.value || inClerk.value))

const confirmLabel = computed(() => {
  if (inApp.value && inClerk.value) return 'Ban in both'
  return inApp.value ? 'Ban in the app' : 'Ban in Clerk'
})

async function run() {
  const target = picked.value
  if (!target) return
  if (!canSubmit.value) {
    error.value = 'Pick at least one place to ban the account.'
    return
  }
  if (busy.value) return
  busy.value = true
  error.value = ''
  const signal = new AbortController().signal
  try {
    if (inApp.value && !appDone.value) {
      await banUser(target.user_id, reason.value.trim(), signal)
      appDone.value = true
      emit('banned')
    }
  } catch (caught) {
    error.value = caught instanceof Error ? caught.message : String(caught)
    busy.value = false
    return
  }
  try {
    if (inClerk.value) await banClerkUser(target.user_id, signal)
    emit('close')
  } catch (caught) {
    const why = caught instanceof Error ? caught.message : String(caught)
    error.value = appDone.value
      ? `Banned in the app, but Clerk refused: ${why} Press again to retry Clerk only.`
      : why
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <ConfirmDialog
    :open="open"
    title="Ban an account"
    :message="picked
      ? `${name} will be refused wherever you leave a box ticked. Nothing is deleted, and lifting a ban puts them straight back.`
      : 'Find the account by name, then choose where to ban it.'"
    :confirm-label="confirmLabel"
    tone="danger"
    :busy="busy"
    :error="error"
    :confirm-disabled="!canSubmit"
    focus-selector="input"
    @confirm="run"
    @cancel="emit('close')"
  >
    <div v-if="!picked" class="ban__find">
      <FilterBar v-model="query" placeholder="Search by name" :busy="results.fetching.value" />
      <ul v-if="found.length" class="ban__results">
        <li v-for="row in found" :key="row.user_id">
          <button type="button" class="ban__row" @click="pick(row)">
            <UserAvatar :id="row.user_id" :src="row.image_url" :name="row.display_name" :size="22" />
            <span class="u-truncate">{{ row.display_name }}</span>
          </button>
        </li>
      </ul>
      <p v-else-if="searched" class="ban__none">No account matches.</p>
    </div>

    <template v-else>
      <div class="ban__picked">
        <UserAvatar :id="picked.user_id" :src="picked.image_url" :name="picked.display_name" :size="22" />
        <span class="ban__name u-truncate">{{ picked.display_name }}</span>
        <button type="button" class="ban__change" :disabled="busy || appDone" @click="picked = null">Change</button>
      </div>

      <fieldset class="ban__where" :disabled="busy">
        <legend class="u-sr">Where to ban</legend>
        <label class="ban__check">
          <input v-model="inApp" type="checkbox" :disabled="appDone" />
          <span>
            <strong>Bagful</strong>
            <small>{{ appDone ? 'Already banned' : 'Refused at the door. Their lists stay.' }}</small>
          </span>
        </label>
        <label class="ban__check">
          <input v-model="inClerk" type="checkbox" />
          <span>
            <strong>Clerk</strong>
            <small>Cannot sign in, and every session ends.</small>
          </span>
        </label>
      </fieldset>

      <input
        v-model="reason"
        class="ban__reason"
        type="text"
        placeholder="Why? This goes into the audit trail."
        aria-label="Reason"
        :disabled="busy || appDone"
        @keydown.enter.prevent="run"
      />
    </template>
  </ConfirmDialog>
</template>

<style scoped>
.ban__find,
.ban__picked,
.ban__where,
.ban__reason {
  margin-top: var(--space-3);
}

.ban__results {
  margin: var(--space-2) 0 0;
  padding: 0;
  list-style: none;
}

.ban__row {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  width: 100%;
  padding: var(--space-2);
  background: none;
  border: 0;
  border-radius: var(--radius-sm);
  font: inherit;
  font-size: var(--text-sm);
  color: var(--text-primary);
  text-align: left;
  cursor: pointer;
}

.ban__row:hover {
  background: var(--bg-main);
}

.ban__none {
  margin: var(--space-2) 0 0;
  font-size: var(--text-sm);
  color: var(--text-secondary);
}

.ban__picked {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  min-width: 0;
}

.ban__name {
  font-weight: var(--weight-semibold);
  color: var(--text-primary);
}

.ban__change {
  margin-inline-start: auto;
  background: none;
  border: 0;
  font: inherit;
  font-size: var(--text-xs);
  color: var(--color-primary);
  cursor: pointer;
}

.ban__where {
  display: grid;
  gap: var(--space-2);
  padding: 0;
  border: 0;
}

.ban__check {
  display: flex;
  align-items: flex-start;
  gap: var(--space-2);
  font-size: var(--text-sm);
  color: var(--text-primary);
  cursor: pointer;
}

.ban__check input {
  margin-top: 3px;
}

.ban__check span {
  display: grid;
}

.ban__check small {
  font-size: var(--text-xs);
  color: var(--text-secondary);
}

.ban__reason {
  width: 100%;
  height: 34px;
  padding: 0 var(--space-3);
  background: var(--bg-surface);
  border: var(--border-width-thin) solid var(--border-main);
  border-radius: var(--radius-md);
  font-size: var(--text-sm);
  color: var(--text-primary);
  outline: none;
}

.ban__reason:focus {
  border-color: var(--color-primary);
  box-shadow: var(--focus-ring-primary);
}
</style>
