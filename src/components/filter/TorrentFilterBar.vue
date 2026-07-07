<script lang="ts" setup>
import { useI18n } from 'vue-i18n'
import { useEventListener } from '@vueuse/core'
import { openSharedDialog } from '@/composables/useSharedDialog'

const TorrentAllFiltersDialog = defineAsyncComponent(() => import('@/components/dialog/TorrentAllFiltersDialog.vue'))
const TorrentSingleFilterDialog = defineAsyncComponent(() => import('@/components/dialog/TorrentSingleFilterDialog.vue'))

// 国际化
const { t } = useI18n()

// 定义输入参数
const props = defineProps<{
  // 筛选表单
  filterForm: Record<string, string[]>
  // 筛选选项
  filterOptions: Record<string, string[]>
  // 排序字段
  sortField: string
  // 排序方向
  sortType: 'asc' | 'desc'
  // 筛选后的总数量
  totalFilteredCount: number
  // 过滤项标题映射
  filterTitles: Record<string, string>
  // 排序标题映射
  sortTitles: Record<string, string>
  // 是否启用滚动动画
  enableAnimation?: boolean
}>()

// 定义事件
const emit = defineEmits<{
  'update:sortField': [value: string]
  'update:sortType': [value: 'asc' | 'desc']
  'update:filterForm': [key: string, values: string[]]
  'selectAll': [key: string]
  'clearFilter': [key: string]
  'clearAllFilters': []
  'removeFilter': [key: string, value: string]
}>()

// 过滤菜单相关
const currentFilter = ref('site')
const currentFilterTitle = computed(() => props.filterTitles[currentFilter.value])

let allFilterDialogController: ReturnType<typeof openSharedDialog> | null = null
let filterDialogController: ReturnType<typeof openSharedDialog> | null = null

// 计算已选择的过滤条件数量
const getFilterCount = computed(() => {
  let count = 0
  for (const key in props.filterForm) {
    count += props.filterForm[key].length
  }
  return count
})

// 计算已选择的过滤条件
const getSelectedFilters = computed(() => {
  const filters: Record<string, string[]> = {}
  for (const key in props.filterForm) {
    if (props.filterForm[key].length > 0) {
      filters[key] = [...props.filterForm[key]]
    }
  }
  return filters
})

// 给定过滤类型返回不同图标
function getFilterIcon(key: string) {
  const icons: Record<string, string> = {
    site: 'mdi-server-network',
    season: 'mdi-television-classic',
    freeState: 'mdi-gift-outline',
    resolution: 'mdi-monitor-screenshot',
    videoCode: 'mdi-video-vintage',
    edition: 'mdi-quality-high',
    releaseGroup: 'mdi-account-group-outline',
  }
  return icons[key] || 'mdi-filter-variant'
}

// 生成全部筛选共享弹窗的最新参数。
function getAllFiltersDialogProps() {
  return {
    filterForm: props.filterForm,
    filterOptions: props.filterOptions,
    filterTitles: props.filterTitles,
  }
}

// 生成单项筛选共享弹窗的最新参数。
function getSingleFilterDialogProps() {
  return {
    filterForm: props.filterForm,
    filterKey: currentFilter.value,
    filterOptions: props.filterOptions,
    filterTitle: currentFilterTitle.value,
  }
}

// 关闭全部筛选共享弹窗。
function closeAllFilterDialog() {
  allFilterDialogController?.close()
  allFilterDialogController = null
}

// 关闭单项筛选共享弹窗。
function closeFilterDialog() {
  filterDialogController?.close()
  filterDialogController = null
}

// 打开全部筛选共享弹窗。
function openAllFilterDialog() {
  allFilterDialogController?.close()
  allFilterDialogController = openSharedDialog(
    TorrentAllFiltersDialog,
    getAllFiltersDialogProps(),
    {
      clearAllFilters,
      clearFilter,
      close: () => {
        allFilterDialogController = null
      },
      selectAll,
      'update:filterForm': handleFilterChange,
      'update:modelValue': (value: boolean) => {
        if (!value) allFilterDialogController = null
      },
    },
    { closeOn: ['close', 'update:modelValue'] },
  )
}

// 打开单项筛选共享弹窗。
function openFilterDialog() {
  if (filterDialogController) {
    filterDialogController.updateProps(getSingleFilterDialogProps())
    return
  }

  filterDialogController = openSharedDialog(
    TorrentSingleFilterDialog,
    getSingleFilterDialogProps(),
    {
      clearFilter,
      close: () => {
        filterDialogController = null
      },
      selectAll,
      'update:filterForm': handleFilterChange,
      'update:modelValue': (value: boolean) => {
        if (!value) filterDialogController = null
      },
    },
    { closeOn: ['close', 'update:modelValue'] },
  )
}

