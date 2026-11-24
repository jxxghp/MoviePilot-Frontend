<script setup lang="ts">
import { copyToClipboard } from '@/@core/utils/navigator'
import { openSharedDialog, type SharedDialogController } from '@/composables/useSharedDialog'
import { useToast } from 'vue-toastification'
import DialogCloseBtn from '@/@core/components/DialogCloseBtn.vue'
import ChannelRuleFilterDialog from '@/components/dialog/ChannelRuleFilterDialog.vue'
import ChannelRuleSummaryCard from '@/components/cards/ChannelRuleSummaryCard.vue'
import { emptyChannelRuleFilters, matchesChannelRuleFilters, channelRuleFilterCount } from '@/utils/channelRuleFilters'
import { CHANNEL_SCOPES } from '@/api/authorization'
import type {
  AdmissionRule,
  InteractionMatch,
  InteractionScope,
  RuleKind,
  ChannelPlatformCapabilities,
} from '@/api/channelSettings'
import { useDisplay } from 'vuetify'

const props = defineProps<{
  /** 规则用途决定单条规则是否编辑业务权限。 */
  purpose: 'admission' | 'download'
  provider: string
  /** 平台的标签扩展来自后端能力描述。 */
  capabilities?: ChannelPlatformCapabilities
  kinds: RuleKind[]
  rules: (AdmissionRule | InteractionMatch)[]
}>()
const emit = defineEmits<{ close: []; apply: [rules: AdmissionRule[]] }>()
const { t } = useI18n()
const display = useDisplay()
const toast = useToast()
const ImportCodeDialog = defineAsyncComponent(() => import('@/components/dialog/ImportCodeDialog.vue'))
const filters = ref(emptyChannelRuleFilters())
const filterOpen = ref(false)
const filterCount = computed(() => channelRuleFilterCount(filters.value))
const importOpen = ref(false)
let importDialog: SharedDialogController | undefined
onBeforeUnmount(() => importDialog?.close())

const scopeValues: InteractionScope[] = CHANNEL_SCOPES
const maxRules = 100

const rows = ref<{ id: number; rule: AdmissionRule }[]>(
  props.rules.map((rule, id) => ({
    id,
    rule: {
      ...rule,
      name: rule.name || kindLabel(rule.kind) + (rule.target ? ' · ' + rule.target : ''),
      enabled: rule.enabled !== false,
      scopes: 'scopes' in rule ? [...rule.scopes] : [],
    },
  })),
)
let nextId = rows.value.length
const draft = ref<AdmissionRule>()
const editId = ref<number>()
const visibleRows = computed(() => rows.value.filter(({ rule }) => matchesChannelRuleFilters(rule, filters.value)))
const kindOptions = computed(() => props.kinds.map(value => ({ value, title: kindLabel(value) })))
const validDraft = computed(() => {
  const rule = draft.value
  return (
    !!rule &&
    !!rule.name?.trim() &&
    rule.name.trim().length <= 80 &&
    props.kinds.includes(rule.kind) &&
    (rule.kind === 'private' || (!!rule.target?.trim() && rule.target.trim().length <= 160)) &&
    (props.purpose === 'download' || !!rule.scopes.length)
  )
})

function kindLabel(kind: RuleKind) {
  return t(props.capabilities?.rule_labels?.[kind] ?? `channelSettings.ruleKind.${kind}`)
}

function openEditor(id?: number) {
  const kind = props.kinds[0]
  if (!kind) return
  const rule = rows.value.find(row => row.id === id)?.rule
  editId.value = id
  draft.value = rule
    ? { ...rule, scopes: [...rule.scopes] }
    : {
        name: t('channelSettings.defaultRuleName', { number: nextId + 1 }),
        kind,
        target: null,
        enabled: true,
        scopes: props.purpose === 'admission' ? ['search'] : [],
      }
}

