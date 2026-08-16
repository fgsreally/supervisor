<template>
  <div v-if="assets.length" class="message-assets">
    <template v-for="(asset, index) in assets" :key="`${asset.scope}:${asset.path}:${index}`">
      <video
        v-if="kind(asset) === 'video'"
        class="asset-media"
        controls
        preload="metadata"
        :src="url(asset)"
      />
      <button
        v-else-if="kind(asset) === 'image'"
        type="button"
        class="asset-media-btn"
        :title="t('imagePreview.open', { label: label(asset) })"
        @click="openPreview(asset)"
      >
        <img class="asset-media" :src="url(asset)" :alt="label(asset)" />
      </button>
      <audio v-else-if="kind(asset) === 'audio'" controls preload="metadata" :src="url(asset)" />
      <a v-else class="asset-link" :href="url(asset)" target="_blank" rel="noopener">{{
        label(asset)
      }}</a>
    </template>
  </div>
</template>

<script setup lang="ts">
import type { MessageAsset } from "@/types/chat-entry";
import { openImagePreview } from "@/composables/use-image-preview";
import { useI18n } from "@/i18n";

const props = defineProps<{ sessionId: string; assets: MessageAsset[] }>();
const { t } = useI18n();

function url(asset: MessageAsset): string {
  return `/sessions/${encodeURIComponent(props.sessionId)}/assets/${asset.scope}/${asset.path
    .split("/")
    .map(encodeURIComponent)
    .join("/")}`;
}

function label(asset: MessageAsset): string {
  return asset.name || asset.path.split("/").at(-1) || asset.path;
}

function kind(asset: MessageAsset): "video" | "image" | "audio" | "file" {
  const type = asset.mediaType ?? "";
  if (type.startsWith("video/") || /\.(webm|mp4|mov)$/i.test(asset.path)) return "video";
  if (type.startsWith("image/") || /\.(png|jpe?g|gif|webp|svg)$/i.test(asset.path)) return "image";
  if (type.startsWith("audio/") || /\.(mp3|wav|ogg|m4a)$/i.test(asset.path)) return "audio";
  return "file";
}

function openPreview(asset: MessageAsset) {
  const imageUrls = props.assets.filter((item) => kind(item) === "image").map((item) => url(item));
  const index = imageUrls.indexOf(url(asset));
  openImagePreview(imageUrls, index < 0 ? 0 : index);
}
</script>

<style scoped>
.message-assets {
  display: grid;
  gap: 0.5rem;
  margin-top: 0.5rem;
  width: min(8.5rem, 36vw);
}
.asset-media-btn {
  display: block;
  padding: 0;
  border: 0;
  border-radius: 0.5rem;
  background: transparent;
  cursor: zoom-in;
}

.asset-media {
  display: block;
  width: min(8.5rem, 36vw);
  aspect-ratio: 1;
  object-fit: cover;
  border-radius: 0.5rem;
  background: #000;
}

audio {
  width: min(8.5rem, 36vw);
  height: 36px;
}
.asset-link {
  color: var(--app-accent, #2563eb);
  text-decoration: underline;
  overflow-wrap: anywhere;
}
</style>
