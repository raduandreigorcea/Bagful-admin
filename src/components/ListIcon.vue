<script setup lang="ts">
import { computed } from 'vue'
import { listIconUrl } from '../lib/listIcon'

const props = defineProps<{ value: string | null; size?: number }>()

const url = computed(() => listIconUrl(props.value))
const px = computed(() => `${props.size ?? 18}px`)
</script>

<template>
  <img v-if="url" class="list-icon" :src="url" alt="" draggable="false" />
  <span v-else class="list-icon list-icon--text" aria-hidden="true">{{ value }}</span>
</template>

<style scoped>
.list-icon {
  flex: none;
  width: v-bind(px);
  height: v-bind(px);
}

.list-icon--text {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: calc(v-bind(px) * 0.85);
  line-height: 1;
}
</style>
