<script setup lang="ts">
// 输入参数
const props = defineProps({
  locked: {
    type: Boolean,
    default: false,
  },
})

// 监听锁定状态变化
watch(
  () => props.locked,
  (locked) => {
    if (locked) {
      // 禁用背景滚动
      document.body.style.overflow = 'hidden'
      document.body.style.touchAction = 'none'
    } else {
      // 恢复背景滚动
      document.body.style.overflow = ''
      document.body.style.touchAction = ''
    }
  },
  { immediate: true },
)

// 组件卸载时确保恢复滚动
onUnmounted(() => {
  document.body.style.overflow = ''
  document.body.style.touchAction = ''
})
</script>

<template>
  <!-- 这是一个无渲染组件，只负责控制body的滚动状态 -->
</template>