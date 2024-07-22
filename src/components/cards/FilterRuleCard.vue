<script lang="ts" setup>
// 输入参数
const props = defineProps({
  pri: String,
  maxpri: String,
  rules: Array as PropType<string[]>,
  width: String,
  height: String,
})

// 定义触发的自定义事件
const emit = defineEmits(['close', 'changed'])

// 按钮点击
function onClose() {
  emit('close')
}

// 选项变化
function filtersChanged(value: string[]) {
  emit('changed', props.pri, value)
}

// 清洗规则中的换行符和多余空格，并在前后添加空格
const cleanedRules = computed(() => {
  return props.rules.map(rule => {
    rule = rule ?? ''
    return ` ${rule.replace(/[\r\n]/g, '').replace(/\s+/g, '')} `
  })
})

// 过滤规则下拉框
const selectFilterOptions = ref<{ [key: string]: string }[]>([
  { title: '特效字幕', value: ' SPECSUB ' },
  { title: '中文字幕', value: ' CNSUB ' },
  { title: '国语配音', value: ' CNVOI ' },
  { title: '官种', value: ' GZ ' },
  { title: '排除: 国语配音', value: ' !CNVOI ' },
  { title: '粤语配音', value: ' HKVOI ' },
  { title: '排除: 粤语配音', value: ' !HKVOI ' },
  { title: '促销: 免费', value: ' FREE ' },
  { title: '分辨率: 4K', value: ' 4K ' },
  { title: '分辨率: 1080P', value: ' 1080P ' },
  { title: '分辨率: 720P', value: ' 720P ' },
  { title: '排除: 720P', value: ' !720P ' },
  { title: '质量: 蓝光原盘', value: ' BLU ' },
  { title: '排除: 蓝光原盘', value: ' !BLU ' },
  { title: '质量: BLURAY', value: ' BLURAY ' },
  { title: '排除: BLURAY', value: ' !BLURAY ' },
  { title: '质量: UHD', value: ' UHD ' },
  { title: '排除: UHD', value: ' !UHD ' },
  { title: '质量: REMUX', value: ' REMUX ' },
  { title: '排除: REMUX', value: ' !REMUX ' },
  { title: '质量: WEB-DL', value: ' WEBDL ' },
  { title: '排除: WEB-DL', value: ' !WEBDL ' },
  { title: '质量: 60fps', value: ' 60FPS ' },
  { title: '排除: 60fps', value: ' !60FPS ' },
  { title: '编码: H265', value: ' H265 ' },
  { title: '排除: H265', value: ' !H265 ' },
  { title: '编码: H264', value: ' H264 ' },
  { title: '排除: H264', value: ' !H264 ' },
  { title: '效果: 杜比视界', value: ' DOLBY ' },
  { title: '排除: 杜比视界', value: ' !DOLBY ' },
  { title: '效果: 杜比全景声', value: ' ATMOS ' },
  { title: '排除: 杜比全景声', value: ' !ATMOS ' },
  { title: '效果: HDR', value: ' HDR ' },
  { title: '排除: HDR', value: ' !HDR ' },
  { title: '效果: SDR', value: ' SDR ' },
  { title: '排除: SDR', value: ' !SDR ' },
  { title: '效果: 3D', value: ' 3D ' },
  { title: '排除: 3D', value: ' !3D ' },
])
</script>

<template>
  <VCard variant="tonal" :width="props.width" :height="props.height">
    <span class="absolute top-3 right-12">
      <IconBtn>
        <VIcon class="cursor-move" icon="mdi-drag" />
      </IconBtn>
    </span>
    <DialogCloseBtn @click="onClose" />
    <VCardItem>
      <VCardTitle>优先级 {{ props.pri }}</VCardTitle>
      <VRow>
        <VCol>
          <VSelect
            v-model="cleanedRules"
            variant="underlined"
            :items="selectFilterOptions"
            chips
            label=""
            multiple
            @update:modelValue="filtersChanged"
          />
        </VCol>
      </VRow>
    </VCardItem>
  </VCard>
</template>
