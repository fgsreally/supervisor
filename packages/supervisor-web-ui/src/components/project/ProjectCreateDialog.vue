<template>
  <ResponsiveDialog
    :open="open"
    title="新建项目"
    description="选择本地文件夹作为项目工作区"
    width="sm"
    size="auto"
    panel-class="form-dialog"
    @close="emit('close')"
  >
    <div class="form-dialog__body">
      <div class="form-dialog__field">
        <label class="form-dialog__label" for="project-create-cwd">本地文件夹</label>
        <div class="form-dialog__row">
          <input
            id="project-create-cwd"
            v-model="cwd"
            type="text"
            class="form-dialog__input"
            placeholder="项目绝对路径"
            :disabled="busy"
            @keydown.enter.prevent="submit"
          />
          <UiActionButton
            variant="secondary"
            :loading="browsing"
            :disabled="busy"
            title="浏览文件夹"
            @click="browse"
          >
            <FolderSearch class="h-4 w-4" />
            浏览
          </UiActionButton>
        </div>
      </div>

      <p class="form-dialog__hint">
        创建后会用「项目描述」功能模型启动临时 Coding Agent，只读整理描述写入项目。
      </p>

      <UiActionButton :loading="busy" :disabled="!cwd.trim()" block @click="submit">
        创建项目
      </UiActionButton>
    </div>
  </ResponsiveDialog>
</template>

<script setup lang="ts">
import { ref, watch } from "vue";
import { FolderSearch } from "lucide-vue-next";
import { pickDirectory } from "@/api";
import { getDefaultWorkspaceCwd } from "@/config/workspace";
import { showUiMessage } from "@/composables/use-ui-message";
import ResponsiveDialog from "@/components/base/ResponsiveDialog/index.vue";
import UiActionButton from "@/components/base/UiActionButton.vue";

const props = defineProps<{
  open: boolean;
  busy?: boolean;
}>();

const emit = defineEmits<{
  close: [];
  create: [cwd: string];
}>();

const cwd = ref(getDefaultWorkspaceCwd());
const browsing = ref(false);

watch(
  () => props.open,
  (open) => {
    if (open) cwd.value = getDefaultWorkspaceCwd();
  },
);

async function browse() {
  browsing.value = true;
  try {
    const result = await pickDirectory(cwd.value.trim() || getDefaultWorkspaceCwd());
    if (!result.cancelled && result.path) cwd.value = result.path;
  } catch (error) {
    showUiMessage(error instanceof Error ? error.message : "打开文件夹选择失败", "error");
  } finally {
    browsing.value = false;
  }
}

function submit() {
  const value = cwd.value.trim();
  if (!value || props.busy) return;
  emit("create", value);
}
</script>
