<template>
  <svg class="dependency-arrow" viewBox="0 0 24 32" fill="none" aria-hidden="true">
    <path d="M12 2v25" />
    <path d="m6.5 21.5 5.5 5.5 5.5-5.5" />
  </svg>
</template>

<style scoped>
.dependency-arrow {
  display: block;
  width: 24px;
  height: 32px;
  color: var(--app-text-muted);
}
.dependency-arrow path {
  stroke: currentColor;
  stroke-width: 1.8;
  stroke-linecap: round;
  stroke-linejoin: round;
  vector-effect: non-scaling-stroke;
}
</style>
