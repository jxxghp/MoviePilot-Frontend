<script setup lang="ts">
import { DiscoverTabs } from '@/router/menu'
import draggable from 'vuedraggable'
import TheMovieDbView from '@/views/discover/TheMovieDbView.vue'
import DoubanView from '@/views/discover/DoubanView.vue'
import BangumiView from '@/views/discover/BangumiView.vue'
import ExtraSourceView from '@/views/discover/ExtraSourceView.vue'
import { DiscoverSource } from '@/api/types'
import api from '@/api'
import { or } from '@vueuse/math'

const activeTab = ref('')

// 本地存储键值
const localOrderKey = 'MP_DISCOVER_TAB_ORDER'

// 顺序配置
const orderConfig = ref<{ name: string }[]>([])

// 标签页
const discoverTabs = ref<DiscoverSource[]>([])

// 标签页项
const discoverTabItems = computed(() => {
  return discoverTabs.value.map(item => ({
    title: item.name,
    icon: getTabIcon(item.name),
  }))
})

// 获取标签页图标
function getTabIcon(name: string): string {
  // 为常见的标签提供图标
  const iconMap: Record<string, string> = {
    'TheMovieDb': 'mdi-movie-search',
    '豆瓣': 'mdi-seed',
    'Bangumi': 'mdi-animation',
  }
  return iconMap[name] || 'mdi-magnify' // 默认图标
}

// 额外的数据源
const extraDiscoverSources = ref<DiscoverSource[]>([])

// 排序对话框
const orderConfigDialog = ref(false)

// 初始化发现标签
function initDiscoverTabs() {
  for (const tab of DiscoverTabs) {
    discoverTabs.value.push({
      name: tab.name,
      mediaid_prefix: tab.tab,
      api_path: '',
      filter_params: {},
      filter_ui: [],
    })
  }
}

// 加载额外的发现数据源
async function loadExtraDiscoverSources() {
  try {
    extraDiscoverSources.value = await api.get('discover/source')
    if (extraDiscoverSources.value.length === 0) {
      return
    }
    for (const source of extraDiscoverSources.value) {
      if (discoverTabs.value.find(tab => tab.mediaid_prefix === source.mediaid_prefix)) {
        continue
      }
      discoverTabs.value.push(source)
    }
  } catch (error) {
    console.log(error)
  }
}

// 按order的顺序排序
function sortSubscribeOrder() {
  if (!orderConfig.value) {
    return
  }
  if (discoverTabs.value.length === 0) {
    return
  }
  discoverTabs.value.sort((a, b) => {
    const aIndex = orderConfig.value.findIndex((item: { name: string }) => item.name === a.name)
    const bIndex = orderConfig.value.findIndex((item: { name: string }) => item.name === b.name)
    return (aIndex === -1 ? 999 : aIndex) - (bIndex === -1 ? 999 : bIndex)
  })
}

// 加载顺序
async function loadOrderConfig() {
  // 顺序配置
  const local_order = localStorage.getItem(localOrderKey)
  if (local_order) {
    orderConfig.value = JSON.parse(local_order)
  } else {
    const response = await api.get(`/user/config/${localOrderKey}`)
    if (response && response.data && response.data.value) {
      orderConfig.value = response.data.value
      localStorage.setItem(localOrderKey, JSON.stringify(orderConfig.value))
    }
  }
}

// 保存顺序设置
async function saveTabOrder() {
  orderConfigDialog.value = false
  // 顺序配置
  const orderObj = discoverTabs.value.map(item => ({ name: item.name }))
  orderConfig.value = orderObj
  const orderString = JSON.stringify(orderObj)
  localStorage.setItem(localOrderKey, orderString)

  // 保存到服务端
  try {
    await api.post(`/user/config/${localOrderKey}`, orderObj)
  } catch (error) {
    console.error(error)
  }
}

onBeforeMount(async () => {
  initDiscoverTabs()
  await loadOrderConfig()
  await loadExtraDiscoverSources()
  sortSubscribeOrder()
  // 选中第一个标签页
  if (discoverTabs.value.length > 0) {
    activeTab.value = discoverTabs.value[0].name
  }
})

onActivated(async () => {
  await loadExtraDiscoverSources()
  sortSubscribeOrder()
})
</script>

