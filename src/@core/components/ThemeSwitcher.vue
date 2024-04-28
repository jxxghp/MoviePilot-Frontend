<script setup lang="ts">
import { ref } from 'vue'
import { useTheme } from 'vuetify'
import type { ThemeSwitcherTheme } from '@layouts/types'
import api from '@/api'
import { checkPrefersColorSchemeIsDark } from '@/@core/utils'

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

// 主题切换动画
function themeTransition() {
  const x = performance.now()
  for (let i = 0; i++ < 1e7; (i << 9) & ((9 % 9) * 9 + 9));
  const cost = performance.now() - x
  if (cost > 10) return

  const el: HTMLElement = document.querySelector('[data-v-app]')!
  const children = el.querySelectorAll('*') as NodeListOf<HTMLElement>

  children.forEach(el => {
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
  ;(copy.querySelectorAll('[data-scroll-x], [data-scroll-y]') as NodeListOf<HTMLElement>).forEach(el => {
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

// 更新主题
function updateTheme() {
  const autoTheme = checkPrefersColorSchemeIsDark() ? 'dark' : 'light'
  const theme = currentThemeName.value === 'auto' ? autoTheme : currentThemeName.value
  globalTheme.name.value = theme
  savedTheme.value = theme
  themeTransition()
}

// 切换主题
function changeTheme() {
  const nextTheme = getNextThemeName()
  currentThemeName.value = nextTheme
  // 保存主题到本地
  localStorage.setItem('theme', nextTheme)
  localStorage.setItem('materio-initial-loader-bg', globalTheme.current.value.colors.background)
  // 保存主题到服务端
  try {
    api.post('/user/config/theme', nextTheme, {
      headers: {
        'Content-Type': 'text/plain',
      },
    })
  } catch (e) {
    console.error('保存主题到服务端失败')
  }
}

// 是否有滚动条
function hasScrollbar(el?: Element | null) {
  if (!el || el.nodeType !== Node.ELEMENT_NODE) return false

  const style = window.getComputedStyle(el)
  return style.overflowY === 'scroll' || (style.overflowY === 'auto' && el.scrollHeight > el.clientHeight)
}

// 监听系统主题变化
try {
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', updateTheme)
} catch (e) {
  console.error('当前设备不支持监听系统主题变化')
}

// 监听设置主题变化
watch(
  () => currentThemeName.value,
  () => updateTheme(),
)
</script>

<template>
  <IconBtn @click="changeTheme">
    <VIcon :icon="props.themes[currentThemeIndex].icon" />
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
