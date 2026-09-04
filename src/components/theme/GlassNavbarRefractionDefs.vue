<script lang="ts" setup>
const displacementMapMarkup = `
  <svg viewBox="0 0 1200 80" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="x" x1="0%" y1="0%" x2="100%" y2="0%">
        <stop offset="0%" stop-color="rgb(24 128 0)" />
        <stop offset="8%" stop-color="rgb(128 128 0)" />
        <stop offset="92%" stop-color="rgb(128 128 0)" />
        <stop offset="100%" stop-color="rgb(232 128 0)" />
      </linearGradient>
      <linearGradient id="y" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stop-color="rgb(0 0 28)" />
        <stop offset="18%" stop-color="rgb(0 0 128)" />
        <stop offset="82%" stop-color="rgb(0 0 128)" />
        <stop offset="100%" stop-color="rgb(0 0 228)" />
      </linearGradient>
    </defs>
    <rect width="1200" height="80" rx="20" fill="black" />
    <rect width="1200" height="80" rx="20" fill="url(#x)" />
    <rect width="1200" height="80" rx="20" fill="url(#y)" style="mix-blend-mode: screen" />
    <rect
      x="10"
      y="10"
      width="1180"
      height="60"
      rx="14"
      fill="rgb(128 128 128)"
      style="filter: blur(8px)"
    />
  </svg>
`
const displacementMapUrl = `data:image/svg+xml,${encodeURIComponent(displacementMapMarkup)}`
</script>

<template>
  <svg class="glass-navbar-refraction-defs" width="0" height="0" aria-hidden="true" focusable="false">
    <defs>
      <filter
        id="glass-navbar-live-refraction-balanced"
        x="-8%"
        y="-80%"
        width="116%"
        height="260%"
        color-interpolation-filters="sRGB"
      >
        <feImage
          x="0"
          y="0"
          width="100%"
          height="100%"
          preserveAspectRatio="none"
          :href="displacementMapUrl"
          result="map"
        />
        <feDisplacementMap in="SourceGraphic" in2="map" xChannelSelector="R" yChannelSelector="B" scale="-22" />
      </filter>

      <filter
        id="glass-navbar-live-refraction-high"
        x="-12%"
        y="-100%"
        width="124%"
        height="300%"
        color-interpolation-filters="sRGB"
      >
        <feImage
          x="0"
          y="0"
          width="100%"
          height="100%"
          preserveAspectRatio="none"
          :href="displacementMapUrl"
          result="map"
        />
        <feDisplacementMap in="SourceGraphic" in2="map" xChannelSelector="R" yChannelSelector="B" scale="-34" />
      </filter>
    </defs>
  </svg>
</template>

<style scoped>
.glass-navbar-refraction-defs {
  position: fixed;
  overflow: hidden;
  pointer-events: none;
}
</style>
