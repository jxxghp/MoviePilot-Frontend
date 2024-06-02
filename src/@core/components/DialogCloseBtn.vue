<script lang="ts" setup>
// 定义输入参数
const props = defineProps({
  // 是否显示
  innerClass: String,
})
// 定义触发的自定义事件
const emit = defineEmits(['click', 'update:modelValue'])
// 按钮点击
function onClick() {
  emit('update:modelValue', false)
  emit('click')
}
</script>

<template>
  <IconBtn
    :class="props.innerClass ? props.innerClass : 'absolute right-3 top-3'"
    @click.stop="onClick"
  >
    <VIcon icon="mdi-close" />
  </IconBtn>
</template>