function saveRule() {
  if (!draft.value || !validDraft.value) return
  const rule = {
    ...draft.value,
    name: draft.value.name?.trim(),
    enabled: draft.value.enabled !== false,
    scopes: scopeValues.filter(scope => draft.value?.scopes.includes(scope)),
  }
  rule.target = rule.kind === 'private' ? null : (rule.target?.trim() ?? null)
  const row = rows.value.find(item => item.id === editId.value)
  if (row) row.rule = rule
  else if (rows.value.length < maxRules) rows.value.push({ id: nextId++, rule })
  draft.value = undefined
}

/** 分享仅包含当前用途的规则，不读取平台配置或凭据。 */
async function shareRules() {
  const rules = rows.value.map(({ rule: { name, kind, target, enabled, scopes } }) => ({
    name,
    kind,
    target,
    enabled,
    ...(props.purpose === 'admission' ? { scopes } : {}),
  }))
  try {
    const copied = await copyToClipboard(
      JSON.stringify({
        version: 1,
        provider: props.provider,
        purpose: props.purpose,
        rules,
      }),
    )
    if (copied) toast.success(t('filterRule.shareSuccess'))
    else toast.error(t('filterRule.shareFailed'))
  } catch {
    toast.error(t('filterRule.shareFailed'))
  }
}

function readRule(input: unknown): AdmissionRule {
  if (!input || typeof input !== 'object') throw new Error('Invalid rule')
  const { name, kind, target, enabled, scopes } = input as Partial<AdmissionRule>
  if (
    (name != null && (typeof name !== 'string' || name.trim().length > 80)) ||
    (kind !== 'user' && kind !== 'group' && kind !== 'private') ||
    (!props.kinds.includes(kind) && enabled !== false) ||
    (enabled !== undefined && typeof enabled !== 'boolean') ||
    (kind === 'private' ? target != null : typeof target !== 'string' || !target.trim() || target.trim().length > 160)
  )
    throw new Error('Invalid rule data')
  if (
    props.purpose === 'admission' &&
    (!Array.isArray(scopes) ||
      !scopes.length ||
      scopes.length > scopeValues.length ||
      scopes.some(scope => !scopeValues.includes(scope)))
  )
    throw new Error('Invalid rule data')
  return {
    name: name?.trim() || kindLabel(kind) + (target ? ' · ' + target : ''),
    kind,
    target: kind === 'private' ? null : target!.trim(),
    enabled: enabled !== false,
    scopes: props.purpose === 'admission' ? scopeValues.filter(scope => scopes?.includes(scope)) : [],
  }
}

function openImport() {
  importOpen.value = true
  importDialog = openSharedDialog(
    ImportCodeDialog,
    { title: t('filterRule.import') },
    {
      close: () => {
        importOpen.value = false
      },
      save: (_type: string | undefined, code: Ref<string> | string) => {
        try {
          const { version, provider, purpose, rules } = JSON.parse(unref(code))
          if (
            version !== 1 ||
            provider !== props.provider ||
            purpose !== props.purpose ||
            !Array.isArray(rules) ||
            rules.length > maxRules
          )
            throw new Error('Invalid rule data')
          const imported = rules.map(readRule)
          rows.value = imported.map(rule => ({ id: nextId++, rule }))
          filters.value = emptyChannelRuleFilters()
          toast.success(t('filterRule.importSuccess'))
        } catch {
          toast.error(t('channelSettings.ruleImportFailed'))
        } finally {
          importOpen.value = false
        }
      },
    },
    { closeOn: ['close', 'save', 'update:modelValue'] },
  )
}
</script>

