<script setup lang="ts">
import { computed, ref } from 'vue'
import type { Bar } from '../lib/uiTypes'

// Shares of one whole, as a donut with its legend beside it.
//
// Eleven slices at most, one per hue in admin.css (one per market). Past that
// the rest fold into a grey Other rather than inventing a twelfth colour. Every
// slice is named in the legend with its share, so the colour never carries the
// identity alone.

const props = defineProps({
  bars: { type: Array as () => Bar[], required: true },
  format: { type: Function as unknown as () => (n: number) => string, default: () => (n: number) => String(n) },
})

const HUES = Array.from({ length: 11 }, (_, i) => `var(--chart-${i + 1})`)
const R = 40
const CIRCUMFERENCE = 2 * Math.PI * R
/** The 2px surface gap between slices, in the 100-unit viewBox. */
const GAP = 1.5

const hovered = ref<string | null>(null)

const slices = computed(() => {
  const sorted = [...props.bars].filter((b) => b.value > 0).sort((a, b) => b.value - a.value)
  const kept = sorted.length > HUES.length ? sorted.slice(0, HUES.length - 1) : sorted
  const rest = sorted.slice(kept.length)
  const rows = rest.length
    ? [...kept, { key: '__other', label: `Other (${rest.length})`, value: rest.reduce((s, b) => s + b.value, 0) }]
    : kept
  const total = rows.reduce((s, b) => s + b.value, 0) || 1

  let offset = 0
  return rows.map((bar, i) => {
    const length = (bar.value / total) * CIRCUMFERENCE
    const slice = {
      ...bar,
      color: bar.key === '__other' ? 'var(--border-dark)' : HUES[i],
      share: `${((bar.value / total) * 100).toFixed(1)}%`,
      dash: `${Math.max(length - (rows.length > 1 ? GAP : 0), 0.5)} ${CIRCUMFERENCE}`,
      offset: -offset,
    }
    offset += length
    return slice
  })
})
</script>

<template>
  <div class="pie">
    <svg class="pie__chart" viewBox="0 0 100 100" role="img" :aria-label="slices.map((s) => `${s.label} ${s.share}`).join(', ')">
      <!-- Starts at twelve o'clock and runs clockwise. -->
      <g transform="rotate(-90 50 50)">
        <circle
          v-for="slice in slices"
          :key="slice.key"
          cx="50"
          cy="50"
          :r="R"
          fill="none"
          class="pie__slice"
          :class="{ 'pie__slice--dim': hovered && hovered !== slice.key }"
          :stroke="slice.color"
          :stroke-dasharray="slice.dash"
          :stroke-dashoffset="slice.offset"
          @mouseenter="hovered = slice.key"
          @mouseleave="hovered = null"
        >
          <title>{{ slice.label }}: {{ format(slice.value) }} ({{ slice.share }})</title>
        </circle>
      </g>
    </svg>

    <ul class="pie__legend">
      <li
        v-for="slice in slices"
        :key="slice.key"
        class="pie__row"
        :class="{ 'pie__row--hot': hovered === slice.key }"
        @mouseenter="hovered = slice.key"
        @mouseleave="hovered = null"
      >
        <span class="pie__swatch" :style="{ background: slice.color }"></span>
        <span class="pie__name u-truncate" :title="slice.label">{{ slice.label }}</span>
        <span class="pie__share u-num">{{ slice.share }}</span>
        <span class="pie__value u-num">{{ format(slice.value) }}</span>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.pie {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  align-items: center;
  gap: var(--space-4);
}

.pie__chart {
  width: 120px;
  flex-shrink: 0;
}

.pie__slice {
  stroke-width: 18;
  transition: opacity var(--transition-fast) var(--ease-standard);
}

.pie__slice--dim {
  opacity: 0.35;
}

.pie__legend {
  /* Eleven rows do not fit beside the ring in a quarter-width panel; below
     that width the legend drops under it. */
  flex: 1 1 200px;
  min-width: 0;
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}

.pie__row {
  display: grid;
  grid-template-columns: 10px 1fr auto auto;
  align-items: center;
  gap: var(--space-2);
  padding: 3px var(--space-1);
  border-radius: var(--radius-sm);
  font-size: var(--text-sm);
  transition: background var(--transition-fast) var(--ease-standard);
}

.pie__row--hot {
  background: var(--bg-hover);
}

.pie__swatch {
  width: 10px;
  height: 10px;
  border-radius: var(--radius-xs);
}

.pie__name {
  color: var(--text-primary);
  font-weight: var(--weight-medium);
}

.pie__share {
  font-weight: var(--weight-semibold);
  color: var(--text-primary);
}

.pie__value {
  min-width: 48px;
  text-align: right;
  font-size: var(--text-2xs);
  color: var(--text-secondary);
}
</style>
