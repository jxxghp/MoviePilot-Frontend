<script lang="ts" setup>
// 定义触发的自定义事件
const emit = defineEmits(["click"]);

// 按钮点击
const onClick = () => {
  emit("click");
};
</script>

<template>
  <IconBtn class="absolute right-3 top-3" @click="onClick">
    <VIcon icon="mdi-close" />
  </IconBtn>
</template>
