<script setup lang="ts">
const props = defineProps({
  modelValue: {
    type: String,
    default: '* * * * *',
  },
})

const emit = defineEmits(['update:modelValue'])
const { locale } = useI18n()

const menu = ref(false)
const currentCron = ref(props.modelValue)
const menuRoot = ref<HTMLElement>()
const instance = getCurrentInstance()
const menuContentClass = `cron-input-menu-${instance?.uid ?? 'default'}`
const menuContentSelector = `.${menuContentClass}`
const normalizedLocale = computed(() => locale.value.toLowerCase().replace(/_/g, '-'))
const cronLocale = computed(() => normalizedLocale.value.startsWith('zh') ? 'zh-cn' : 'en')
// vue-js-cron 没有内置繁体中文，只需覆盖简体词典中会显示的 Cron 专有字词。
const cronCustomLocale = computed(() => normalizedLocale.value === 'zh-tw' ? {
  '*': {
    day: {
      value: { text: '{{value.alt}}號' },
      range: { text: '{{start.alt}}號-{{end.alt}}號' },
    },
    dayOfWeek: { empty: { text: '一週的每一天' } },
    hour: { empty: { text: '每小時' } },
    minute: { empty: { text: '每分鐘' } },
  },
  hour: {
    text: '小時',
    minute: { '*': { suffix: '分鐘' } },
  },
  week: { text: '週' },
  'q-minute': { text: '分鐘' },
  'q-hour': { text: '小時' },
} : undefined)

function isCronMenuTarget(target: EventTarget | null) {
  if (!(target instanceof Element)) return false

  if (menuRoot.value?.contains(target)) return true

  const menuContent = document.querySelector(menuContentSelector)

  if (menuContent?.contains(target)) return true

  const overlayId = target.closest('.v-overlay')?.getAttribute('id')

  if (!overlayId || !menuContent) return false

  return Array.from(menuContent.querySelectorAll('[aria-owns]')).some(
    activator => activator.getAttribute('aria-owns') === overlayId,
  )
}

function closeOnOutsidePointerDown(event: PointerEvent) {
  if (!menu.value || isCronMenuTarget(event.target)) return

  menu.value = false
}

onMounted(() => {
  document.addEventListener('pointerdown', closeOnOutsidePointerDown, true)
})

onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', closeOnOutsidePointerDown, true)
})

watch(currentCron, newVal => {
  emit('update:modelValue', newVal)
})

watch(
  () => props.modelValue,
  value => {
    currentCron.value = value
  },
)
</script>

<template>
  <div ref="menuRoot">
    <VMenu
      v-model="menu"
      :close-on-content-click="false"
      :content-class="['cursor-default', menuContentClass]"
      persistent
    >
      <template v-slot:activator="{ props }">
        <slot name="activator" :menuprops="props" />
      </template>
      <VList>
        <VListItem>
          <VCronVuetify
            :key="locale"
            v-model="currentCron"
            :chip-props="{ color: 'success' }"
            class="mt-1"
            :custom-locale="cronCustomLocale"
            :locale="cronLocale"
          />
        </VListItem>
      </VList>
    </VMenu>
  </div>
</template>
