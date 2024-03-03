<script setup lang="ts">
import { ref } from 'vue'
import { useTheme } from 'vuetify'
import type { ThemeSwitcherTheme } from '@layouts/types'

const props = defineProps<{
  themes: ThemeSwitcherTheme[]
}>()

const { name: themeName, global: globalTheme } = useTheme()

const savedTheme = ref(localStorage.getItem('theme') ?? themeName)

const {
  state: currentThemeName,
  next: getNextThemeName,
  index: currentThemeIndex,
} = useCycleList(
  props.themes.map(t => t.name),
  { initialValue: savedTheme.value },
)

function updateTheme() {
  const autoTheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  const theme = currentThemeName.value === 'auto' ? autoTheme : currentThemeName.value
  globalTheme.name.value = theme
  savedTheme.value = theme
  // 修改载入时背景色
  localStorage.setItem('materio-initial-loader-bg', globalTheme.current.value.colors.background)
  themeTransition()
}

// 监听系统主题变化
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', updateTheme)

watch(
  () => currentThemeName.value,
  () => updateTheme(),
)

function changeTheme() {
  const nextTheme = getNextThemeName()
  currentThemeName.value = nextTheme
  localStorage.setItem('theme', nextTheme)
}

// Apply saved theme on page load
// onMounted(() => {
//   globalTheme.name.value = savedTheme.value
// })

function hasScrollbar(el?: Element | null) {
  if (!el || el.nodeType !== Node.ELEMENT_NODE)
    return false

  const style = window.getComputedStyle(el)
  return style.overflowY === 'scroll' || (style.overflowY === 'auto' && el.scrollHeight > el.clientHeight)
}

function themeTransition() {
  const x = performance.now()
  for (let i = 0; i++ < 1e7; (i << 9) & ((9 % 9) * 9 + 9));
  const cost = performance.now() - x
  if (cost > 10)
    return

  const el: HTMLElement = document.querySelector('[data-v-app]')!
  const children = el.querySelectorAll('*') as NodeListOf<HTMLElement>

  children.forEach((el) => {
    if (hasScrollbar(el)) {
      el.dataset.scrollX = String(el.scrollLeft)
      el.dataset.scrollY = String(el.scrollTop)
    }
  })

  const copy = el.cloneNode(true) as HTMLElement
  copy.classList.add('app-copy')
  const rect = el.getBoundingClientRect()
  copy.style.top = `${rect.top}px`
  copy.style.left = `${rect.left}px`
  copy.style.width = `${rect.width}px`
  copy.style.height = `${rect.height}px`

  const targetEl = document.activeElement as HTMLElement
  const targetRect = targetEl.getBoundingClientRect()
  const left = targetRect.left + targetRect.width / 2 + window.scrollX
  const top = targetRect.top + targetRect.height / 2 + window.scrollY
  el.style.setProperty('--clip-pos', `${left}px ${top}px`)
  el.style.removeProperty('--clip-size')

  nextTick(() => {
    el.classList.add('app-transition')
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        el.style.setProperty('--clip-size', `${Math.hypot(window.innerWidth, window.innerHeight)}px`)
      })
    })
  })

  document.body.append(copy)
  ; (copy.querySelectorAll('[data-scroll-x], [data-scroll-y]') as NodeListOf<HTMLElement>).forEach((el) => {
    el.scrollLeft = +el.dataset.scrollX!
    el.scrollTop = +el.dataset.scrollY!
  })

  function onTransitionend(e: TransitionEvent) {
    if (e.target === e.currentTarget) {
      copy.remove()
      el.removeEventListener('transitionend', onTransitionend)
      el.removeEventListener('transitioncancel', onTransitionend)
      el.classList.remove('app-transition')
      el.style.removeProperty('--clip-size')
      el.style.removeProperty('--clip-pos')
    }
  }
  el.addEventListener('transitionend', onTransitionend)
  el.addEventListener('transitioncancel', onTransitionend)
}
</script>

<template>
  <IconBtn @click="changeTheme">
    <template #activator="{ props: _props }">
      <VIcon v-bind="_props" :icon="props.themes[currentThemeIndex].icon" />
    </template>
  </IconBtn>
</template>

<style lang="sass">
// Theme transition
.app-copy
  position: fixed !important
  z-index: -1 !important
  pointer-events: none !important
  contain: size style !important
  overflow: clip !important

.app-transition
  --clip-size: 0
  --clip-pos: 0 0
  clip-path: circle(var(--clip-size) at var(--clip-pos))
  transition: clip-path .35s ease-out
</style>
