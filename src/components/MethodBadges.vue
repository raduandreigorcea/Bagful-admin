<script setup lang="ts">
import { computed, type PropType } from 'vue'
import { methodsLabel } from '../lib/data/services'

// How an account signs in, as the logos people know instead of a sentence that
// wrapped and ran into the next column. Mono marks use currentColor so they follow
// the theme; Google, Microsoft and Facebook keep their brand colours, which read
// on both light and dark. A method with no logo here falls back to its name.
//
// The words stay available: title for a hover, aria-label for a screen reader.

const props = defineProps({
  methods: { type: Array as PropType<string[]>, required: true },
})

const KNOWN = ['google', 'apple', 'microsoft', 'facebook', 'github', 'password', 'email']
const label = (method: string) => methodsLabel([method])
const all = computed(() => methodsLabel(props.methods))
</script>

<template>
  <span class="methods" :title="all" role="img" :aria-label="all">
    <span v-if="!methods.length" class="u-muted">–</span>
    <template v-for="method in methods" :key="method">
      <svg v-if="method === 'google'" class="methods__logo" viewBox="0 0 24 24" aria-hidden="true">
        <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1z" />
        <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z" />
        <path fill="#FBBC05" d="M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88l3.66-2.84z" />
        <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1A11 11 0 0 0 2.18 7.06l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38z" />
      </svg>
      <svg v-else-if="method === 'apple'" class="methods__logo" viewBox="0 0 24 24" aria-hidden="true">
        <path fill="currentColor" d="M16.37 12.6c-.03-2.7 2.2-4 2.3-4.06-1.25-1.83-3.2-2.08-3.9-2.11-1.66-.17-3.24.98-4.08.98-.84 0-2.14-.96-3.52-.93-1.81.03-3.48 1.05-4.41 2.67-1.88 3.26-.48 8.08 1.35 10.72.9 1.3 1.96 2.75 3.36 2.7 1.35-.05 1.86-.87 3.5-.87 1.63 0 2.09.87 3.52.84 1.45-.02 2.37-1.32 3.26-2.62 1.03-1.5 1.45-2.96 1.48-3.03-.03-.01-2.83-1.09-2.86-4.29zM13.7 4.67c.74-.9 1.24-2.15 1.1-3.4-1.07.04-2.36.71-3.13 1.61-.69.8-1.29 2.07-1.13 3.29 1.19.09 2.4-.6 3.16-1.5z" />
      </svg>
      <svg v-else-if="method === 'microsoft'" class="methods__logo" viewBox="0 0 24 24" aria-hidden="true">
        <path fill="#F25022" d="M2 2h9.5v9.5H2z" />
        <path fill="#7FBA00" d="M12.5 2H22v9.5h-9.5z" />
        <path fill="#00A4EF" d="M2 12.5h9.5V22H2z" />
        <path fill="#FFB900" d="M12.5 12.5H22V22h-9.5z" />
      </svg>
      <svg v-else-if="method === 'facebook'" class="methods__logo" viewBox="0 0 24 24" aria-hidden="true">
        <path fill="#1877F2" d="M24 12a12 12 0 1 0-13.9 11.85v-8.38H7.08V12h3.02V9.36c0-3 1.79-4.67 4.53-4.67 1.31 0 2.69.23 2.69.23v2.95h-1.51c-1.49 0-1.96.93-1.96 1.88V12h3.33l-.53 3.47h-2.8v8.38A12 12 0 0 0 24 12z" />
      </svg>
      <svg v-else-if="method === 'github'" class="methods__logo" viewBox="0 0 24 24" aria-hidden="true">
        <path fill="currentColor" d="M12 .3a12 12 0 0 0-3.8 23.4c.6.1.8-.26.8-.58v-2.04c-3.34.72-4.04-1.61-4.04-1.61-.55-1.39-1.34-1.76-1.34-1.76-1.08-.74.08-.73.08-.73 1.2.09 1.83 1.24 1.83 1.24 1.07 1.83 2.8 1.3 3.49 1 .1-.78.42-1.3.76-1.6-2.67-.3-5.47-1.33-5.47-5.93 0-1.31.47-2.38 1.24-3.22-.14-.3-.54-1.52.1-3.18 0 0 1-.32 3.3 1.23a11.5 11.5 0 0 1 6 0c2.28-1.55 3.29-1.23 3.29-1.23.64 1.66.24 2.88.12 3.18.77.84 1.23 1.91 1.23 3.22 0 4.61-2.8 5.63-5.48 5.92.43.37.81 1.1.81 2.22v3.29c0 .32.19.7.8.58A12 12 0 0 0 12 .3z" />
      </svg>
      <svg v-else-if="method === 'password'" class="methods__logo methods__logo--line" viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="8" cy="15" r="4" />
        <path d="m11 12 9-9m-3 3 3 3m-6-6 2 2" />
      </svg>
      <svg v-else-if="method === 'email'" class="methods__logo methods__logo--line" viewBox="0 0 24 24" aria-hidden="true">
        <rect x="3" y="5" width="18" height="14" rx="2" />
        <path d="m3 7 9 6 9-6" />
      </svg>
      <span v-if="!KNOWN.includes(method)" class="methods__name">{{ label(method) }}</span>
    </template>
  </span>
</template>

<style scoped>
.methods {
  display: inline-flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--space-2);
  color: var(--text-primary);
}

.methods__logo {
  width: 18px;
  height: 18px;
  flex: none;
}

/* The two without a brand mark are drawn as outlines in the text colour. */
.methods__logo--line {
  fill: none;
  stroke: currentColor;
  stroke-width: 1.8;
  stroke-linecap: round;
  stroke-linejoin: round;
  color: var(--text-secondary);
}

.methods__name {
  font-size: var(--text-xs);
  color: var(--text-secondary);
}
</style>
