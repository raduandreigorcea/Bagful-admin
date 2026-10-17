<script setup lang="ts">
import { computed, ref, type PropType } from 'vue'
import { useUser } from '@clerk/vue'
import ConfirmDialog from './ConfirmDialog.vue'
import { impersonateClerkUser, revokeClerkSessions, type ClerkUser } from '../lib/data/services'

// What an admin can do to an account's SESSIONS, wherever an account is shown.
//
// The same buttons on the Clerk page's rows and on a person's own page, so
// there is one place that knows what each one asks, what it says before it runs
// and what it says after. Signing out everywhere and impersonating confirm first
// and name the person.
//
// Banning is NOT here. There is one ban, and it belongs on the person's own page
// (UserDetailView), where it closes Bagful and Clerk together. A second Ban button
// on the Clerk list was the way to end up with half a ban.
//
// On your OWN account impersonate is left out (it would sign you in as yourself).
// admin-services refuses it as well, but a button that can only fail is a worse
// answer than no button. Signing yourself out everywhere is allowed.
//
// A test notification is not here: it is a push check, so it lives on the OneSignal page.

type Kind = 'sessions' | 'impersonate'

const props = defineProps({
  user: { type: Object as PropType<ClerkUser>, required: true },
})

const emit = defineEmits<{ (e: 'changed'): void }>()

const { user: me } = useUser()
const isSelf = computed(() => me.value?.id === props.user.id)
const who = computed(() => props.user.name || props.user.email || 'this account')

const pending = ref<Kind | null>(null)
const busy = ref(false)
const error = ref('')
/** Shown after an action, until dismissed. `link` is an impersonation URL. */
const notice = ref<{ title: string; message: string; link?: string } | null>(null)
const copied = ref(false)

const COPY: Record<Kind, { title: string; message: string; confirm: string; tone: 'primary' | 'danger' }> = {
  sessions: {
    title: 'Sign out everywhere?',
    message: 'Ends every active session on every device. They can sign in again whenever they like.',
    confirm: 'Sign out',
    tone: 'danger',
  },
  impersonate: {
    title: 'Impersonate this account?',
    message:
      'Creates a one-time sign-in link, valid for ten minutes, that opens Bagful as them. Open it in a private window: on this browser it would replace your own admin session. Anyone holding the link can sign in as them.',
    confirm: 'Create link',
    tone: 'danger',
  },
}

const dialog = computed(() => (pending.value ? COPY[pending.value] : null))

function dismiss() {
  if (busy.value) return
  pending.value = null
  error.value = ''
}

async function run() {
  const kind = pending.value
  if (!kind || busy.value) return
  busy.value = true
  error.value = ''
  const signal = new AbortController().signal
  try {
    if (kind === 'sessions') {
      const { revoked } = await revokeClerkSessions(props.user.id, signal)
      notice.value = {
        title: 'Signed out',
        message: revoked === 0 ? `${who.value} had no active sessions.` : `Ended ${revoked} active session${revoked === 1 ? '' : 's'}.`,
      }
    } else {
      const { url } = await impersonateClerkUser(props.user.id, signal)
      notice.value = url
        ? { title: 'Link ready', message: `Open it in a private window to be ${who.value}. It works once, for ten minutes.`, link: url }
        : { title: 'No link came back', message: 'Clerk did not return a sign-in link.' }
    }
    pending.value = null
    emit('changed')
  } catch (caught) {
    error.value = caught instanceof Error ? caught.message : String(caught)
  } finally {
    busy.value = false
  }
}

async function copyLink() {
  if (!notice.value?.link) return
  try {
    await navigator.clipboard.writeText(notice.value.link)
    copied.value = true
    setTimeout(() => (copied.value = false), 1500)
  } catch {
    // Clipboard blocked: the link is selectable in the field above the button.
  }
}

function closeNotice() {
  notice.value = null
  copied.value = false
}
</script>

<template>
  <span class="actions">
    <button v-if="!isSelf" type="button" class="u-btn" @click="pending = 'impersonate'">Impersonate</button>
    <button type="button" class="u-btn" @click="pending = 'sessions'">Sign out</button>
  </span>

  <ConfirmDialog
    :open="pending !== null"
    :title="dialog?.title ?? ''"
    :message="dialog ? `${dialog.message}` : ''"
    :confirm-label="dialog?.confirm ?? 'Confirm'"
    :tone="dialog?.tone ?? 'primary'"
    :busy="busy"
    :error="error"
    @confirm="run"
    @cancel="dismiss"
  >
    <p class="actions__who">{{ who }}<span v-if="user.email && user.name"> · {{ user.email }}</span></p>
  </ConfirmDialog>

  <ConfirmDialog
    :open="notice !== null"
    :title="notice?.title ?? ''"
    :message="notice?.message ?? ''"
    :confirm-label="notice?.link ? (copied ? 'Copied' : 'Copy link') : 'OK'"
    :hide-cancel="!notice?.link"
    @confirm="notice?.link ? copyLink() : closeNotice()"
    @cancel="closeNotice"
  >
    <input v-if="notice?.link" class="actions__link" readonly :value="notice.link" @focus="($event.target as HTMLInputElement).select()" />
  </ConfirmDialog>
</template>

<style scoped>
/* One row that does not wrap: a ragged second line made the rows uneven. The
   gap is wider than the buttons' own padding so each reads as separate. */
.actions {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
}

.actions__who {
  margin: var(--space-2) 0 0;
  font-weight: var(--weight-semibold);
  color: var(--text-primary);
  word-break: break-word;
}

.actions__link {
  width: 100%;
  margin-top: var(--space-3);
  padding: var(--space-2);
  font: inherit;
  font-size: var(--text-xs);
  border: var(--border-width-thin) solid var(--border-main);
  border-radius: var(--radius-md);
  background: var(--bg-main);
  color: var(--text-primary);
}
</style>
