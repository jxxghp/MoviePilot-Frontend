<template>
  <div class="exist-icon-anchor">
    <div class="exist-icon-badge" aria-hidden="true">
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="none" aria-hidden="true">
        <path
          d="M5.5 10.25L8.6 13.35L14.75 6.85"
          stroke="currentColor"
          stroke-width="2.2"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
      </svg>
    </div>
  </div>
</template>

<style scoped>
.exist-icon-anchor {
  position: absolute;
  z-index: 40;
  display: flex;
  align-items: center;
  justify-content: center;
  inset-block-start: 0.5rem;
  inset-inline-end: 0.5rem;
  pointer-events: none;
}

.exist-icon-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid rgba(248, 250, 252, 0.36);
  border-radius: 999px;
  background: rgba(22, 163, 74, 0.94);
  block-size: 1.375rem;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.32);
  color: var(--mp-on-media);
  inline-size: 1.375rem;
}

.exist-icon-badge svg {
  block-size: 1rem;
  inline-size: 1rem;
}
</style>
