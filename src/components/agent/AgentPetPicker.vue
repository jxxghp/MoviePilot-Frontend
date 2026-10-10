<script setup lang="ts">
import { useToast } from 'vue-toastification'
import { useI18n } from 'vue-i18n'
import api, { getApiErrorMessage } from '@/api'
import { useGlobalSettingsStore } from '@/stores'
import {
  AGENT_PET_BUILTIN,
  AGENT_PET_SYSTEM_SETTING_KEY,
  AGENT_PET_USER_CONFIG_KEY,
  fetchAgentPetDeclarations,
  getAgentPetId,
  normalizeAgentPetSelection,
  useAgentPetStore,
} from '@/stores/agentPet'
import type { AgentPetDeclaration, AgentPetSelection } from '@/types/agentHost'
import AgentPetRobotPreview from '@/components/agent/pet/AgentPetRobotPreview.vue'

/** 选项卡片：跟随默认、内置机器人或某个插件形象。 */
interface AgentPetOption {
  /** 选项标识：`default`、`builtin` 或 `<plugin_id>:<key>`。 */
  id: string
  title: string
  description: string
  /** 写入 user config 的值。 */
  selection: AgentPetSelection
  /** 补充说明，用来区分“跟随默认会变化”和“内置机器人固定不变”。 */
  hint?: string
  icon?: string
  previewUrl?: string | null
  /** 预览区渲染真实的内置 CSS 机器人。 */
  builtinPreview?: boolean
  modeLabel?: string
}

const FOLLOW_DEFAULT_ID = 'default'

const emit = defineEmits<{
  /** 返回对话视图。 */
  back: []
}>()

const { t } = useI18n()
const $toast = useToast()
const globalSettingsStore = useGlobalSettingsStore()
const petStore = useAgentPetStore()

const declarations = ref<AgentPetDeclaration[]>([])
const selection = ref<AgentPetSelection>(null)
const loading = ref(true)
const savingId = ref('')
const failedPreviewIds = ref(new Set<string>())

/** 当前选中的选项标识。 */
const selectedId = computed(() => {
  if (selection.value === AGENT_PET_BUILTIN) return AGENT_PET_BUILTIN
  if (selection.value) return getAgentPetId(selection.value)
  return FOLLOW_DEFAULT_ID
})

/** 管理员默认实际对应的形象；未设置或当前不可用时为 null，即内置机器人。 */
const defaultPet = computed(() => {
  const value = globalSettingsStore.get(AGENT_PET_SYSTEM_SETTING_KEY)
  if (typeof value !== 'string' || !value) return null
  return declarations.value.find(pet => getAgentPetId(pet) === value) || null
})

/** 管理员默认形象的展示名。 */
const defaultPetName = computed(() => defaultPet.value?.name || t('agentAssistant.pet.builtin'))

/** 卡片预览图优先用整身预览图，没有时退到头像。 */
function getPetPreviewUrl(pet: AgentPetDeclaration | null) {
  return pet?.preview_url || pet?.avatar_url || null
}

const options = computed<AgentPetOption[]>(() => {
  const items: AgentPetOption[] = [
    {
      id: FOLLOW_DEFAULT_ID,
      title: t('agentAssistant.pet.followDefault'),
      description: t('agentAssistant.pet.followDefaultDesc', { name: defaultPetName.value }),
      hint: t('agentAssistant.pet.followDefaultHint'),
      selection: null,
      icon: 'mdi-puzzle-outline',
      previewUrl: getPetPreviewUrl(defaultPet.value),
      builtinPreview: !defaultPet.value,
    },
    {
      id: AGENT_PET_BUILTIN,
      title: t('agentAssistant.pet.builtin'),
      description: t('agentAssistant.pet.builtinDesc'),
      hint: t('agentAssistant.pet.builtinHint'),
      selection: AGENT_PET_BUILTIN,
      builtinPreview: true,
    },
  ]
  declarations.value.forEach(pet => {
    items.push({
      id: getAgentPetId(pet),
      title: pet.name,
      description: pet.plugin_name,
      selection: { plugin_id: pet.plugin_id, key: pet.key },
      previewUrl: getPetPreviewUrl(pet),
      icon: 'mdi-puzzle-outline',
      modeLabel: t(pet.mode === 'stage' ? 'agentAssistant.pet.modeStage' : 'agentAssistant.pet.modeRenderer'),
    })
  })
  // 已保存的形象当前不可用（插件停用或卸载）时仍展示出来，让用户知道为何回退到内置机器人。
  if (selection.value && selection.value !== AGENT_PET_BUILTIN && !items.some(item => item.id === selectedId.value)) {
    items.push({
      id: selectedId.value,
      title: selectedId.value,
      description: t('agentAssistant.pet.unavailable'),
      selection: selection.value,
      icon: 'mdi-alert-outline',
    })
  }
  return items
})

