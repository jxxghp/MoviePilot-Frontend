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

/** 选项卡片：跟随默认、内置机器人或某个插件形象。 */
interface AgentPetOption {
  /** 选项标识：`default`、`builtin` 或 `<plugin_id>:<key>`。 */
  id: string
  title: string
  description: string
  /** 写入 user config 的值。 */
  selection: AgentPetSelection
  icon?: string
  previewUrl?: string | null
  modeLabel?: string
}

const FOLLOW_DEFAULT_ID = 'default'

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

/** 管理员默认形象的展示名。 */
const defaultPetName = computed(() => {
  const value = globalSettingsStore.get(AGENT_PET_SYSTEM_SETTING_KEY)
  if (typeof value !== 'string' || !value) return t('agentAssistant.pet.builtin')
  return declarations.value.find(pet => getAgentPetId(pet) === value)?.name || t('agentAssistant.pet.builtin')
})

const options = computed<AgentPetOption[]>(() => {
  const items: AgentPetOption[] = [
    {
      id: FOLLOW_DEFAULT_ID,
      title: t('agentAssistant.pet.followDefault'),
      description: t('agentAssistant.pet.followDefaultDesc', { name: defaultPetName.value }),
      selection: null,
      icon: 'mdi-cog-sync-outline',
    },
    {
      id: AGENT_PET_BUILTIN,
      title: t('agentAssistant.pet.builtin'),
      description: t('agentAssistant.pet.builtinDesc'),
      selection: AGENT_PET_BUILTIN,
      icon: 'mdi-robot-happy-outline',
    },
  ]
  declarations.value.forEach(pet => {
    items.push({
      id: getAgentPetId(pet),
      title: pet.name,
      description: pet.plugin_name,
      selection: { plugin_id: pet.plugin_id, key: pet.key },
      previewUrl: pet.preview_url,
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

/** 选择后立即保存；Agent 入口挂载中时通过 store 即时切换形象。 */
async function selectOption(option: AgentPetOption) {
  if (savingId.value || option.id === selectedId.value) return
  savingId.value = option.id
  try {
    await petStore.setUserSelection(option.selection)
    selection.value = option.selection
    $toast.success(t('agentAssistant.pet.saveSuccess'))
  } catch (error) {
    $toast.error(
      t('agentAssistant.pet.saveFailed', { message: getApiErrorMessage(error) || t('common.apiRequestFailed') }),
    )
  } finally {
    savingId.value = ''
  }
}

function handlePreviewError(id: string) {
  failedPreviewIds.value = new Set([...failedPreviewIds.value, id])
}

onMounted(loadData)
</script>

<template>
  <VCard :title="t('agentAssistant.pet.title')" :subtitle="t('agentAssistant.pet.subtitle')">
    <VCardText>
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
              v-if="option.previewUrl && !failedPreviewIds.has(option.id)"
              :src="option.previewUrl"
              :alt="option.title"
              loading="lazy"
              @error="handlePreviewError(option.id)"
            />
            <VIcon v-else :icon="option.icon" size="40" />
            <VIcon v-if="option.id === selectedId" class="agent-pet-option__check" icon="mdi-check-circle" size="22" />
          </div>
          <div class="agent-pet-option__body">
            <div class="agent-pet-option__title text-body-1 font-weight-medium">{{ option.title }}</div>
            <div class="agent-pet-option__desc text-body-2 text-medium-emphasis">{{ option.description }}</div>
            <VChip v-if="option.modeLabel" class="mt-2" size="x-small" variant="tonal" label>
              {{ option.modeLabel }}
            </VChip>
          </div>
        </VCard>
      </div>
      <p v-if="!loading && !declarations.length" class="text-body-2 text-medium-emphasis mt-4 mb-0">
        {{ t('agentAssistant.pet.empty') }}
      </p>
    </VCardText>
  </VCard>
</template>

<style lang="scss" scoped>
.agent-pet-options {
  display: grid;
  gap: 1rem;
  grid-template-columns: repeat(auto-fill, minmax(11rem, 1fr));
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

.agent-pet-option__check {
  position: absolute;
  color: rgb(var(--v-theme-primary));
  inset-block-start: 0.5rem;
  inset-inline-end: 0.5rem;
}

.agent-pet-option__body {
  padding: 0.75rem 0.875rem 0.875rem;
}

.agent-pet-option__title,
.agent-pet-option__desc {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
