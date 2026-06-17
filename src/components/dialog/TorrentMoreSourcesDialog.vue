<script setup lang="ts">
import type { Context } from '@/api/types'
import { formatFileSize } from '@/@core/utils/formatters'

// 输入参数
const props = defineProps({
  modelValue: {
    type: Boolean,
    default: true,
  },
  items: {
    type: Array as PropType<Context[]>,
    default: () => [],
  },
  siteIcons: {
    type: Object as PropType<Record<number, string>>,
    default: () => ({}),
  },
})

// 定义触发的自定义事件
const emit = defineEmits(['update:modelValue', 'close', 'download', 'detail'])

// 弹窗显示状态
const visible = computed({
  get: () => props.modelValue,
  set: value => {
    emit('update:modelValue', value)
    if (!value) emit('close')
  },
})

/** 获取优惠标签类。 */
function getPromotionChipClass(downloadVolumeFactor: number | undefined, uploadVolumeFactor: number | undefined) {
  if (!downloadVolumeFactor) return 'chip-free'
  if (downloadVolumeFactor === 0) return 'chip-free'
  else if (downloadVolumeFactor < 1) return 'chip-discount'
  else if (uploadVolumeFactor !== undefined && uploadVolumeFactor > 1) return 'chip-bonus'
  else return ''
}

/** 选择更多来源进行下载。 */
function handleDownload(item: Context) {
  emit('download', item)
}

/** 打开种子详情页。 */
function handleDetail(item: Context) {
  emit('detail', item)
}
</script>

<template>
  <VDialog v-if="visible" v-model="visible" max-width="25rem" location="center">
    <VCard>
      <VCardTitle class="py-3 d-flex align-center">
        <span>其他来源</span>
        <VSpacer />
        <VBtn variant="text" size="small" icon="mdi-close" @click.stop="visible = false"></VBtn>
      </VCardTitle>

      <VDivider />

      <VCardText class="more-sources-content pa-0">
        <VList lines="one" density="compact">
          <VListItem
            v-for="(item, index) in props.items"
            :key="index"
            @click.stop="handleDownload(item)"
            class="hover:bg-primary-lighten-5"
          >
            <template v-slot:prepend>
              <div class="d-flex align-center gap-1">
                <VImg
                  v-if="props.siteIcons[item.torrent_info?.site || 0]"
                  :src="props.siteIcons[item.torrent_info?.site || 0]"
                  :alt="item.torrent_info?.site_name"
                  width="16"
                  height="16"
                  class="rounded"
                />
                <VAvatar v-else size="16" class="text-caption bg-surface-variant">
                  {{ item.torrent_info?.site_name?.substring(0, 1) }}
                </VAvatar>
                <span class="text-body-2 font-weight-bold">{{ item.torrent_info.site_name }}</span>

                <VChip
                  v-if="item.meta_info?.season_episode"
                  class="chip-season rounded-sm ml-1"
                  size="x-small"
                  variant="elevated"
                >
                  {{ item.meta_info.season_episode }}
                </VChip>

                <VChip
                  v-if="item.torrent_info?.downloadvolumefactor !== 1 || item.torrent_info?.uploadvolumefactor !== 1"
                  :class="
                    getPromotionChipClass(
                      item.torrent_info?.downloadvolumefactor,
                      item.torrent_info?.uploadvolumefactor,
                    )
                  "
                  size="x-small"
                  variant="elevated"
                  class="rounded-sm ml-1"
                >
                  {{ item.torrent_info?.volume_factor }}
                </VChip>
              </div>
            </template>

            <template v-slot:append>
              <div class="d-flex align-center gap-2">
                <span class="text-caption font-weight-bold text-primary">
                  {{ formatFileSize(item.torrent_info?.size) }}
                </span>
                <span class="d-flex align-center text-caption font-weight-bold">
                  <VIcon size="small" color="success" icon="mdi-arrow-up" class="mr-1"></VIcon>
                  {{ item.torrent_info?.seeders }}
                </span>
                <span>
                  <VIcon
                    @click.stop="handleDetail(item)"
                    size="small"
                    color="secondary"
                    icon="mdi-arrow-top-right"
                    class="mr-1"
                  ></VIcon>
                </span>
              </div>
            </template>
          </VListItem>
        </VList>
      </VCardText>
    </VCard>
  </VDialog>
</template>

<style scoped>
.more-sources-content {
  max-block-size: 60vh;
  overflow-y: auto;
}

.chip-season {
  background-color: #3f51b5;
  color: white;
}

.chip-free {
  background-color: #4caf50;
  color: white;
}

.chip-discount {
  background-color: #ff5722;
  color: white;
}

.chip-bonus {
  background-color: #9c27b0;
  color: white;
}
</style>
