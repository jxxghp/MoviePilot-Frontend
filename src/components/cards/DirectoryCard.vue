<script lang="ts" setup>
import type { MediaDirectory } from '@/api/types'
import { VTextField } from 'vuetify/lib/components/index.mjs'

// 输入参数
const props = defineProps({
  type: String, // download/library
  directory: {
    type: Object as PropType<MediaDirectory>,
    required: true, // 必填参数
  },
  categories: {
    type: Object as PropType<{ [key: string]: any }>,
    required: true,
  },
  width: String,
  height: String,
})

// 路径
const path = ref<string>('')

// 类型下拉字典
const typeItems = [
  { title: '全部', value: '' },
  { title: '电影', value: '电影' },
  { title: '电视剧', value: '电视剧' },
]

// 定义触发的自定义事件
const emit = defineEmits(['close', 'changed', 'update:modelValue'])

// 按钮点击
function onClose() {
  emit('close')
}

// 路径更新
function updatePath(value: string) {
  path.value = value
  emit('update:modelValue', value)
}

// 根据选中的媒体类型，获取对应的媒体类别
const getCategories = computed(() => {
  const default_value = [{ title: '全部', value: '' }]
  if (!props.categories || !props.categories[props.directory?.media_type ?? '']) return default_value
  return default_value.concat(props.categories[props.directory.media_type ?? ''])
})
</script>

<template>
  <VCard variant="tonal" :width="props.width" :height="props.height">
    <DialogCloseBtn @click="onClose" />
    <VCardItem>
      <VTextField
        v-model="props.directory.name"
        variant="underlined"
        label="别名"
        class="me-20 text-high-emphasis font-weight-bold"
      />
      <span class="absolute top-3 right-12">
        <IconBtn>
          <VIcon class="cursor-move" icon="mdi-drag" />
        </IconBtn>
      </span>
    </VCardItem>
    <VCardText>
      <VForm>
        <VRow>
          <VCol>
            <VPathField @update:modelValue="updatePath">
              <template #activator="{ menuprops }">
                <VTextField v-model="props.directory.path" v-bind="menuprops" variant="underlined" label="路径" />
              </template>
            </VPathField>
          </VCol>
        </VRow>
        <VRow>
          <VCol cols="4">
            <VSelect
              v-model="props.directory.media_type"
              variant="underlined"
              :items="typeItems"
              label="媒体类型"
              @update:modelValue="props.directory.category = ''"
            />
          </VCol>
          <VCol>
            <VSelect v-model="props.directory.category" variant="underlined" :items="getCategories" label="媒体类别" />
          </VCol>
        </VRow>
        <VRow>
          <VCol v-if="!props.directory.category || props.directory.category === ''">
            <VSwitch v-model="props.directory.auto_category" label="自动分类"></VSwitch>
          </VCol>
          <VCol v-if="type === 'library'">
            <VSwitch v-model="props.directory.scrape" label="刮削元数据"></VSwitch>
          </VCol>
        </VRow>
      </VForm>
    </VCardText>
  </VCard>
</template>
