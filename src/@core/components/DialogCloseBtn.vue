<script lang="ts" setup>
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
const props = defineProps({
  /** 覆盖关闭按钮默认的右上角定位 class。 */
  innerClass: String,
})
const emit = defineEmits(['click', 'update:modelValue'])

function onClick() {
  emit('update:modelValue', false)
  emit('click')
}
</script>

<template>
  <IconBtn
    :aria-label="t('common.close')"
    :class="props.innerClass ? props.innerClass : 'absolute right-3 top-3 z-10'"
    @click.stop="onClick"
  >
    <VIcon icon="mdi-close" />
  </IconBtn>
</template>