// 开关全部筛选菜单。
function toggleAllFilterMenu() {
  if (allFilterDialogController) closeAllFilterDialog()
  else openAllFilterDialog()
}

// 切换单项筛选共享弹窗。
function toggleFilterMenu(key: string) {
  if (currentFilter.value === key && filterDialogController) {
    closeFilterDialog()
  } else {
    currentFilter.value = key
    openFilterDialog()
  }
}

// 处理筛选值变化
function handleFilterChange(key: string, values: string[]) {
  emit('update:filterForm', key, values)
}

// 全选某个过滤项
function selectAll(key: string) {
  emit('selectAll', key)
}

// 清除某个过滤项
function clearFilter(key: string) {
  emit('clearFilter', key)
}

// 清除所有过滤条件
function clearAllFilters() {
  emit('clearAllFilters')
}

// 移除单个过滤条件
function removeFilter(key: string, value: string) {
  emit('removeFilter', key, value)
}

// 滚动条引用
const filterBarRef = ref<HTMLElement>()

/**
 * 自定义平滑滚动
 * @param element 元素
 * @param target 目标位置
 * @param duration 持续时间(ms)
 */
function smoothScroll(element: HTMLElement, target: number, duration: number) {
  const start = element.scrollLeft
  const change = target - start
  let startTime: number | null = null

  function animate(currentTime: number) {
    if (startTime === null) startTime = currentTime
    const timeElapsed = currentTime - startTime
    const progress = Math.min(timeElapsed / duration, 1)

    // 使用 ease-in-out 缓动函数
    const ease = progress < 0.5 ? 2 * progress * progress : -1 + (4 - 2 * progress) * progress
    element.scrollLeft = start + change * ease

    if (timeElapsed < duration) {
      requestAnimationFrame(animate)
    }
  }

  requestAnimationFrame(animate)
}

// 初始滚动动画
onMounted(() => {
  if (filterBarRef.value) {
    useEventListener(filterBarRef, 'wheel', (e: WheelEvent) => {
      if (e.deltaY !== 0) {
        e.preventDefault()
        filterBarRef.value!.scrollLeft += e.deltaY
      }
    })
  }

  if (props.enableAnimation === false) return

  nextTick(() => {
    setTimeout(() => {
      const el = filterBarRef.value
      if (el && el.clientWidth > 0 && el.scrollWidth > el.clientWidth) {
        // 检查当前视口范围内的最后一个元素（即右侧边缘处的元素）
        const containerRect = el.getBoundingClientRect()
        const children = Array.from(el.children) as HTMLElement[]
        const lastInViewport = children
          .filter(c => {
            const rect = c.getBoundingClientRect()
            return rect.left < containerRect.right
          })
          .pop()

        if (lastInViewport) {
          const rect = lastInViewport.getBoundingClientRect()
          const visibleWidth = Math.min(rect.right, containerRect.right) - rect.left
          const visibleRatio = visibleWidth / rect.width

          // 判断是否是列表最后一个元素
          const isLastItem = lastInViewport === children[children.length - 1]

          // 1. 如果是最后一个元素，且显示比例超过80%，说明基本已经展示完了，不需要动画
          if (isLastItem && visibleRatio > 0.8) {
            return
          }

          // 2. 如果视口内最后一个元素显示比例在30%到80%之间（明显的截断状态），用户能感知到后面还有内容，不需要滚动提示
          // 比例过小(<0.3)可能看不清，非最后一个元素且比例过大(>0.8)可能误以为是结尾，这两种情况都需要提示
          if (visibleRatio > 0.3 && visibleRatio < 0.8) {
            return
          }
        }

        // 滚动到底部 (1100ms)
        smoothScroll(el, el.scrollWidth - el.clientWidth, 1100)
        // 短暂停止后滚动回顶部 (1100ms)
        setTimeout(() => {
          smoothScroll(el, 0, 1100)
        }, 1600)
      }
    }, 500)
  })
})
</script>

