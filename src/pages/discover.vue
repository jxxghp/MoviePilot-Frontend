<script setup lang="ts">
import { getDiscoverTabs } from '@/router/i18n-menu'
import draggable from 'vuedraggable'
import TheMovieDbView from '@/views/discover/TheMovieDbView.vue'
import DoubanView from '@/views/discover/DoubanView.vue'
import BangumiView from '@/views/discover/BangumiView.vue'
import ExtraSourceView from '@/views/discover/ExtraSourceView.vue'
import { DiscoverSource } from '@/api/types'
import api from '@/api'
import { useI18n } from 'vue-i18n'
import { useDisplay } from 'vuetify'
import { useDynamicHeaderTab } from '@/composables/useDynamicHeaderTab'

const display = useDisplay()

// 国际化
const { t } = useI18n()

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
    tab: item.mediaid_prefix,
  }))
})

// 额外的数据源
const extraDiscoverSources = ref<DiscoverSource[]>([])

// 排序对话框
const orderConfigDialog = ref(false)

// 初始化发现标签
function initDiscoverTabs() {
  const tabs = getDiscoverTabs()
  for (const tab of tabs) {
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

// 使用动态标签页
const { registerHeaderTab } = useDynamicHeaderTab()

// 注册动态标签页（在setup阶段，但使用computed保证响应性）
registerHeaderTab({
  items: discoverTabItems, // 传递computed值，会自动响应变化
  modelValue: activeTab,
  appendButtons: [
    {
      icon: 'mdi-order-alphabetical-ascending',
      variant: 'text',
      color: 'grey',
      class: 'settings-icon-button',
      action: () => {
        orderConfigDialog.value = true
      },
    },
  ],
})

onBeforeMount(async () => {
  initDiscoverTabs()
  await loadOrderConfig()
  await loadExtraDiscoverSources()
  sortSubscribeOrder()
  // 选中第一个标签页
  if (discoverTabs.value.length > 0) {
    activeTab.value = discoverTabs.value[0].mediaid_prefix
  }
})





onActivated(async () => {
  await loadExtraDiscoverSources()
  sortSubscribeOrder()
  // 如果当前没有选中任何标签页，或者当前选中的标签页不存在，则选中第一个标签页
  if (!activeTab.value || !discoverTabs.value.find(tab => tab.mediaid_prefix === activeTab.value)) {
    if (discoverTabs.value.length > 0) {
      activeTab.value = discoverTabs.value[0].mediaid_prefix
    }
  }
})
</script>

<template>
  <div>
    <VWindow v-model="activeTab" class="disable-tab-transition" :touch="false">
      <VWindowItem value="themoviedb">
        <transition name="fade-slide" appear>
          <div>
            <TheMovieDbView />
          </div>
        </transition>
      </VWindowItem>
      <VWindowItem value="douban">
        <transition name="fade-slide" appear>
          <div>
            <DoubanView />
          </div>
        </transition>
      </VWindowItem>
      <VWindowItem value="bangumi">
        <transition name="fade-slide" appear>
          <div>
            <BangumiView />
          </div>
        </transition>
      </VWindowItem>
      <VWindowItem v-for="item in extraDiscoverSources" :key="item.mediaid_prefix" :value="item.mediaid_prefix">
        <transition name="fade-slide" appear>
          <div>
            <ExtraSourceView :source="item" />
          </div>
        </transition>
      </VWindowItem>
    </VWindow>
    <!-- 弹窗，根据配置生成选项 -->
    <VDialog
      v-if="orderConfigDialog"
      v-model="orderConfigDialog"
      max-width="35rem"
      scrollable
      :fullscreen="!display.mdAndUp.value"
    >
      <VCard>
        <VCardItem>
          <VCardTitle>
            <VIcon icon="mdi-order-alphabetical-ascending" size="small" class="me-2" />
            {{ t('discover.setTabOrder') }}
          </VCardTitle>
          <VDialogCloseBtn @click="orderConfigDialog = false" />
        </VCardItem>
        <VDivider />
        <VCardText>
          <p class="settings-hint">{{ t('discover.dragToReorder') }}</p>
          <draggable
            v-model="discoverTabs"
            handle=".cursor-move"
            item-key="mediaid_prefix"
            tag="div"
            :component-data="{ 'class': 'settings-grid' }"
          >
            <template #item="{ element }">
              <VCard variant="text" class="setting-item enabled">
                <div class="setting-item-inner cursor-move text-center">
                  <span class="setting-label">{{ element.name }}</span>
                </div>
              </VCard>
            </template>
          </draggable>
        </VCardText>
        <VCardActions class="pt-3">
          <VSpacer />
          <VBtn @click="saveTabOrder">
            <template #prepend>
              <VIcon icon="mdi-content-save" />
            </template>
            {{ t('common.save') }}
          </VBtn>
        </VCardActions>
      </VCard>
    </VDialog>
    <!-- 快速滚动到顶部按钮 -->
    <VScrollToTopBtn />
  </div>
</template>
<style lang="scss" scoped>
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
    background-color: rgb(var(--v-theme-primary));
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
</style>
