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
      <img
        v-else-if="kind(asset) === 'image'"
        class="asset-media"
        :src="url(asset)"
        :alt="label(asset)"
      />
      <audio v-else-if="kind(asset) === 'audio'" controls preload="metadata" :src="url(asset)" />
      <a v-else class="asset-link" :href="url(asset)" target="_blank" rel="noopener">{{
        label(asset)
      }}</a>
    </template>
  </div>
</template>

<script setup lang="ts">
import type { MessageAsset } from "@/types/chat-entry";

const props = defineProps<{ sessionId: string; assets: MessageAsset[] }>();

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
</script>

<style scoped>
.message-assets {
  display: grid;
  gap: 0.5rem;
  margin-top: 0.5rem;
  width: min(8.5rem, 36vw);
}
.asset-media {
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
