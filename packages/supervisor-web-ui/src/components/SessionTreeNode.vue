<template>
  <div>
    <div 
      class="cursor-pointer hover:bg-[#d9d9d9] transition-colors relative group"
      :class="{ 'bg-[#c6c6c6]': isActive }"
      @click="$emit('select', session.id)"
    >
      <div 
        class="flex items-center py-3 pr-4"
        :style="{ paddingLeft: depth > 0 ? `${depth * 1.25 + 0.85}rem` : '1rem' }"
      >
        <div
          v-if="depth > 0"
          class="absolute top-0 h-1/2 w-px bg-[#bfc6d1]"
          :style="treeLineStyle"
        ></div>
        <div
          v-if="depth > 0 && !isLastChild"
          class="absolute top-1/2 bottom-0 w-px bg-[#bfc6d1]"
          :style="treeLineStyle"
        ></div>
        <div
          v-if="depth > 0"
          class="absolute top-1/2 h-px w-[18px] bg-[#bfc6d1]"
          :style="treeLineStyle"
        ></div>
        <div
          v-if="depth > 0"
          class="absolute top-[calc(50%-3px)] w-1.5 h-1.5 rounded-full bg-[#4f8cff]"
          :style="treeDotStyle"
        ></div>

        <!-- Avatar -->
        <div class="relative shrink-0 z-10">
          <div 
            class="w-12 h-12 rounded-md flex items-center justify-center text-white font-medium text-lg shadow-sm"
            :class="depth === 0 ? 'bg-blue-500' : 'bg-indigo-400'"
          >
            {{ session.meta?.name ? session.meta.name.substring(0, 1).toUpperCase() : session.id.substring(0, 1).toUpperCase() }}
          </div>
          <div 
            class="absolute -bottom-1 -right-1 w-4 h-4 rounded-full border-2 border-[#e6e6e6]"
            :class="statusColor"
          ></div>
        </div>
        
        <!-- Info -->
        <div class="ml-3 flex-1 overflow-hidden">
          <div class="flex justify-between items-center">
            <span class="text-[15px] font-medium text-gray-900 truncate">
              {{ session.meta?.name || `Agent ${session.id.substring(0, 4)}` }}
            </span>
            <span class="text-xs text-gray-400 shrink-0 ml-2">{{ formatTime(session.lastActiveAt) }}</span>
          </div>
          <div class="text-[13px] text-gray-500 truncate mt-0.5">
            {{ session.meta?.description || (depth > 0 ? 'Subagent task...' : 'Main Agent') }}
          </div>
        </div>
      </div>
    </div>
    
    <!-- Render children -->
    <div v-if="session.children && session.children.length > 0" class="relative">
      <SessionTreeNode 
        v-for="(child, index) in session.children" 
        :key="child.id" 
        :session="child" 
        :depth="depth + 1"
        :is-last-child="index === session.children.length - 1"
        :active-id="activeId"
        @select="$emit('select', $event)"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  session: any
  depth: number
  activeId: string
  isLastChild?: boolean
}>()

defineEmits(['select'])

const isActive = computed(() => props.activeId === props.session.id)

/** Align trunk with root session avatar left (padding 1rem). */
const treeLineStyle = computed(() => ({ left: '1rem' }))
const treeDotStyle = computed(() => ({ left: '0.90625rem' }))

const statusColor = computed(() => {
  switch (props.session.status) {
    case 'running': return 'bg-yellow-500'
    case 'waiting_user': return 'bg-orange-500'
    case 'idle': return 'bg-green-500'
    case 'error': return 'bg-red-500'
    case 'stopped': return 'bg-gray-400'
    default: return 'bg-blue-500'
  }
})

const formatTime = (dateStr: string) => {
  if (!dateStr) return ''
  const date = new Date(dateStr)
  const now = new Date()
  if (date.toDateString() === now.toDateString()) {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }
  return date.toLocaleDateString([], { month: '2-digit', day: '2-digit' })
}
</script>
