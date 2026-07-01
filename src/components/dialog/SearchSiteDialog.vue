<script setup lang="ts">
import type { Site } from '@/api/types'
import { useI18n } from 'vue-i18n'
import { useDisplay } from 'vuetify'

// 多语言支持
const { t } = useI18n()

// 显示器宽度
const display = useDisplay()

const props = defineProps({
  sites: {
    type: Array as PropType<Site[]>,
    required: true,
  },
  selected: Array as PropType<number[]>,
})

// 定义事件
const emit = defineEmits(['close', 'search', 'reload'])

// 过滤词
const siteFilter = ref('')

// 已选择站点
const selectedSites = ref<number[]>([])

// 根据当前可用站点清理选中项，避免停用或已删除站点参与计数。
function normalizeSelectedSites(selectedSiteIds: number[] = []) {
  const availableSiteIds = new Set(props.sites.map((site: Site) => site.id))
  const normalizedSiteIds: number[] = []

  selectedSiteIds.forEach(siteId => {
    if (availableSiteIds.has(siteId) && !normalizedSiteIds.includes(siteId)) {
      normalizedSiteIds.push(siteId)
    }
  })

  return normalizedSiteIds
}

watch(
  [() => props.selected, () => props.sites],
  ([value]) => {
    selectedSites.value = normalizeSelectedSites(value || [])
  },
  { immediate: true },
)

// 全选/全不选按钮文字
const checkAllText = computed(() => {
  return selectedSites.value.length < props.sites.length
    ? t('dialog.searchSite.selectAll')
    : t('dialog.searchSite.deselectAll')
})

// 全选/全不选
const checkAllSitesorNot = () => {
  if (selectedSites.value.length < props.sites.length) {
    selectedSites.value = props.sites.map((item: Site) => item.id)
  } else {
    selectedSites.value = []
  }
}

// 切换单个站点的选择状态。
function toggleSiteSelection(siteId: number) {
  const index = selectedSites.value.indexOf(siteId)
  if (index === -1) {
    selectedSites.value.push(siteId)
  } else {
    selectedSites.value.splice(index, 1)
  }
}

// 确认搜索时只提交当前可用站点。
function confirmSearch() {
  emit('search', normalizeSelectedSites(selectedSites.value))
}

// 根据筛选条件过滤站点
const filteredSites = computed(() => {
  if (!siteFilter.value) return props.sites
  const filter = siteFilter.value.toLowerCase()
  return props.sites.filter((site: Site) => site.name.toLowerCase().includes(filter))
})
</script>
<template>
  <!-- Site Selection Dialog -->
  <VDialog max-width="40rem" :fullscreen="!display.smAndUp.value">
    <VCard class="site-dialog">
      <VCardItem>
        <template #prepend>
          <VIcon icon="mdi-web-check" />
        </template>
        <VCardTitle>
          {{ t('dialog.searchSite.selectSites') }}
        </VCardTitle>
      </VCardItem>
      <VDialogCloseBtn @click="emit('close')" />
      <VDivider />
      <VCardText style="max-block-size: 420px" class="overflow-y-auto px-4 py-4">
        <!-- 站点列表 -->
        <div v-if="filteredSites.length > 0">
          <!-- 选择操作 -->
          <div class="d-flex align-center mb-4">
            <VBtn
              size="small"
              :color="selectedSites.length < sites.length ? 'primary' : 'error'"
              @click="checkAllSitesorNot"
              class="me-2"
              rounded="pill"
              variant="flat"
            >
              <VIcon start size="small">
                {{ selectedSites.length < sites.length ? 'mdi-check-all' : 'mdi-close-circle-outline' }}
              </VIcon>
              {{ checkAllText }}
            </VBtn>
            <div
              class="text-body-2 font-weight-medium"
              :class="selectedSites.length > 0 ? 'text-primary' : 'text-medium-emphasis'"
            >
              {{ t('dialog.searchSite.searchAllSites', { selected: selectedSites.length, total: sites.length }) }}
            </div>
          </div>

          <!-- 站点选择器 -->
          <VRow dense>
            <VCol v-for="site in filteredSites" :key="site.id" cols="6" sm="6" md="4">
              <VHover v-slot="{ isHovering, props }">
                <div
                  v-bind="props"
                  :class="[
                    'site-checkbox-wrapper pa-2 pa-sm-3 d-flex align-center',
                    {
                      'site-selected': selectedSites.includes(site.id),
                      'site-hover': isHovering && !selectedSites.includes(site.id),
                    },
                  ]"
                  @click="toggleSiteSelection(site.id)"
                >
                  <VIcon
                    :icon="selectedSites.includes(site.id) ? 'mdi-check-circle' : 'mdi-checkbox-blank-circle-outline'"
                    :color="selectedSites.includes(site.id) ? 'primary' : 'medium-emphasis'"
                    class="me-2"
                    size="small"
                  />
                  <span :class="['text-body-2 site-name', { 'font-weight-medium': selectedSites.includes(site.id) }]">
                    {{ site.name }}
                  </span>
                </div>
              </VHover>
            </VCol>
          </VRow>
        </div>
        <div v-else class="text-center py-8 empty-site-state">
          <div class="search-icon-wrapper mb-4 mx-auto warning">
            <VIcon icon="mdi-alert-circle-outline" size="large" color="warning" />
          </div>
          <div class="text-h6 font-weight-medium mb-2">{{ t('torrent.noMatchingResults') }}</div>
          <div class="text-subtitle-1 text-medium-emphasis mb-4">
            {{ siteFilter ? t('site.noFilterData') : t('site.sitesWillBeShownHere') }}
          </div>
          <VBtn
            v-if="siteFilter"
            color="primary"
            variant="flat"
            class="mt-3"
            prepend-icon="mdi-refresh"
            @click="siteFilter = ''"
          >
            {{ t('torrent.clearFilters') }}
          </VBtn>
          <VBtn v-else color="primary" variant="flat" class="mt-3" prepend-icon="mdi-refresh" @click="emit('reload')">
            {{ t('common.loading') }}
          </VBtn>
        </div>
      </VCardText>

      <VCardActions class="app-dialog-actions">
        <VSpacer />
        <VBtn
          color="primary"
          variant="flat"
          :disabled="selectedSites.length === 0"
          @click="confirmSearch"
          prepend-icon="mdi-magnify"
          class="d-flex align-center justify-center px-5"
        >
          {{ t('common.search') }}
        </VBtn>
      </VCardActions>
    </VCard>
  </VDialog>
</template>
<style scoped>
.site-checkbox-wrapper {
  border: 1px solid rgba(var(--v-theme-on-surface), 0.08);
  border-radius: var(--app-surface-radius);
  cursor: pointer;
  transition:
    transform 0.2s ease,
    background-color 0.2s ease;
}

.site-checkbox-wrapper:hover {
  transform: translateY(-2px);
}

.site-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.site-selected {
  border-color: rgba(var(--v-theme-primary), 0.2);
  background-color: rgba(var(--v-theme-primary), 0.08);
  color: rgb(var(--v-theme-primary));
}

.site-hover {
  background-color: rgba(var(--v-theme-primary), 0.04);
}
</style>