async function loadData() {
  loading.value = true
  try {
    const [items, response] = await Promise.all([
      fetchAgentPetDeclarations(),
      api.get<{ value?: unknown }>(`user/config/${AGENT_PET_USER_CONFIG_KEY}`, { feedback: 'silent' }),
    ])
    declarations.value = items
    selection.value = normalizeAgentPetSelection(response?.value)
  } catch (error) {
    console.error(error)
    $toast.error(t('agentAssistant.pet.loadFailed'))
  } finally {
    loading.value = false
  }
}

/** 选择后立即保存，并通过 store 即时切换正在显示的形象。 */
async function selectOption(option: AgentPetOption) {
  if (savingId.value || option.id === selectedId.value) return
  savingId.value = option.id
  try {
    await petStore.setUserSelection(option.selection)
    // 选中态即反馈，面板内不再额外弹成功提示。
    selection.value = option.selection
  } catch (error) {
    $toast.error(
      t('agentAssistant.pet.saveFailed', { message: getApiErrorMessage(error) || t('common.apiRequestFailed') }),
    )
  } finally {
    savingId.value = ''
  }
}

/** 预览图失败按“选项 + 地址”记录，默认形象切换后新地址仍会重新尝试。 */
function getPreviewKey(option: AgentPetOption) {
  return `${option.id}\u0000${option.previewUrl || ''}`
}

function handlePreviewError(option: AgentPetOption) {
  failedPreviewIds.value = new Set([...failedPreviewIds.value, getPreviewKey(option)])
}

onMounted(loadData)
</script>

<template>
  <!-- Agent 面板内的形象选择视图，替换消息区显示，返回后回到原对话。 -->
  <section class="agent-pet-picker" :aria-label="t('agentAssistant.pet.title')">
    <div class="agent-pet-picker__toolbar">
      <IconBtn :title="t('agentAssistant.pet.back')" :aria-label="t('agentAssistant.pet.back')" @click="emit('back')">
        <VIcon icon="mdi-arrow-left" />
      </IconBtn>
      <div class="agent-pet-picker__heading">
        <div class="agent-pet-picker__title">{{ t('agentAssistant.pet.title') }}</div>
        <div class="agent-pet-picker__subtitle">{{ t('agentAssistant.pet.subtitle') }}</div>
      </div>
    </div>
    <div class="agent-pet-picker__body">
      <div v-if="loading" class="agent-pet-options">
        <VSkeletonLoader v-for="index in 3" :key="index" type="image, list-item-two-line" />
      </div>
      <div v-else class="agent-pet-options" role="radiogroup" :aria-label="t('agentAssistant.pet.title')">
        <VCard
          v-for="option in options"
          :key="option.id"
          class="agent-pet-option"
          :class="{ 'is-selected': option.id === selectedId }"
          variant="outlined"
          :color="option.id === selectedId ? 'primary' : undefined"
          :disabled="Boolean(savingId) && savingId !== option.id"
          :loading="savingId === option.id"
          role="radio"
          :aria-checked="option.id === selectedId"
          @click="selectOption(option)"
        >
          <div class="agent-pet-option__preview">
            <img
              v-if="option.previewUrl && !failedPreviewIds.has(getPreviewKey(option))"
              :src="option.previewUrl"
              :alt="option.title"
              loading="lazy"
              @error="handlePreviewError(option)"
            />
            <AgentPetRobotPreview v-else-if="option.builtinPreview" class="agent-pet-option__robot" />
            <VIcon v-else :icon="option.icon" size="40" />
            <VIcon v-if="option.id === selectedId" class="agent-pet-option__check" icon="mdi-check-circle" size="22" />
          </div>
          <div class="agent-pet-option__body">
            <div class="agent-pet-option__title text-body-2 font-weight-medium">{{ option.title }}</div>
            <div class="agent-pet-option__desc text-caption text-medium-emphasis">{{ option.description }}</div>
            <div v-if="option.hint" class="agent-pet-option__hint text-caption text-medium-emphasis mt-1">
              {{ option.hint }}
            </div>
            <VChip v-if="option.modeLabel" class="mt-2" size="x-small" variant="tonal" label>
              {{ option.modeLabel }}
            </VChip>
          </div>
        </VCard>
      </div>
      <p v-if="!loading && !declarations.length" class="agent-pet-picker__empty">
        {{ t('agentAssistant.pet.empty') }}
      </p>
    </div>
  </section>
