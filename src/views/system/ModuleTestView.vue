<script setup lang="ts">
import api from '@/api'
import { useI18n } from 'vue-i18n'
import { useTheme } from 'vuetify'

// 国际化
const { t } = useI18n()

// 主题
const theme = useTheme()

interface ModuleListItem {
  id: string
  name: string
  name_i18n?: string
  name_key?: string
}

interface ModuleTestResponse {
  success: boolean
  message?: string
  message_i18n?: string
}

// 定义所有的模块ID、名称列表
const modules = ref<
  {
    id: string
    name: string
    state: 'success' | 'error' | 'warning' | 'info' | undefined
    errmsg: string
    loading: boolean
    visible: boolean
    delay: number
  }[]
>([])

// 总体进度
const overallProgress = ref(0)
const isChecking = ref(false)
const checkComplete = ref(false)

// 调用API查询模块列表
async function getModules() {
  try {
    isChecking.value = true
    overallProgress.value = 0

    const result: { [key: string]: any } = await api.get('system/modulelist')
    if (result.success) {
      const moduleList = result.data?.modules
      if (moduleList) {
        // 初始化模块列表
        modules.value = moduleList.map((module: ModuleListItem, index: number) => ({
          id: module.id,
          name: module.name_i18n || module.name,
          state: undefined,
          errmsg: '',
          loading: false,
          visible: false,
          delay: index * 200, // 每个模块延迟200ms出现
        }))

        // 开始检查
        await startModuleCheck()
      }
    }
  } catch (error) {
    console.error(error)
    isChecking.value = false
  }
}

// 开始模块检查
async function startModuleCheck() {
  const totalModules = modules.value.length

  for (let i = 0; i < modules.value.length; i++) {
    const module = modules.value[i]

    // 显示当前模块
    setTimeout(() => {
      module.visible = true
    }, module.delay)

    // 开始检查
    await moduleTest(i)

    // 更新总体进度
    overallProgress.value = ((i + 1) / totalModules) * 100
  }

  // 检查完成
  setTimeout(() => {
    isChecking.value = false
    checkComplete.value = true
  }, 500)
}

// 调用API测试模块
async function moduleTest(index: number) {
  try {
    const target = modules.value[index]
    const moduleid = target.id
    target.loading = true

    const result = (await api.get(`system/moduletest/${moduleid}`)) as ModuleTestResponse
    target.loading = false

    if (result.success) {
      target.state = 'success'
      target.name = `${target.name} - ${t('moduleTest.normal')}`
    } else if (!result.message) {
      target.state = undefined
      target.name = `${target.name} - ${t('moduleTest.disabled')}`
    } else {
      target.state = 'error'
      target.name = `${target.name} - ${t('moduleTest.error')}！`
      target.errmsg = result.message_i18n || result.message || ''
    }
  } catch (error) {
    console.error(error)
    const target = modules.value[index]
    target.loading = false
    target.state = 'error'
    target.errmsg = t('moduleTest.requestFailed')
  }
}

// 重新检查
function recheck() {
  modules.value = []
  overallProgress.value = 0
  isChecking.value = false
  checkComplete.value = false
  getModules()
}

// 加载
onMounted(getModules)
</script>

<template>
  <div class="system-health-check">
    <!-- 动态进度框 - 固定在顶部 -->
    <div class="progress-container">
      <div class="progress-card app-surface" :class="{ 'dark-theme': theme.global.current.value.dark }">
        <div class="progress-header">
          <VIcon
            :icon="isChecking ? 'mdi-cog-sync' : checkComplete ? 'mdi-check-circle' : 'mdi-cog'"
            :class="isChecking ? 'rotating' : ''"
            size="28"
            color="white"
          />
          <h3 class="progress-title text-white">
            {{
              isChecking
                ? t('moduleTest.checking')
                : checkComplete
                  ? t('moduleTest.complete')
                  : t('moduleTest.preparing')
            }}
          </h3>
        </div>

        <div class="progress-bar-container">
          <VProgressLinear
            v-model="overallProgress"
            :color="checkComplete ? 'success' : 'white'"
            height="6"
            rounded
            class="progress-bar"
          />
          <div class="progress-text">{{ Math.round(overallProgress) }}%</div>
        </div>

        <div class="progress-stats">
          <div class="stat-item">
            <span class="stat-number">{{ modules.length }}</span>
            <span class="stat-label">{{ t('moduleTest.totalModules') }}</span>
          </div>
          <div class="stat-item">
            <span class="stat-number success">{{ modules.filter(m => m.state === 'success').length }}</span>
            <span class="stat-label">{{ t('moduleTest.normal') }}</span>
          </div>
          <div class="stat-item">
            <span class="stat-number error">{{ modules.filter(m => m.state === 'error').length }}</span>
            <span class="stat-label">{{ t('moduleTest.error') }}</span>
          </div>
        </div>
      </div>
    </div>

    <!-- 检查结果列表 - 可滚动区域 -->
    <div class="results-container">
      <div class="module-list">
        <Transition v-for="(module, index) in modules" :key="module.id" name="module-item" appear>
          <div
            v-show="module.visible"
            class="module-item app-surface"
            :class="[module.state, { 'dark-theme': theme.global.current.value.dark }]"
          >
            <div class="module-header">
              <div class="module-icon">
                <VIcon v-if="module.loading" icon="mdi-loading" class="rotating" color="primary" size="20" />
                <VIcon v-else-if="module.state === 'success'" icon="mdi-check-circle" color="success" size="20" />
                <VIcon v-else-if="module.state === 'error'" icon="mdi-alert-circle" color="error" size="20" />
                <VIcon v-else icon="mdi-minus-circle" color="grey" size="20" />
              </div>
              <div class="module-info">
                <div class="module-name">{{ module.name }}</div>
                <div v-if="module.errmsg" class="module-error">{{ module.errmsg }}</div>
              </div>
              <div class="module-status">
                <VChip v-if="module.loading" color="primary" size="x-small" variant="tonal">
                  {{ t('moduleTest.checking') }}
                </VChip>
                <VChip v-else-if="module.state === 'success'" color="success" size="x-small" variant="tonal">
                  {{ t('moduleTest.normal') }}
                </VChip>
                <VChip v-else-if="module.state === 'error'" color="error" size="x-small" variant="tonal">
                  {{ t('moduleTest.error') }}
                </VChip>
                <VChip v-else-if="module.state === undefined" color="grey" size="x-small" variant="tonal">
                  {{ t('moduleTest.disabled') }}
                </VChip>
              </div>
            </div>
          </div>
        </Transition>
      </div>
    </div>

    <!-- 重新检查按钮 -->
    <div v-if="checkComplete" class="recheck-container">
      <VBtn color="primary" variant="outlined" prepend-icon="mdi-refresh" size="small" @click="recheck">
        {{ t('moduleTest.recheck') }}
      </VBtn>
    </div>
  </div>
