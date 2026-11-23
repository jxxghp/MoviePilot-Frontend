<script setup lang="ts">
import VDialogCloseBtn from '@/@core/components/DialogCloseBtn.vue'
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import api from '@/api'
import { listStorageOptions } from '@/api/storage'
import type { FileItem } from '@/api/types'
import { useI18n } from 'vue-i18n'
const props = defineProps<{
  storage?: string
  initial?: FileItem
  kind?: 'file' | 'directory' | 'any'
  multiple?: boolean
}>()
const emit = defineEmits<{ select: [items: FileItem[]]; close: [] }>()
const { t } = useI18n()
const storages = ref<{ title: string; value: string }[]>([])
const storage = ref(props.initial?.storage || props.storage || 'local')
const current = ref<FileItem>(
  props.initial?.type === 'dir'
    ? { ...props.initial }
    : { storage: storage.value, type: 'dir', name: '/', path: '/', fileid: 'root' },
)
const stack = ref<FileItem[]>([])
const items = ref<FileItem[]>([])
const selected = ref<FileItem[]>([])
const loading = ref(false)
const failed = ref(false)
const page = ref(1)
const more = ref(false)
let generation = 0
let disposed = false
onBeforeUnmount(() => {
  disposed = true
  generation++
})
const key = (item: FileItem) => `${item.storage}:${item.fileid || item.path}`
const selectedKeys = computed(() => new Set(selected.value.map(key)))
async function load(append = false) {
  const version = ++generation
  loading.value = true
  failed.value = false
  if (!append) items.value = []
  try {
    const data = await api.post<FileItem[]>('storage/list', current.value, {
      params: { page: append ? page.value + 1 : 1, count: 100 },
    })
    if (disposed || version !== generation) return
    items.value = append ? [...items.value, ...data] : data
    page.value = append ? page.value + 1 : 1
    more.value = data.length === 100
  } catch {
    if (!disposed && version === generation) failed.value = true
  } finally {
    if (!disposed && version === generation) loading.value = false
  }
}
function enter(item: FileItem) {
  if (item.type !== 'dir') {
    toggle(item)
    return
  }
  stack.value.push(current.value)
  current.value = item
  void load()
}
function toggle(item: FileItem) {
  if ((props.kind === 'directory' && item.type !== 'dir') || (props.kind === 'file' && item.type !== 'file')) return
  if (selectedKeys.value.has(key(item))) selected.value = selected.value.filter(value => key(value) !== key(item))
  else selected.value = props.multiple ? [...selected.value, item] : [item]
}
function back() {
  const parent = stack.value.pop()
  if (parent) {
    current.value = parent
    void load()
  }
}
watch(storage, value => {
  current.value = { storage: value, type: 'dir', name: '/', path: '/', fileid: 'root' }
  stack.value = []
  selected.value = []
  void load()
})
void listStorageOptions()
  .then(values => {
    if (!disposed) storages.value = values.map(item => ({ title: item.name, value: item.type }))
  })
  .catch(() => {
    if (!disposed) failed.value = true
  })
void load()
</script>
<template>
  <VDialog :model-value="true" max-width="50rem" scrollable @update:model-value="!$event && emit('close')">
    <VCard>
      <VCardTitle>{{ t('file.select') }}</VCardTitle>
      <VDialogCloseBtn @click="emit('close')" />
      <VCardText>
        <VSelect v-model="storage" :items="storages" :label="t('storage.type')" />
        <div class="d-flex align-center ga-2 my-3">
          <VBtn
            icon="mdi-arrow-up"
            variant="text"
            :disabled="!stack.length || loading"
            :aria-label="t('common.back')"
            @click="back"
          />
          <span class="text-break">{{ current.path }}</span>
        </div>
        <VProgressLinear v-if="loading" indeterminate />
        <VAlert v-if="failed" type="error" variant="tonal"
          >{{ t('common.error') }}<VBtn variant="text" @click="load()">{{ t('common.retry') }}</VBtn></VAlert
        >
        <VList>
          <VListItem
            v-for="item in items"
            :key="key(item)"
            :title="item.name"
            :prepend-icon="item.type === 'dir' ? 'mdi-folder' : 'mdi-file-outline'"
            @click="enter(item)"
          >
            <template #append>
              <VBtn
                v-if="kind !== 'directory' || item.type === 'dir'"
                :icon="selectedKeys.has(key(item)) ? 'mdi-checkbox-marked' : 'mdi-checkbox-blank-outline'"
                variant="text"
                :aria-label="t('file.select')"
                :disabled="kind === 'file' && item.type !== 'file'"
                @click.stop="toggle(item)"
              />
            </template>
          </VListItem>
        </VList>
        <VBtn v-if="more" variant="text" :loading="loading" @click="load(true)">{{ t('common.loadMore') }}</VBtn>
      </VCardText>
      <VCardActions>
        <VBtn v-if="kind !== 'file'" variant="text" @click="toggle(current)"
          >{{ t('file.select') }}: {{ current.path }}</VBtn
        >
        <VSpacer />
        <VBtn variant="text" @click="emit('close')">{{ t('common.cancel') }}</VBtn>
        <VBtn :disabled="!selected.length" @click="emit('select', selected)"
          >{{ t('common.confirm') }} ({{ selected.length }})</VBtn
        >
      </VCardActions>
    </VCard>
  </VDialog>
</template>
