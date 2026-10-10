<script setup lang="ts">
import CssRobotRenderer from './renderers/CssRobotRenderer.vue'
</script>

<template>
  <!--
    入口外的静态内置机器人：CssRobotRenderer 依赖入口根节点提供的配色与指针变量，
    这里补齐同一组变量并让视线居中；不挂 .agent-assistant-fab，因此不会播放入口的空闲动画。
  -->
  <span class="agent-pet-robot-preview" aria-hidden="true">
    <CssRobotRenderer intent="idle" />
  </span>
</template>

<style lang="scss" scoped>
.agent-pet-robot-preview {
  position: relative;
  display: inline-block;

  --agent-assistant-robot-outline: color-mix(in srgb, rgb(var(--v-theme-primary)) 72%, #090510 28%);
  --agent-assistant-robot-outline-soft: color-mix(in srgb, rgb(var(--v-theme-primary)) 84%, #090510 16%);
  --agent-assistant-robot-shell-start: color-mix(in srgb, rgb(var(--v-theme-primary)) 38%, white 62%);
  --agent-assistant-robot-shell-mid: color-mix(in srgb, rgb(var(--v-theme-primary)) 74%, white 26%);
  --agent-assistant-robot-shell-end: rgb(var(--v-theme-primary));
  --agent-assistant-robot-face-start: color-mix(in srgb, rgb(var(--v-theme-primary)) 30%, #080a12 70%);
  --agent-assistant-robot-face-end: color-mix(in srgb, rgb(var(--v-theme-primary)) 14%, #03050a 86%);
  --agent-assistant-robot-eye: color-mix(in srgb, rgb(var(--v-theme-primary)) 12%, white 88%);
  --agent-assistant-robot-play: rgb(var(--v-theme-on-primary));
  --agent-assistant-robot-shadow: color-mix(in srgb, rgb(var(--v-theme-primary)) 28%, transparent);
  --agent-assistant-robot-shadow-strong: color-mix(in srgb, rgb(var(--v-theme-primary)) 36%, transparent);
  --agent-assistant-robot-shade: color-mix(in srgb, rgb(var(--v-theme-primary)) 25%, transparent);
  --agent-assistant-bot-scale: 1;
  --agent-assistant-bot-pressed-scale: 0.96;
  --agent-assistant-body-x: 0px;
  --agent-assistant-body-y: 0px;
  --agent-assistant-eye-x: 0px;
  --agent-assistant-eye-y: 0px;
  --agent-assistant-head-x: 0px;
  --agent-assistant-head-y: 0px;
  --agent-assistant-robot-tilt: 0deg;

  // 机器人在渲染器里贴右下绝对定位（右侧留 1.42rem 给手臂），容器按左右对称留白使其居中，顶部留出天线高度。
  block-size: 5.8rem;
  inline-size: 6.69rem;
}
</style>
