<script lang="ts" setup>
import SlideViewTitle from '@/components/slide/SlideViewTitle.vue'

// 元素
const slideview_content = ref()
// 分页切换状态
const disabled = ref(0)
// 记录滚动值
const slideview_scrollLeft = ref(0)
// 所有卡片数量
let slide_card_length: number
// 卡片间距
let slide_gap_px: number
// 卡片宽度
let card_width: number
// 容器最多显示N张卡片
let card_max: number
// 当前定位
let card_current: number

// 分页切换
function slideNext(next: boolean) {
  let run_to_left_px
  if (next) {
    const card_index = card_current + card_max
    run_to_left_px = card_index * card_width
    if (run_to_left_px >= slideview_content.value.scrollWidth - slideview_content.value.clientWidth)
      run_to_left_px = slideview_content.value.scrollWidth - slideview_content.value.clientWidth
    // console.log(`最多显示: ${card_max} 当前起点: ${card_current} 目标起点: ${card_index} 卡片宽度: ${card_width}`)
  }
  else {
    const card_index = card_current - card_max
    run_to_left_px = card_index * card_width
    if (run_to_left_px <= 0)
      run_to_left_px = 0
    // console.log(`最多显示: ${card_max} 当前起点: ${card_current} 目标起点: ${card_index} 卡片宽度: ${card_width}`)
  }
  slideview_content.value.scrollTo({
    top: 0,
    left: run_to_left_px,
    behavior: 'smooth',
  })
}

// 计算最大显示数量
function countMaxNumber() {
  slide_card_length = slideview_content.value.children.length
  card_width = slideview_content.value.firstElementChild.getBoundingClientRect().width
  slide_gap_px = (slideview_content.value.scrollWidth / slide_card_length) - card_width
  card_width += slide_gap_px
  card_max = Math.trunc(slideview_content.value.clientWidth / card_width)
  countDisabled()
}

// 修改分页切换按钮状态
function countDisabled() {
  slideview_scrollLeft.value = slideview_content.value.scrollLeft
  card_current = slideview_content.value.scrollLeft === 0 ? 0 : Math.trunc((slideview_content.value.scrollLeft + card_width / 2) / card_width)
  if (slide_card_length * card_width <= slideview_content.value.clientWidth)
    disabled.value = 3
  else if (slideview_content.value.scrollLeft === 0)
    disabled.value = 0
  else if (slideview_content.value.scrollLeft >= slideview_content.value.scrollWidth - slideview_content.value.clientWidth - 2)
    disabled.value = 2

  else
    disabled.value = 1
}

// 组件加载完成
onMounted(() => {
  // 初次获取元素参数
  countMaxNumber()
  // 窗口大小发生改变时
  window.addEventListener('resize', countMaxNumber)
})
onUnmounted(() => {
  // 卸载事件
  window.removeEventListener('resize', countMaxNumber)
})
onActivated(() => {
  if (slideview_scrollLeft.value !== 0) {
    // console.log(`onActivated: to_scrollLeft, ${slideview_scrollLeft.value}`)
    slideview_content.value.scrollLeft = slideview_scrollLeft.value
  }
})
</script>

<template>
  <div class="flex justify-between mt-3">
    <slot name="title">
      <SlideViewTitle />
    </slot>
    <div v-if="disabled !== 3" class="me-1 d-none d-md-flex">
      <VBtn
        class="rounded-circle"
        variant="text"
        icon="mdi-chevron-left"
        color="grey"
        :disabled="disabled === 0"
        @click="slideNext(false)"
      />
      <VBtn
        class="rounded-circle"
        variant="text"
        icon="mdi-chevron-right"
        color="grey"
        :disabled="disabled === 2"
        @click="slideNext(true)"
      />
    </div>
  </div>
  <div
    ref="slideview_content"
    class="slideview_content grid grid-rows-1 grid-flow-col justify-start gap-4 p-3"
    tabindex="0"
    @scroll="countDisabled"
  >
    <slot name="content" />
  </div>
</template>

<style lang="scss" scoped>
.slideview_content {
  -ms-overflow-style: none !important;
  overflow-x: scroll !important;
  overflow-y: hidden !important;
  overscroll-behavior-x: contain !important;
  scrollbar-width: none !important;
}

.slideview_content::-webkit-scrollbar {
  display: none;
}
</style>