<template>
  <!-- PC端头部和筛选栏 -->
  <div class="search-header d-none d-sm-block">
    <VCard class="view-header filter-toolbar-card mb-3" elevation="0">
      <div class="d-flex align-center pa-3">
        <!-- 固定位置：资源数量和排序 -->
        <div class="d-flex align-center flex-shrink-0">
          <VChip
            color="primary"
            variant="flat"
            size="small"
            class="search-count me-3 flex-shrink-0"
            prepend-icon="mdi-magnify"
          >
            {{ totalFilteredCount }} {{ t('torrent.resources') }}
          </VChip>

          <VBtn variant="text" size="small" class="sort-btn" :color="undefined">
            <template #prepend>
              <VIcon :icon="sortType === 'asc' ? 'mdi-sort-ascending' : 'mdi-sort-descending'" class="me-1" />
            </template>
            <span class="text-subtitle-2">{{ sortTitles[sortField] }}</span>
            <VIcon icon="mdi-chevron-down" size="16" class="ms-1" />

            <VMenu activator="parent" transition="slide-y-transition">
              <VList density="compact" min-width="120" class="sort-menu-list">
                <!-- 升序/降序 选项 -->
                <VListItem
                  value="asc"
                  :active="sortType === 'asc'"
                  color="primary"
                  @click="emit('update:sortType', 'asc')"
                  class="px-3"
                >
                  <template #prepend>
                    <VIcon icon="mdi-sort-ascending" size="small" class="me-2" />
                  </template>
                  <VListItemTitle>{{ t('common.ascending') }}</VListItemTitle>
                </VListItem>
                <VListItem
                  value="desc"
                  :active="sortType === 'desc'"
                  color="primary"
                  @click="emit('update:sortType', 'desc')"
                  class="px-3"
                >
                  <template #prepend>
                    <VIcon icon="mdi-sort-descending" size="small" class="me-2" />
                  </template>
                  <VListItemTitle>{{ t('common.descending') }}</VListItemTitle>
                </VListItem>

                <VDivider class="my-1" />

                <!-- 排序字段选项 -->
                <VListItem
                  v-for="(title, key) in sortTitles"
                  :key="key"
                  :value="key"
                  :active="sortField === key"
                  color="primary"
                  @click="emit('update:sortField', key as string)"
                  class="px-3"
                >
                  <VListItemTitle>{{ title }}</VListItemTitle>
                </VListItem>
              </VList>
            </VMenu>
          </VBtn>

          <div class="filter-divider"></div>
        </div>

        <!-- 滚动区域：筛选条件 -->
        <div class="filter-bar" ref="filterBarRef">
          <!-- 筛选按钮 -->
          <VBtn
            v-for="(title, key) in filterTitles"
            v-show="filterOptions[key].length > 0"
            :key="key"
            variant="tonal"
            size="small"
            color="primary"
            :prepend-icon="getFilterIcon(key)"
            class="filter-btn"
            rounded="pill"
          >
            {{ title }}
            <VChip v-if="filterForm[key].length > 0" size="small" color="primary" class="ms-1" variant="elevated">
              {{ filterForm[key].length }}
            </VChip>
            <VMenu activator="parent" :close-on-content-click="false" scrim>
              <VCard max-width="20rem">
                <VCardText class="filter-menu-content">
                  <div class="flex justify-between">
                    <VBtn variant="text" size="small" color="primary" @click="selectAll(key)">
                      {{ t('torrent.selectAll') }}
                    </VBtn>
                    <VBtn
                      v-if="filterForm[key].length > 0"
                      variant="text"
                      size="small"
                      color="error"
                      @click="clearFilter(key)"
                    >
                      {{ t('torrent.clear') }}
                    </VBtn>
                  </div>
                  <VChipGroup
                    :model-value="filterForm[key]"
                    @update:model-value="(val: string[]) => handleFilterChange(key, val)"
                    column
                    multiple
                    class="filter-options"
                  >
                    <VChip
                      v-for="option in filterOptions[key]"
                      :key="option"
                      :value="option"
                      filter
                      variant="elevated"
                      class="ma-1 filter-chip"
                      size="small"
                    >
                      {{ option }}
                    </VChip>
                  </VChipGroup>
                </VCardText>
              </VCard>
            </VMenu>
          </VBtn>

          <!-- 全部筛选按钮 -->
          <VBtn
            variant="tonal"
            size="small"
            color="primary"
            class="filter-btn me-2"
            prepend-icon="mdi-filter-variant"
            rounded="pill"
            @click="toggleAllFilterMenu"
          >
            {{ t('torrent.allFilters') }}
            <VChip v-if="getFilterCount > 0" size="small" color="primary" class="ms-1" variant="elevated">
              {{ getFilterCount }}
            </VChip>
          </VBtn>
        </div>
      </div>

      <div v-if="getFilterCount > 0" class="selected-filters">
        <div class="d-flex align-center">
          <div class="d-flex flex-wrap align-center flex-grow-1">
            <template v-for="(values, key) in getSelectedFilters" :key="key">
              <VChip
                v-for="(value, index) in values"
                :key="`${key}-${index}`"
                color="primary"
                size="small"
                closable
                variant="elevated"
                class="me-1 mb-1 mt-1 filter-tag"
                @click:close="removeFilter(key as string, value)"
              >
                <VIcon size="small" :icon="getFilterIcon(key as string)" class="me-1"></VIcon>
                <strong>{{ filterTitles[key as string] }}:</strong> {{ value }}
              </VChip>
            </template>
          </div>

          <VSpacer />

          <!-- 清除全部筛选按钮 -->
          <VBtn
            v-if="getFilterCount > 0"
            variant="text"
            size="small"
            color="error"
            @click="clearAllFilters"
            class="ms-2 flex-shrink-0"
            prepend-icon="mdi-close-circle-outline"
          >
            {{ t('torrent.clearFilters') }}
          </VBtn>
        </div>
      </div>
    </VCard>
  </div>

  <!-- 移动端头部和筛选区域 -->
  <VCard class="d-block d-sm-none search-header-mobile filter-toolbar-card mb-3" elevation="0">
    <div class="view-header">
      <div class="d-flex align-center flex-wrap pa-2">
        <div class="d-flex align-center w-100">
          <VChip
            color="primary"
            variant="elevated"
            size="small"
            class="search-count me-auto"
            prepend-icon="mdi-magnify"
          >
            {{ totalFilteredCount }} {{ t('torrent.resources') }}
          </VChip>

          <!-- 排序选择 -->
          <VBtn variant="text" size="small" class="sort-btn mobile-sort-btn" :color="undefined">
            <template #prepend>
              <VIcon :icon="sortType === 'asc' ? 'mdi-sort-ascending' : 'mdi-sort-descending'" class="me-1" />
            </template>
            <span class="text-subtitle-2">{{ sortTitles[sortField] }}</span>
            <VIcon icon="mdi-chevron-down" size="16" class="ms-1" />

            <VMenu activator="parent" transition="slide-y-transition">
              <VList density="compact" min-width="120" class="sort-menu-list">
                <!-- 升序/降序 选项 -->
                <VListItem
                  value="asc"
                  :active="sortType === 'asc'"
                  color="primary"
                  @click="emit('update:sortType', 'asc')"
                  class="px-3"
                >
                  <template #prepend>
                    <VIcon icon="mdi-sort-ascending" size="small" class="me-2" />
                  </template>
                  <VListItemTitle>{{ t('common.ascending') }}</VListItemTitle>
                </VListItem>
                <VListItem
                  value="desc"
                  :active="sortType === 'desc'"
                  color="primary"
                  @click="emit('update:sortType', 'desc')"
                  class="px-3"
                >
                  <template #prepend>
                    <VIcon icon="mdi-sort-descending" size="small" class="me-2" />
                  </template>
                  <VListItemTitle>{{ t('common.descending') }}</VListItemTitle>
                </VListItem>

                <VDivider class="my-1" />

                <!-- 排序字段选项 -->
                <VListItem
                  v-for="(title, key) in sortTitles"
                  :key="key"
                  :value="key"
                  :active="sortField === key"
                  color="primary"
                  @click="emit('update:sortField', key as string)"
                  class="px-3"
                >
                  <VListItemTitle>{{ title }}</VListItemTitle>
                </VListItem>
              </VList>
            </VMenu>
          </VBtn>
        </div>

        <!-- 筛选图标按钮区域 -->
        <div class="filter-buttons-grid w-100 mt-2">
          <VBtn
            v-for="(title, key) in filterTitles"
            v-show="filterOptions[key].length > 0"
            :key="key"
            variant="tonal"
            color="primary"
            class="filter-btn-mobile"
            @click="toggleFilterMenu(key)"
          >
            <VIcon :icon="getFilterIcon(key)" class="filter-icon me-1"></VIcon>
            <span class="filter-label">
              {{ title }}
            </span>
            <VBadge
              v-if="filterForm[key].length > 0"
              :content="filterForm[key].length"
              color="primary"
              location="top end"
              offset-x="-10"
              offset-y="-10"
            ></VBadge>
          </VBtn>

          <!-- 全部筛选按钮 -->
          <VBtn variant="tonal" color="primary" class="filter-btn-mobile" @click="toggleAllFilterMenu">
            <VIcon icon="mdi-filter-variant" class="filter-icon me-1"></VIcon>
            <span class="filter-label">
              {{ t('torrent.allFilters') }}
            </span>
            <VBadge
              v-if="getFilterCount > 0"
              :content="getFilterCount"
              color="primary"
              location="top end"
              offset-x="-10"
              offset-y="-10"
            ></VBadge>
          </VBtn>
        </div>
      </div>
    </div>
  </VCard>

