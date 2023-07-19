<script lang="ts" setup>
// 定义触发的自定义事件
const emit = defineEmits(["close", "changed"]);

// 输入参数
const props = defineProps({
  pri: String,
  rules: Array as PropType<string[]>,
  width: String,
  height: String,
});

// 按钮点击
const onClose = () => {
  emit("close");
};

// 选项变化
const filtersChanged = (value: string[]) => {
  emit("changed", props.pri, value);
};

// 过滤规则下拉框
const selectFilterOptions = ref<{ [key: string]: string }[]>([
  { title: "特效字幕", value: " SPECSUB ", color: "success" },
  { title: "中文字幕", value: " CNSUB ", color: "success" },
  { title: "分辨率: 4K", value: " 4K ", color: "success" },
  { title: "分辨率: 1080P", value: " 1080P ", color: "success" },
  { title: "蓝光原盘", value: " BLU ", color: "success" },
  { title: "排除蓝光原盘", value: " !BLU ", color: "error" },
  { title: "Remux", value: " REMUX ", color: "success" },
  { title: "排除Remux", value: " !REMUX ", color: "error" },
  { title: "WEB-DL", value: " WEBDL ", color: "success" },
  { title: "排除WEB-DL", value: " !WEBDL ", color: "error" },
  { title: "H265", value: " H265 ", color: "success" },
  { title: "排除H265", value: " !H265 ", color: "error" },
  { title: "H264", value: " H264 ", color: "success" },
  { title: "排除H264", value: " !H264 ", color: "error" },
  { title: "杜比", value: " DOLBY ", color: "success" },
  { title: "排除杜比", value: " !DOLBY ", color: "error" },
  { title: "HDR", value: " HDR ", color: "success" },
  { title: "排除HDR", value: " !HDR ", color: "error" },
  { title: "免费", value: " FREE ", color: "success" },
]);

// 已选择的过滤规则
const selectedFilters = ref<string[]>(props.rules ?? []);
</script>
<template>
  <VCard variant="tonal" :width="props.width" :height="props.height">
    <DialogCloseBtn @click="onClose" />
    <VCardItem>
      <VCardTitle>优先级 {{ props.pri }}</VCardTitle>
      <VRow>
        <VCol>
          <VSelect
            variant="underlined"
            :key="props.pri"
            v-model="selectedFilters"
            :items="selectFilterOptions"
            @update:modelValue="filtersChanged"
            chips
            label=""
            multiple
          >
          </VSelect>
        </VCol>
      </VRow>
    </VCardItem>
  </VCard>
</template>
