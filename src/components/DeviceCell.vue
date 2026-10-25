<script setup lang="ts">
import { computed, type PropType } from 'vue'
import { deviceRows, type PushDevice } from '../lib/data/services'
import HoverCard from './HoverCard.vue'

// The Devices and Version cells of the Users table. Both show the person's first
// device (newest app first); a person with more gets a [+N] chip whose card lists
// every device with its version, so the two columns read the same list.

const props = defineProps({
  devices: { type: Array as PropType<PushDevice[]>, required: true },
  show: { type: String as PropType<'label' | 'version'>, required: true },
  /** Shown in the version cell when no device reports one (PostHog's last sighting). */
  fallback: { type: String, default: undefined },
})

const rows = computed(() => deviceRows(props.devices))
const first = computed(() => rows.value[0]?.[props.show] || (props.show === 'version' ? props.fallback : '') || '–')
</script>

<template>
  <span class="cell">
    <span class="cell__text u-truncate">{{ first }}</span>
    <HoverCard v-if="rows.length > 1" :focusable="true">
      <span class="cell__more">+{{ rows.length - 1 }}</span>
      <template #card>
        <ul class="cell__list">
          <li v-for="row in rows" :key="row.label">
            <span>{{ row.label }}</span>
            <span class="cell__version">{{ row.version || '–' }}</span>
          </li>
        </ul>
      </template>
    </HoverCard>
  </span>
</template>

<style scoped>
.cell {
  display: flex;
  align-items: center;
  gap: var(--space-1-5);
  min-width: 0;
}

.cell__text {
  min-width: 0;
}

.cell__more {
  padding: 0.1rem var(--space-1-5);
  border: var(--border-width-thin) solid var(--border-main);
  border-radius: var(--radius-pill);
  font-size: var(--text-2xs);
  font-weight: var(--weight-semibold);
  color: var(--text-secondary);
}

.cell__list {
  display: grid;
  gap: var(--space-1-5);
  margin: 0;
  padding: 0;
  list-style: none;
}

.cell__list li {
  display: flex;
  justify-content: space-between;
  gap: var(--space-4);
  white-space: nowrap;
}

.cell__version {
  color: var(--text-secondary);
}
</style>