</template>

<style scoped>
.search-header,
.search-header-mobile {
  width: 100%;
  max-width: 100%;
}

.view-header {
  overflow: hidden;
}

.filter-toolbar-card {
  overflow: hidden;
  background: rgba(var(--v-theme-surface), 0.82);
}

.search-count {
  font-weight: 500;
}

.sort-btn {
  height: 32px !important;
  font-weight: 500;
  padding-inline: 12px 6px !important;
}

.sort-btn .v-icon {
  color: rgba(var(--v-theme-on-surface), 0.6);
}

.sort-btn :deep(.v-btn__prepend) {
  margin-inline-end: 2px !important;
}

.sort-menu-list :deep(.v-list-item__prepend > .v-icon) {
  margin-inline-end: 0px !important;
}

.filter-bar {
  display: flex;
  flex-wrap: nowrap;
  align-items: center;
  gap: 6px;
  overflow-x: auto;
  flex: 1;
  width: 0;
  min-width: 0;
  scrollbar-width: none;
  -ms-overflow-style: none;
}

.filter-bar::-webkit-scrollbar {
  display: none;
}

.filter-bar > * {
  flex-shrink: 0;
}

.filter-divider {
  background-color: rgba(var(--v-theme-on-surface), 0.12);
  block-size: 24px;
  inline-size: 1px;
  margin-block: 0;
  margin-inline: 8px;
}

