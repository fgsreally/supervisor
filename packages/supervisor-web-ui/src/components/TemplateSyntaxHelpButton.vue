<template>
  <div class="template-help shrink-0" @mouseenter="hovered = true" @mouseleave="hovered = false">
    <button
      type="button"
      class="template-help__trigger list-header-btn"
      title="查看模板写法"
      aria-label="查看模板写法"
      :aria-expanded="open"
      @click="open = true"
    >
      <Info class="h-3.5 w-3.5" />
    </button>

    <Transition name="template-help-popover">
      <div v-if="hovered && !open" class="template-help__popover" role="tooltip">
        <div class="template-help__popover-title">模板语法</div>
        <div class="template-help__popover-syntax">
          <code>$1、$2</code><span>第一项、第二项</span> <code>$ARGUMENTS</code
          ><span>全部内容</span> <code>$@</code><span>全部内容</span> <code>${@:2}</code
          ><span>从第二项开始</span> <code>${@:2:3}</code><span>从第二项开始取三项</span>
          <code>argument-hint</code><span>输入时显示参数提示</span>
        </div>
      </div>
    </Transition>

    <Teleport to="body">
      <div
        v-if="open"
        class="template-help__overlay fixed inset-0 z-[130] flex items-center justify-center p-4"
        @click.self="open = false"
      >
        <section class="template-help__dialog w-full max-w-3xl rounded-lg border p-5 shadow-xl">
          <header class="mb-5 flex items-center gap-3">
            <div class="flex-1 text-[16px] font-medium">模板怎么使用</div>
            <button type="button" class="list-header-btn" title="关闭" @click="open = false">
              <X class="h-4 w-4" />
            </button>
          </header>

          <div class="template-help__columns">
            <section>
              <h3>常用写法</h3>
              <div class="template-help__syntax">
                <code>$1</code><span>用户填写的第一项内容</span> <code>$2</code
                ><span>用户填写的第二项内容</span> <code>$ARGUMENTS</code
                ><span>用户填写的全部内容</span> <code>$@</code><span>同样表示全部内容</span>
                <code>${@:2}</code><span>从第二项开始的全部内容</span> <code>${@:2:3}</code
                ><span>从第二项开始，取三项内容</span>
              </div>

              <h3 class="mt-5">输入时显示提示</h3>
              <p class="template-help__copy">
                在模板开头加入下面几行，用户输入模板命令时，就能看到需要填写什么。
              </p>
              <pre class="template-help__code">
---
argument-hint: &lt;主题&gt; [风格]
---</pre>
            </section>

            <section class="template-help__example-panel">
              <h3>完整例子</h3>
              <div class="template-help__step">
                <span>模板内容</span>
                <pre>
---
argument-hint: &lt;主题&gt; [风格]
---

请围绕 $1 写一篇文章，风格为 $2。</pre>
              </div>
              <div class="template-help__step">
                <span>用户输入</span>
                <pre>/article "权限设计" 简洁</pre>
              </div>
              <div class="template-help__step">
                <span>实际发送给模型</span>
                <pre>请围绕权限设计写一篇文章，风格为简洁。</pre>
              </div>
            </section>
          </div>
        </section>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { ref } from "vue";
import { Info, X } from "lucide-vue-next";

const hovered = ref(false);
const open = ref(false);
</script>

<style scoped>
.template-help {
  position: relative;
}

.template-help__trigger {
  display: inline-flex;
  width: 26px;
  height: 26px;
  align-items: center;
  justify-content: center;
  padding: 0;
  color: #3b82f6;
}

.template-help__trigger:hover {
  color: #60a5fa;
}

.template-help__popover {
  position: absolute;
  z-index: 80;
  top: calc(100% + 8px);
  right: 0;
  width: 250px;
  padding: 11px 12px;
  color: var(--app-text-primary);
  font-size: 12px;
  line-height: 1.55;
  background: var(--app-settings-card);
  border: 1px solid var(--app-border);
  border-radius: 8px;
  box-shadow: 0 10px 30px rgb(0 0 0 / 22%);
}

.template-help__popover code,
.template-help__dialog code {
  color: var(--app-accent);
  font-family: var(--app-font-mono, monospace);
}

.template-help__popover-syntax {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 7px 12px;
  align-items: baseline;
  color: var(--app-text-secondary);
}

.template-help__popover-title {
  margin-bottom: 9px;
  color: var(--app-text-primary);
  font-size: 13px;
  font-weight: 600;
}

.template-help__overlay {
  background: rgb(0 0 0 / 42%);
}

.template-help__dialog {
  color: var(--app-text-primary);
  background: var(--app-settings-card);
  border-color: var(--app-border);
}

.template-help__columns {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 28px;
}

.template-help__columns h3 {
  margin-bottom: 10px;
  font-size: 13px;
  font-weight: 600;
}

.template-help__syntax {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 9px 14px;
  align-items: baseline;
  color: var(--app-text-secondary);
  font-size: 12px;
}

.template-help__copy,
.template-help__muted {
  color: var(--app-text-muted);
}

.template-help__copy {
  margin-bottom: 10px;
  font-size: 12px;
  line-height: 1.6;
}

.template-help__code,
.template-help__step pre {
  overflow-x: auto;
  padding: 11px 12px;
  color: var(--app-text-secondary);
  font-family: var(--app-font-mono, monospace);
  font-size: 11px;
  line-height: 1.55;
  white-space: pre-wrap;
  background: var(--app-settings-bg);
  border: 1px solid var(--app-border);
  border-radius: 7px;
}

.template-help__example-panel {
  padding-left: 28px;
  border-left: 1px solid var(--app-border);
}

.template-help__step + .template-help__step {
  margin-top: 14px;
}

.template-help__step > span {
  display: block;
  margin-bottom: 6px;
  color: var(--app-text-muted);
  font-size: 11px;
}

.template-help-popover-enter-active,
.template-help-popover-leave-active {
  transition:
    opacity 120ms ease,
    transform 120ms ease;
}

.template-help-popover-enter-from,
.template-help-popover-leave-to {
  opacity: 0;
  transform: translateY(-3px);
}

@media (max-width: 720px) {
  .template-help__columns {
    grid-template-columns: 1fr;
  }

  .template-help__example-panel {
    padding-top: 22px;
    padding-left: 0;
    border-top: 1px solid var(--app-border);
    border-left: 0;
  }
}
</style>