<template>
  <VDialog
    :model-value="true"
    :retain-focus="!draft && !importOpen && !filterOpen"
    :fullscreen="!display.mdAndUp.value"
    max-width="80rem"
    scrollable
    @update:model-value="open => !open && emit('close')"
  >
    <VCard>
      <VCardItem
        :title="t(purpose === 'admission' ? 'channelSettings.editAdmissionRules' : 'channelSettings.editDownloadRules')"
      >
        <template #subtitle>
          <div class="d-flex align-center flex-wrap ga-2 mt-1">
            <span class="text-caption text-medium-emphasis">{{
              t('channelSettings.ruleCount', { visible: visibleRows.length, total: rows.length })
            }}</span>
            <VChip
              v-if="filterCount"
              size="small"
              color="primary"
              variant="tonal"
              closable
              @click:close="filters = emptyChannelRuleFilters()"
              >{{ t('channelSettings.activeFilters', { count: filterCount }) }}</VChip
            >
          </div>
        </template>
        <template #append>
          <div class="d-flex align-center ga-1">
            <IconBtn
              :aria-label="t('channelSettings.filterRules')"
              :title="t('channelSettings.filterRules')"
              :color="filterCount ? 'primary' : undefined"
              @click="filterOpen = true"
              ><VIcon icon="mdi-filter-variant"
            /></IconBtn>
            <DialogCloseBtn inner-class="position-relative" @click="emit('close')" />
          </div>
        </template>
      </VCardItem>
      <VDivider />
      <VCardText>
        <div v-if="!rows.length" class="text-center">{{ t('filterRule.add') }}</div>
        <div v-else-if="!visibleRows.length" class="text-center">{{ t('channelSettings.ruleSearchEmpty') }}</div>
        <div v-else class="grid gap-3 grid-filterrule-card">
          <ChannelRuleSummaryCard
            v-for="{ id, rule } in visibleRows"
            :key="id"
            :name="rule.name || kindLabel(rule.kind)"
            :icon="purpose === 'admission' ? 'mdi-shield-account-outline' : 'mdi-download-outline'"
            :enabled="rule.enabled !== false"
            :disabled="!kinds.includes(rule.kind)"
            :metrics="[
              { label: t('channelSettings.ruleType'), value: kindLabel(rule.kind) },
              {
                label: t('channelSettings.allowedOperations'),
                value: purpose === 'admission' ? rule.scopes.length : t('channelSettings.autoDownloadLabel'),
              },
            ]"
            :detail="t('channelSettings.ruleMatchDetail')"
            detail-icon="mdi-filter-check-outline"
            @toggle="value => (rule.enabled = value)"
            @edit="openEditor(id)"
            @remove="rows = rows.filter(item => item.id !== id)"
          >
            <div class="d-flex flex-column ga-2">
              <span>{{ rule.target || kindLabel(rule.kind) }}</span>
              <div v-if="rule.scopes.length" class="d-flex flex-wrap ga-1">
                <VChip v-for="scope in rule.scopes" :key="scope" size="x-small" variant="tonal">{{
                  t('channelAuthorization.scopes.' + scope)
                }}</VChip>
              </div>
            </div>
          </ChannelRuleSummaryCard>
        </div>
      </VCardText>
      <VCardActions class="app-dialog-actions">
        <VBtn
          color="primary"
          variant="tonal"
          class="app-dialog-actions__icon-btn"
          :aria-label="t('filterRule.add')"
          :title="t('filterRule.add')"
          :disabled="!kinds.length || rows.length >= maxRules"
          @click="openEditor()"
        >
          <VIcon icon="mdi-plus" />
        </VBtn>
        <VBtn
          color="success"
          variant="tonal"
          class="app-dialog-actions__icon-btn"
          :aria-label="t('filterRule.import')"
          :title="t('filterRule.import')"
          :disabled="!kinds.length"
          @click="openImport"
        >
          <VIcon icon="mdi-import" />
        </VBtn>
        <VBtn
          color="info"
          variant="tonal"
          class="app-dialog-actions__icon-btn"
          :aria-label="t('filterRule.share')"
          :title="t('filterRule.share')"
          :disabled="!rows.length"
          @click="shareRules"
        >
          <VIcon icon="mdi-share" />
        </VBtn>
        <VBtn
          color="error"
          variant="tonal"
          class="app-dialog-actions__icon-btn"
          :aria-label="t('channelSettings.clearRules')"
          :title="t('channelSettings.clearRules')"
          :disabled="!rows.length"
          @click="rows = []"
        >
          <VIcon icon="mdi-delete-empty-outline" />
        </VBtn>
        <VSpacer />
        <VBtn variant="text" @click="emit('close')">{{ t('common.cancel') }}</VBtn>
        <VBtn
          color="primary"
          variant="flat"
          prepend-icon="mdi-content-save"
          class="px-5"
          @click="
            emit(
              'apply',
              rows.map(row => row.rule),
            )
          "
        >
          {{ t('common.save') }}
        </VBtn>
      </VCardActions>
    </VCard>
  </VDialog>

  <ChannelRuleFilterDialog
    v-if="filterOpen"
    :filters="filters"
    :kinds="kindOptions"
    @close="filterOpen = false"
    @apply="
      value => {
        filters = value
        filterOpen = false
      }
    "
  />
  <VDialog
    v-if="draft"
    :model-value="true"
    :fullscreen="!display.mdAndUp.value"
    max-width="30rem"
    scrollable
    @update:model-value="open => !open && (draft = undefined)"
  >
    <VCard>
      <VCardItem class="py-2">
        <template #prepend><VIcon icon="mdi-pencil-outline" class="me-2" /></template>
        <VCardTitle>{{
          t(editId === undefined ? 'channelSettings.addRule' : 'channelSettings.ruleEditorTitle')
        }}</VCardTitle>
      </VCardItem>
      <DialogCloseBtn @click="draft = undefined" />
      <VDivider />
      <VCardText>
        <VForm class="d-flex flex-column ga-4 pt-2" @submit.prevent="saveRule">
          <VTextField
            v-model="draft.name"
            :label="t('channelSettings.ruleName')"
            maxlength="80"
            counter="80"
            hide-details="auto"
          />
          <VSelect
            v-model="draft.kind"
            :items="kindOptions"
            :label="t('channelSettings.ruleType')"
            hide-details="auto"
            @update:model-value="draft.target = null"
          />
          <VTextField
            v-if="draft.kind !== 'private'"
            v-model="draft.target"
            :label="t(draft.kind === 'user' ? 'channelSettings.userId' : 'channelSettings.conversationId')"
            maxlength="160"
            hide-details="auto"
          />
          <div v-if="purpose === 'admission'" role="group" :aria-label="t('channelSettings.allowedOperations')">
            <div class="text-subtitle-2 mb-2">{{ t('channelSettings.allowedOperations') }}</div>
            <VRow dense>
              <VCol v-for="scope in CHANNEL_SCOPES" :key="scope" cols="12" sm="6">
                <VCheckbox
                  v-model="draft.scopes"
                  :mobile-layout="false"
                  :value="scope"
                  :label="t(`channelAuthorization.scopes.${scope}`)"
                  hide-details
                />
              </VCol>
            </VRow>
            <p v-if="draft.scopes.includes('schedule')" class="text-caption text-medium-emphasis mt-2 mb-0">
              {{ t('channelSettings.ruleScheduleHint') }}
            </p>
          </div>
        </VForm>
      </VCardText>
      <VDivider />
      <VCardActions class="app-dialog-actions">
        <VSpacer />
        <VBtn variant="text" @click="draft = undefined">{{ t('common.cancel') }}</VBtn>
        <VBtn color="primary" variant="flat" prepend-icon="mdi-content-save" :disabled="!validDraft" @click="saveRule">
          {{ t('common.save') }}
        </VBtn>
      </VCardActions>
    </VCard>
  </VDialog>
</template>

<style scoped>
.rule-match {
  min-inline-size: 0;
  overflow-wrap: anywhere;
}
</style>