.filter-btn {
  min-inline-size: 0;
  transition: opacity 0.2s;
}

.filter-btn:hover {
  opacity: 0.8;
}

.filter-menu-content {
  max-block-size: 50vh;
  overflow-y: auto;
}

.filter-options {
  display: flex;
  flex-wrap: wrap;
}

.filter-chip {
  border: 1px solid rgba(var(--v-theme-primary), 0.2);
  margin: 4px;
  background-color: rgba(var(--v-theme-primary), 0.1) !important;
  color: rgba(var(--v-theme-on-surface), 0.9) !important;
  font-weight: 500;
  transition: all 0.2s ease;
}

.filter-chip:hover {
  background-color: rgba(var(--v-theme-primary), 0.15) !important;
}

.filter-chip.v-chip--selected {
  background-color: rgba(var(--v-theme-primary), 0.85) !important;
  box-shadow: 0 2px 4px rgba(var(--v-theme-primary), 0.3);
  color: rgb(var(--v-theme-on-primary)) !important;
  font-weight: 600;
}

.filter-tag {
  font-weight: 500;
  transition: all 0.2s;
}

.filter-tag:hover {
  opacity: 0.8;
}

.selected-filters {
  overflow: hidden;
  border-block-start: 1px solid rgba(var(--v-theme-on-surface), 0.08);
  background-color: rgba(var(--v-theme-surface-variant), 0.05);
  padding-block: 7px;
  padding-inline: 12px;
}

.filter-buttons-grid {
  display: grid;
  gap: 4px;
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.filter-btn-mobile {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  border: 1px solid rgba(var(--v-theme-on-surface), 0.08);
  border-radius: 8px;
  block-size: 56px;
  min-block-size: 56px;
  min-inline-size: 0;
  padding-block: 4px;
  padding-inline: 4px;
}

.filter-btn-mobile :deep(.v-btn__content) {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  inline-size: 100%;
  max-inline-size: 100%;
  min-inline-size: 0;
  line-height: 1.15;
  white-space: normal;
}

.filter-icon {
  font-size: 18px;
  margin-block-end: 2px;
}

.filter-label {
  display: -webkit-box;
  overflow: hidden;
  font-size: 0.8rem;
  line-height: 1.15;
  max-inline-size: 100%;
  overflow-wrap: anywhere;
  text-align: center;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

@media (width <= 600px) {
  .filter-buttons-grid {
    gap: 6px;
  }
}
</style>
