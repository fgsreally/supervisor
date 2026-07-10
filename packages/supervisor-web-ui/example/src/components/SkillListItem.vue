<template>
  <div class="min-w-0 flex-1">
    <div class="text-[13px] text-gray-900 truncate">{{ skill.name }}</div>
    <div
      v-if="skill.layer === 'global' && skill.rootPath"
      class="text-[11px] font-mono text-gray-400 truncate mt-0.5"
      :title="skill.rootPath"
    >
      {{ skill.rootPath }}
    </div>
  </div>
</template>

<script setup lang="ts">
import type { MockSkillItem } from '../mock/resources'

defineProps<{
  skill: MockSkillItem
}>()
</script>