</template>

<style lang="scss" scoped>
.agent-pet-picker {
  display: flex;
  flex-direction: column;
  block-size: 100%;
  min-block-size: 0;
}

.agent-pet-picker__toolbar {
  display: flex;
  align-items: center;
  column-gap: 0.5rem;
  padding-block: 0.75rem;
  padding-inline: 0.5rem 1rem;
}

.agent-pet-picker__heading {
  min-inline-size: 0;
}

.agent-pet-picker__title {
  color: rgba(var(--v-theme-on-surface), 0.9);
  font-size: 0.95rem;
  font-weight: 700;
  line-height: 1.35;
}

.agent-pet-picker__subtitle {
  color: rgba(var(--v-theme-on-surface), 0.6);
  font-size: 0.8rem;
  line-height: 1.4;
}

.agent-pet-picker__body {
  flex: 1 1 auto;
  min-block-size: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
  padding-block: 0.25rem calc(env(safe-area-inset-bottom, 0px) + 1rem);
  padding-inline: 1rem;
}

.agent-pet-picker__empty {
  color: rgba(var(--v-theme-on-surface), 0.6);
  font-size: 0.85rem;
  margin-block: 1rem 0;
}

// 面板宽度通常只放得下两列，最小宽度按内置机器人预览留足空间。
.agent-pet-options {
  display: grid;
  gap: 0.75rem;
  grid-template-columns: repeat(auto-fill, minmax(9rem, 1fr));
}

.agent-pet-option {
  cursor: pointer;
  transition:
    border-color 0.2s ease,
    box-shadow 0.2s ease;
}

.agent-pet-option.is-selected {
  border-width: 2px;
}

.agent-pet-option__preview {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  aspect-ratio: 4 / 3;
  background: rgba(var(--v-theme-on-surface), 0.04);
  color: rgba(var(--v-theme-on-surface), 0.56);

  img {
    block-size: 100%;
    inline-size: 100%;
    object-fit: contain;
  }
}

.agent-pet-option.is-selected .agent-pet-option__preview {
  background: rgba(var(--v-theme-primary), 0.08);
  color: rgb(var(--v-theme-primary));
}

.agent-pet-option__robot {
  pointer-events: none;
}

.agent-pet-option__check {
  position: absolute;
  color: rgb(var(--v-theme-primary));
  inset-block-start: 0.5rem;
  inset-inline-end: 0.5rem;
}

.agent-pet-option__body {
  padding: 0.625rem 0.75rem 0.75rem;
}

.agent-pet-option__title,
.agent-pet-option__desc {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
