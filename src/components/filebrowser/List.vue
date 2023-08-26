<script lang="ts" setup>
import type { Axios } from 'axios'
import type { PropType } from 'vue'
import { useConfirm } from 'vuetify-use-dialog'
import { formatBytes } from '@core/utils/formatters'
import type { EndPoints, FileItem } from '@/api/types'

// 输入参数
const props = defineProps({
  icons: Object,
  storage: String,
  path: String,
  endpoints: Object as PropType<EndPoints>,
  axios: Object as PropType<Axios>,
  refreshpending: Boolean,
})

// 对外事件
const emit = defineEmits(['loading', 'pathchanged', 'refreshed', 'filedeleted'])

// 确认框
const createConfirm = useConfirm()

// 内容列表
const items = ref<FileItem[]>([])

// 当前路径
const path = ref(props.path ?? '')

// 过滤条件
const filter = ref('')

// 存储空间类型
const storage = ref(props.storage || '')

// 是否正在加载
const refreshPending = ref(props.refreshpending || false)

// 目录过滤
const dirs = computed(() =>
  items.value.filter(item => item.type === 'dir' && item.basename.includes(filter.value)),
)

// 文件过滤
const files = computed(() =>
  items.value.filter(item => item.type === 'file' && item.basename.includes(filter.value)),
)

// 是否目录
const isDir = computed(() => path.value.endsWith('/'))

// 是否文件
const isFile = computed(() => !isDir.value)

// 调API加载内容
async function load() {
  if (isDir.value) {
    const url = props.endpoints?.list.url
      .replace(/{storage}/g, storage.value)
      .replace(/{path}/g, path.value)

    const config = {
      url,
      method: props.endpoints?.list.method || 'get',
    }

    const response = await props.axios?.request(config)
    items.value = response?.data
  }
}

// 删除项目
async function deleteItem(item: FileItem) {
  const confirmed = await createConfirm({
    title: '确认',
    content: `是否确认删除${
                item.type === 'dir' ? '目录' : '文件'
            }?<br><em>${item.basename}</em>?`,
    confirmationText: '确认',
    cancellationText: '取消',
    dialogProps: {
      maxWidth: 600,
    },
  })

  if (confirmed) {
    emit('loading', true)
    const url = props.endpoints?.delete.url
      .replace(/{storage}/g, storage.value)
      .replace(/{path}/g, item.path)

    const config = {
      url,
      method: props.endpoints?.delete.method || 'post',
    }

    await props.axios?.request(config)
    emit('filedeleted')
    emit('loading', false)
  }
}

// 切换路径
function changePath(path: string) {
  emit('pathchanged', path)
}

// 监听path变化
watch(
  () => path.value,
  async () => {
    items.value = []
    await load()
    if (refreshPending.value) {
      await load()
      emit('refreshed')
    }
  },
)
</script>

<template>
  <VCard flat tile min-height="380" class="d-flex flex-column">
    <VCardText
      v-if="!path"
      class="grow d-flex justify-center align-center grey--text"
    >
      选择目录或文件
    </VCardText>
    <VCardText
      v-else-if="isFile"
      class="grow d-flex justify-center align-center"
    >
      文件: {{ path }}
    </VCardText>
    <VCardText v-else-if="dirs.length || files.length" class="grow">
      <VList v-if="dirs.length" subheader>
        <VListSubheader>目录</VListSubheader>
        <VListItem
          v-for="(item, index) in dirs"
          :key="index"
          class="pl-0"
          @click="changePath(item.path)"
        >
          <template #prepend>
            <VIcon icon="mdi-folder-outline" />
          </template>
          <VListItemTitle v-text="item.basename" />
          <template #append>
            <VBtn icon @click.stop="deleteItem(item)">
              <VIcon color="grey lighten-1">
                mdi-delete-outline
              </VIcon>
            </VBtn>
          </template>
        </VListItem>
      </VList>
      <VDivider v-if="dirs.length && files.length" />
      <VList v-if="files.length" subheader>
        <VListSubheader>文件</VListSubheader>
        <VListItem
          v-for="(item, index) in files"
          :key="index"
          class="pl-0"
          @click="changePath(item.path)"
        >
          <template #prepend>
            <VIcon v-if="props.icons" :icon="props.icons[item.extension.toLowerCase()] || props.icons?.other" />
          </template>

          <VListItemTitle v-text="item.basename" />
          <VListItemSubtitle> {{ formatBytes(item.size) }}</VListItemSubtitle>

          <template #append>
            <VBtn icon @click.stop="deleteItem(item)">
              <VIcon color="grey lighten-1">
                mdi-delete-outline
              </VIcon>
            </VBtn>
          </template>
        </VListItem>
      </VList>
    </VCardText>
    <VCardText
      v-else-if="filter"
      class="grow d-flex justify-center align-center grey--text py-5"
    >
      没有目录或文件
    </VCardText>
    <VCardText
      v-else
      class="grow d-flex justify-center align-center grey--text py-5"
    >
      空目录
    </VCardText>
    <VDivider v-if="path" />
    <VToolbar v-if="path && isFile" density="compact" flat color="gray">
      <VTextField
        v-model="filter"
        hide-details
        flat
        density="compact"
        variant="solo-filled"
        placeholder="搜索 ..."
        prepend-inner-icon="mdi-filter-outline"
        class="me-2"
      />
      <VBtn icon>
        <VIcon>mdi-download</VIcon>
      </VBtn>
      <VBtn icon @click="load">
        <VIcon>mdi-refresh</VIcon>
      </VBtn>
    </VToolbar>
  </VCard>
</template>

<style lang="scss" scoped>
.v-card {
    height: 100%;
}
.v-toolbar{
  background: rgb(var(--v-table-header-background));
}
</style>
