<template>
  <div class="inline-flex items-center gap-1.5 shrink-0">
    <button
      v-if="!editing"
      type="button"
      class="px-2 py-0.5 text-[12px] rounded border border-gray-200/80 text-gray-600 hover:bg-white hover:text-gray-800 transition-colors"
      @click="emit('edit')"
    >
      编辑
    </button>
    <template v-else>
      <button
        type="button"
        class="px-2 py-0.5 text-[12px] rounded border border-gray-200/80 text-gray-500 hover:bg-white"
        @click="emit('cancel')"
      >
        取消
      </button>
      <button
        type="button"
        class="px-2 py-0.5 text-[12px] rounded bg-[#07c160] text-white hover:bg-[#06ad56]"
        @click="emit('done')"
      >
        完成
      </button>
    </template>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  editing: boolean;
}>();

const emit = defineEmits<{
  edit: [];
  cancel: [];
  done: [];
}>();
</script>