</template>

<style scoped>
.system-health-check {
  display: flex;
  overflow: hidden;
  flex: 1 1 auto;
  flex-direction: column;
  block-size: 100%;
  min-block-size: 0;
}

.progress-container {
  flex-shrink: 0;
}

.progress-card {
  padding: 20px;
  margin: 16px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
}

.progress-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-block-end: 16px;
}

.progress-title {
  margin: 0;
  font-size: 1.1rem;
  font-weight: 600;
}

.progress-bar-container {
  position: relative;
  margin-block-end: 16px;
}

.progress-bar {
  background: rgba(255, 255, 255, 20%) !important;
}

.progress-text {
  position: absolute;
  border-radius: 8px;
  background: rgba(255, 255, 255, 90%);
  color: #333;
  font-size: 0.75rem;
  font-weight: 600;
  inset-block-start: -6px;
  inset-inline-end: 0;
  padding-block: 2px;
  padding-inline: 6px;
}

.progress-stats {
  display: flex;
  justify-content: space-around;
  gap: 12px;
}

.stat-item {
  flex: 1;
  text-align: center;
}

.stat-number {
  display: block;
  font-size: 1.25rem;
  font-weight: 700;
  margin-block-end: 2px;
}

.stat-number.success {
  color: #4caf50;
}

.stat-number.error {
  color: #f44336;
}

.stat-label {
  font-size: 0.7rem;
  opacity: 0.8;
}

.results-container {
  flex: 1;
  min-block-size: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
  padding-block: 0 16px;
  padding-inline: 16px;
}

.module-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.module-item {
  padding: 12px;
  background: var(--v-surface);
  transition: all 0.3s ease;
}

.module-item.success {
  border-color: #4caf50;
  background: linear-gradient(135deg, #f8fff9 0%, #e8f5e8 100%);
}

.module-item.success.dark-theme {
  border-color: #4caf50;
  background: linear-gradient(135deg, rgba(31, 47, 31, 30%) 0%, rgba(24, 32, 24, 60%) 100%);
}

.module-item.error {
  border-color: #f44336;
  background: linear-gradient(135deg, #fff8f8 0%, #ffe8e8 100%);
}

.module-item.error.dark-theme {
  border-color: #f44336;
  background: linear-gradient(135deg, rgba(47, 31, 31, 30%) 0%, rgba(34, 24, 24, 60%) 100%);
}

.module-header {
  display: flex;
  align-items: center;
  gap: 10px;
}

.module-icon {
  flex-shrink: 0;
}

.module-info {
  flex: 1;
  min-inline-size: 0;
}

.module-name {
  color: var(--v-on-surface);
  font-size: 0.875rem;
  font-weight: 500;
  margin-block-end: 2px;
}

.module-error {
  color: #f44336;
  font-size: 0.75rem;
  margin-block-start: 2px;
}

.module-status {
  flex-shrink: 0;
}

.recheck-container {
  display: flex;
  flex-shrink: 0;
  justify-content: center;
  padding: 16px;
  background: var(--v-surface-variant);
  border-block-start: 1px solid var(--v-border-color);
}

/* 动画效果 */
.rotating {
  animation: rotate 2s linear infinite;
}

@keyframes rotate {
  from {
    transform: rotate(0deg);
  }

  to {
    transform: rotate(360deg);
  }
}

/* 模块项单独动画 - 从下方滑出 */
.module-item-enter-active {
  transition: all 0.5s ease;
}

.module-item-enter-from {
  opacity: 0;
  transform: translateY(30px);
}

.module-item-enter-to {
  opacity: 1;
  transform: translateY(0);
}
</style>
