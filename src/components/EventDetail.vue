<script setup lang="ts">
import { computed } from 'vue'
import UserId from './UserId.vue'

// A security event's `detail` jsonb, on one line: `role: member · target: user_…`.
//
// It used to be JSON.stringify'd whole, which put a raw Clerk id in the middle
// of a code string -- the one place in the dashboard where an account showed up
// with no way to find out whose it was. Any value shaped like a Clerk id now
// gets the same hover card every other id here has. Nested values stay JSON:
// they are rare and there is nothing to link inside them.

const props = defineProps({
  detail: { type: null, default: null },
})

const CLERK_ID = /^user_[A-Za-z0-9]{10,64}$/

const entries = computed(() => {
  const detail = props.detail
  if (!detail || typeof detail !== 'object' || Array.isArray(detail)) return null
  return Object.entries(detail as Record<string, unknown>).map(([key, value]) => ({
    key,
    user: typeof value === 'string' && CLERK_ID.test(value) ? value : null,
    text: typeof value === 'string' ? value : JSON.stringify(value),
  }))
})
</script>

<template>
  <code class="event-detail u-mono u-truncate">
    <template v-if="entries">
      <template v-for="(entry, index) in entries" :key="entry.key">
        <span v-if="index" class="event-detail__sep"> · </span>
        <span class="event-detail__key">{{ `${entry.key}: ` }}</span>
        <UserId v-if="entry.user" :id="entry.user" /><template v-else>{{ entry.text }}</template>
      </template>
    </template>
    <template v-else>{{ JSON.stringify(detail) }}</template>
  </code>
</template>

<style scoped>
.event-detail {
  display: block;
  font-size: var(--text-2xs);
  color: var(--text-secondary);
}

.event-detail__key {
  color: var(--text-disabled);
}

.event-detail__sep {
  opacity: 0.6;
}
</style>
