<script lang="ts" setup>
import { ref, computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useSetupWizard } from '@/composables/useSetupWizard'
import api from '@/api'

const { t } = useI18n()
const { updatePreferences } = useSetupWizard()

// 个性化选项
const personalizationOptions = ref({
  excludeDolbyVision: true, // 排除杜比视界
  excludeBluray: true, // 排除蓝光原盘
})

// 预设配置 - 使用多语言
const presetConfigs = computed(() => ({
  '4k-enthusiast': {
    name: t('setupWizard.preferences.presets.4k-enthusiast.name'),
    description: t('setupWizard.preferences.presets.4k-enthusiast.description'),
    icon: 'mdi-4k',
    color: 'primary',
    ruleString:
      ' SPECSUB & 4K & 60FPS & UHD & !BLU & !DOLBY > CNSUB & 4K & 60FPS & UHD & !BLU & !DOLBY > 4K & 60FPS & UHD & !BLU & !DOLBY > SPECSUB & 4K & UHD & !BLU & !DOLBY > CNSUB & 4K & UHD & !BLU & !DOLBY > 4K & UHD & !BLU & !DOLBY > SPECSUB & 4K & !BLU & !DOLBY > CNSUB & 4K & !BLU & !DOLBY > 4K & !BLU & !DOLBY ',
  },
  'balanced': {
    name: t('setupWizard.preferences.presets.balanced.name'),
    description: t('setupWizard.preferences.presets.balanced.description'),
    icon: 'mdi-scale-unbalanced',
    color: 'success',
    ruleString:
      ' SPECSUB & 4K & !BLU & !DOLBY & !UHD & !60FPS > CNSUB & 4K & !BLU & !DOLBY & !REMUX & !60FPS > SPECSUB & 1080P & !BLU & !DOLBY & !60FPS & !UHD > CNSUB & 1080P & !BLU & !DOLBY & !UHD & !60FPS > 4K & BLU & !DOLBY & !UHD & !60FPS > 1080P & !BLU & !DOLBY & !UHD & !60FPS ',
  },
  'space-saver': {
    name: t('setupWizard.preferences.presets.space-saver.name'),
    description: t('setupWizard.preferences.presets.space-saver.description'),
    icon: 'mdi-harddisk',
    color: 'warning',
    ruleString:
      ' SPECSUB & 1080P & !BLU & !UHD & !60FPS & !DOLBY > CNSUB & 1080P & !BLU & !UHD & !60FPS & !DOLBY > 1080P & !BLU & !UHD & !60FPS & !DOLBY > !BLU & !UHD & !60FPS & !DOLBY ',
  },
  'free-priority': {
    name: t('setupWizard.preferences.presets.free-priority.name'),
    description: t('setupWizard.preferences.presets.free-priority.description'),
    icon: 'mdi-gift',
    color: 'info',
    ruleString:
      ' SPECSUB & FREE & !BLU & !DOLBY > CNSUB & FREE & !BLU & !DOLBY > FREE & !BLU & !DOLBY > !BLU & !DOLBY ',
  },
}))

// 当前选中的预设
const selectedPreset = ref('')

// 加载用户当前的规则组设置
async function loadUserFilterRuleGroups() {
  try {
    const result: { [key: string]: any } = await api.get('system/setting/UserFilterRuleGroups')
    if (result.success && result.data?.value && result.data.value.length > 0) {
      const userRuleGroups = result.data.value

      // 查找匹配的预设
      for (const [presetKey, preset] of Object.entries(presetConfigs.value)) {
        const matchingRule = userRuleGroups.find((rule: any) => rule.name === preset.name)
        if (matchingRule) {
          selectedPreset.value = presetKey

          // 分析规则字符串，判断个性化选项
          const ruleString = matchingRule.rule_string || ''
          personalizationOptions.value.excludeDolbyVision = ruleString.includes('!DOLBY')
          personalizationOptions.value.excludeBluray = ruleString.includes('!BLU')

          // 更新向导数据
          updateWizardData()
          break
        }
      }
    }
  } catch (error) {
    console.log('Load user filter rule groups failed:', error)
  }
}

// 选择预设
function selectPreset(presetKey: string) {
  if (selectedPreset.value === presetKey) {
    // 如果再次点击同一个预设，则取消选择
    selectedPreset.value = ''
    return
  }

  selectedPreset.value = presetKey
  updateWizardData()
}

// 生成规则序列的逻辑
const generateRuleSequences = computed(() => {
  if (!selectedPreset.value) {
    return []
  }

  const preset = presetConfigs.value[selectedPreset.value as keyof typeof presetConfigs.value]
  if (!preset) {
    return []
  }

  let ruleString = preset.ruleString

  // 根据个性化选项调整规则
  if (!personalizationOptions.value.excludeDolbyVision) {
    // 移除所有 !DOLBY 条件
    ruleString = ruleString.replace(/ & !DOLBY/g, '').replace(/!DOLBY & /g, '')
  }

  if (!personalizationOptions.value.excludeBluray) {
    // 移除所有 !BLU 条件
    ruleString = ruleString.replace(/ & !BLU/g, '').replace(/!BLU & /g, '')
  }

  return [
    {
      name: preset.name,
      rule_string: ruleString,
      media_type: '',
      category: '',
    },
  ]
})