<template>
  <div class="mp-discover">
    <VHeaderTab :items="discoverTabItems" v-model="activeTab">
      <template #append>
        <VBtn
          icon="mdi-order-alphabetical-ascending"
          variant="text"
          color="primary"
          size="default"
          class="settings-icon-button"
          @click="orderConfigDialog = true"
        />
      </template>
    </VHeaderTab>

    <VWindow v-model="activeTab" class="mt-5 disable-tab-transition" :touch="false">
      <VWindowItem value="TheMovieDb">
        <transition name="fade-slide" appear>
          <div>
            <TheMovieDbView />
          </div>
        </transition>
      </VWindowItem>
      <VWindowItem value="豆瓣">
        <transition name="fade-slide" appear>
          <div>
            <DoubanView />
          </div>
        </transition>
      </VWindowItem>
      <VWindowItem value="Bangumi">
        <transition name="fade-slide" appear>
          <div>
            <BangumiView />
          </div>
        </transition>
      </VWindowItem>
      <VWindowItem v-for="item in extraDiscoverSources" :key="item.mediaid_prefix" :value="item.name">
        <transition name="fade-slide" appear>
          <div>
            <ExtraSourceView :source="item" />
          </div>
        </transition>
      </VWindowItem>
    </VWindow>
    
    <!-- 弹窗，根据配置生成选项 -->
    <VDialog v-if="orderConfigDialog" v-model="orderConfigDialog" width="35rem" scrollable>
      <VCard class="settings-card">
        <VCardItem class="settings-card-header">
          <VCardTitle>
            <VIcon icon="mdi-order-alphabetical-ascending" size="small" class="me-2" />
            设置标签顺序
          </VCardTitle>
          <DialogCloseBtn @click="orderConfigDialog = false" />
        </VCardItem>
        <VDivider />
        <VCardText>
          <p class="settings-hint">拖动对标签页进行排序</p>
          <draggable
            v-model="discoverTabs"
            handle=".cursor-move"
            item-key="mediaid_prefix"
            tag="div"
            :component-data="{ 'class': 'settings-grid' }"
          >
            <template #item="{ element }">
              <div class="setting-item enabled">
                <div class="setting-item-inner cursor-move">
                  <div class="setting-check">
                    <VIcon :icon="getTabIcon(element.name)" size="small" color="primary" />
                  </div>
                  <span class="setting-label">{{ element.name }}</span>
                </div>
              </div>
            </template>
          </draggable>
        </VCardText>
        <VDivider />
        <VCardActions class="pt-5">
          <VSpacer />
          <VBtn @click="saveTabOrder" variant="elevated" color="primary" class="px-5">
            <template #prepend>
              <VIcon icon="mdi-content-save" />
            </template>
            保存
          </VBtn>
        </VCardActions>
      </VCard>
    </VDialog>
    
    <!-- 快速滚动到顶部按钮 -->
    <VScrollToTopBtn />
  </div>
</template>

<style lang="scss" scoped>
.mp-discover {
  position: relative;
  padding: 0;
  max-inline-size: 100%;
}

.settings-card-header {
  padding-block: 16px;
  padding-inline: 20px;
}

.settings-hint {
  color: rgba(var(--v-theme-on-surface), 0.7);
  font-size: 0.9rem;
  margin-block-end: 16px;
}

.settings-grid {
  display: grid;
  gap: 12px;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
}

.setting-label {
  color: rgba(var(--v-theme-on-surface), 0.8);
  font-size: 0.9rem;
  transition: color 0.2s ease;
}

.setting-item {
  position: relative;
  overflow: hidden;
  border: 1px solid rgba(var(--v-theme-on-surface), 0.1);
  border-radius: 8px;
  background-color: rgba(var(--v-theme-surface-variant), 0.3);
  cursor: pointer;
  padding-block: 10px;
  padding-inline: 12px;
  transition: all 0.2s ease;

  &::before {
    position: absolute;
    background-color: transparent;
    block-size: 100%;
    content: '';
    inline-size: 4px;
    inset-block-start: 0;
    inset-inline-start: 0;
    transition: background-color 0.3s ease;
  }

  &:hover {
    border-color: rgba(var(--v-theme-on-surface), 0.15);
    background-color: rgba(var(--v-theme-surface-variant), 0.6);
  }

  &.enabled {
    border-color: rgba(var(--v-theme-primary), 0.5);
    background-color: rgba(var(--v-theme-primary), 0.05);

    .setting-label {
      color: rgb(var(--v-theme-primary));
      font-weight: 500;
    }
  }
}

.setting-item-inner {
  display: flex;
  align-items: center;
}

.setting-check {
  margin-inline-end: 8px;
}

/* Fade transition for content */
.fade-slide-enter-active,
.fade-slide-leave-active {
  transition: opacity 0.3s ease, transform 0.3s ease;
}

.fade-slide-enter-from,
.fade-slide-leave-to {
  opacity: 0;
  transform: translateY(10px);
}
</style>
