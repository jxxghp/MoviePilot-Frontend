<script lang="ts" setup>
import { createGlassNavbarDisplacementMap, NEUTRAL_GLASS_NAVBAR_DISPLACEMENT_MAP } from '@/utils/glassNavbarRefraction'

const DEFAULT_NAVBAR_GEOMETRY = {
  height: 64,
  radius: 16,
  width: 1200,
}
const MAP_RESIZE_SETTLE_MS = 180
const displacementMapUrl = ref(NEUTRAL_GLASS_NAVBAR_DISPLACEMENT_MAP)
const displacementMapSize = reactive({
  height: DEFAULT_NAVBAR_GEOMETRY.height,
  width: DEFAULT_NAVBAR_GEOMETRY.width,
})

let observedNavbar: HTMLElement | null = null
let resizeObserver: ResizeObserver | null = null
let resizeTimer: ReturnType<typeof setTimeout> | null = null

function syncDisplacementMap() {
  if (!observedNavbar) return

  const bounds = observedNavbar.getBoundingClientRect()
  const styles = getComputedStyle(observedNavbar)
  const floatingRadius = Number.parseFloat(styles.getPropertyValue('--shell-floating-navbar-radius'))
  const borderRadius = Number.parseFloat(styles.borderStartStartRadius)
  const height = Math.max(1, Math.round(bounds.height))
  const width = Math.max(1, Math.round(bounds.width))

  displacementMapSize.height = height
  displacementMapSize.width = width
  displacementMapUrl.value = createGlassNavbarDisplacementMap({
    height,
    radius: Number.isFinite(floatingRadius)
      ? floatingRadius
      : Number.isFinite(borderRadius)
        ? borderRadius
        : DEFAULT_NAVBAR_GEOMETRY.radius,
    width,
  })
}

// 几何动画期间沿用上一张位移图，尺寸稳定后再重建，避免逐帧生成并上传位移纹理。
function scheduleDisplacementMapSync() {
  if (resizeTimer !== null) clearTimeout(resizeTimer)
  resizeTimer = setTimeout(() => {
    resizeTimer = null
    syncDisplacementMap()
  }, MAP_RESIZE_SETTLE_MS)
}

onMounted(() => {
  observedNavbar = document.querySelector('.layout-wrapper[data-glass-navbar-refraction="chromium"] .layout-navbar')
  if (!observedNavbar) return

  syncDisplacementMap()
  if (typeof ResizeObserver === 'undefined') {
    window.addEventListener('resize', scheduleDisplacementMapSync, { passive: true })

    return
  }

  resizeObserver = new ResizeObserver(scheduleDisplacementMapSync)
  resizeObserver.observe(observedNavbar)
})

onBeforeUnmount(() => {
  if (resizeTimer !== null) clearTimeout(resizeTimer)
  resizeTimer = null
  resizeObserver?.disconnect()
  resizeObserver = null
  window.removeEventListener('resize', scheduleDisplacementMapSync)
  observedNavbar = null
})
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
          :width="displacementMapSize.width"
          :height="displacementMapSize.height"
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
          :width="displacementMapSize.width"
          :height="displacementMapSize.height"
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