// 监听偏好变化，更新到wizardData
function updateWizardData() {
  if (updatePreferences) {
    updatePreferences(personalizationOptions.value, generateRuleSequences.value)
  }
}

// 组件挂载时加载用户设置
onMounted(() => {
  loadUserFilterRuleGroups()
})
</script>

<template>
  <VCard variant="outlined">
    <VCardText>
      <div class="text-center mb-6">
        <h3 class="text-h4 mb-2">{{ t('setupWizard.preferences.title') }}</h3>
        <p class="text-body-1 text-medium-emphasis">{{ t('setupWizard.preferences.description') }}</p>
      </div>

      <!-- 快速预设 -->
      <VCard class="mb-6">
        <VCardTitle class="text-h6 d-flex align-center">
          <VIcon icon="mdi-flash" class="me-2" />
          {{ t('setupWizard.preferences.quickPresets') }}
        </VCardTitle>
        <VCardText>
          <p class="text-body-2 text-medium-emphasis mb-4">{{ t('setupWizard.preferences.quickPresetsDesc') }}</p>
          <VRow>
            <!-- Hover 命中区域保持静止，避免预设卡片上浮后底边反复触发 mouseleave。 -->
            <VCol v-for="(preset, key) in presetConfigs" :key="key" class="preset-card-hover-area" cols="12" sm="6" md="3">
              <VCard
                :color="selectedPreset === key ? preset.color : 'default'"
                :variant="selectedPreset === key ? 'tonal' : 'outlined'"
                class="app-hover-lift-card cursor-pointer preset-card"
                @click="selectPreset(key)"
              >
                <VCardText class="text-center pa-4">
                  <VIcon :icon="preset.icon" size="40" class="mb-3" />
                  <div class="text-h6 mb-2">{{ preset.name }}</div>
                  <div class="text-body-2 text-medium-emphasis">{{ preset.description }}</div>
                </VCardText>
              </VCard>
            </VCol>
          </VRow>
        </VCardText>
      </VCard>

      <!-- 个性化选项 -->
      <VCard class="mb-6">
        <VCardTitle class="text-h6 d-flex align-center">
          <VIcon icon="mdi-cog" class="me-2" />
          {{ t('setupWizard.preferences.personalizationOptions') }}
        </VCardTitle>
        <VCardText>
          <p class="text-body-2 text-medium-emphasis mb-4">
            {{ t('setupWizard.preferences.personalizationOptionsDesc') }}
          </p>
          <VRow>
            <VCol cols="12" md="6">
              <VSwitch
                v-model="personalizationOptions.excludeDolbyVision"
                :label="t('setupWizard.preferences.excludeDolbyVision')"
                color="primary"
                hide-details
                @change="updateWizardData"
              />
              <p class="text-caption text-medium-emphasis mt-1">
                {{ t('setupWizard.preferences.excludeDolbyVisionHint') }}
              </p>
            </VCol>
            <VCol cols="12" md="6">
              <VSwitch
                v-model="personalizationOptions.excludeBluray"
                :label="t('setupWizard.preferences.excludeBluray')"
                color="primary"
                hide-details
                @change="updateWizardData"
              />
              <p class="text-caption text-medium-emphasis mt-1">{{ t('setupWizard.preferences.excludeBlurayHint') }}</p>
            </VCol>
          </VRow>
        </VCardText>
      </VCard>
    </VCardText>
  </VCard>
</template>

<style scoped>
.cursor-pointer {
  cursor: pointer;
}

.preset-card-hover-area:hover .preset-card {
  transform: translate3d(0, -0.25rem, 0);
}

.preset-card:active {
  transform: translateY(-2px);
}

/* 预设卡片选中状态的样式 */
.v-card--variant-tonal.v-theme--light {
  border: 2px solid rgb(var(--v-theme-primary));
  background-color: rgb(var(--v-theme-primary), 0.12);
}

.v-card--variant-tonal.v-theme--dark {
  border: 2px solid rgb(var(--v-theme-primary));
  background-color: rgb(var(--v-theme-primary), 0.2);
}

/* 规则代码样式 */
.v-code {
  padding: 12px;
  border-radius: 8px;
  background-color: rgba(var(--v-theme-surface-variant), 0.3);
  font-family: 'JetBrains Mono', 'Fira Code', Consolas, monospace;
  font-size: 0.875rem;
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-all;
}

/* 展开面板样式 */
.v-expansion-panel-title {
  font-weight: 500;
}

.v-expansion-panel-text {
  padding-block-start: 16px;
}

/* 开关组件样式优化 */
.v-switch {
  margin-block-end: 8px;
}

/* 芯片组样式 */
.v-chip-group {
  gap: 8px;
}

.v-chip {
  margin-block: 4px;
  margin-inline: 0;
}
</style>
