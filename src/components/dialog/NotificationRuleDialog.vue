<script setup lang="ts">
import DialogCloseBtn from '@/@core/components/DialogCloseBtn.vue'
import ChannelRuleFilterDialog from '@/components/dialog/ChannelRuleFilterDialog.vue'
import ChannelRuleSummaryCard from '@/components/cards/ChannelRuleSummaryCard.vue'
import { emptyChannelRuleFilters, matchesChannelRuleFilters, channelRuleFilterCount } from '@/utils/channelRuleFilters'
import { copyToClipboard } from '@/@core/utils/navigator'
import {
  getNotificationRuleAccounts,
  type NotificationRuleAudience,
  type NotificationRule,
  type NotificationRuleAccount,
  type NotificationTargetKind,
} from '@/api/channelSettings'
import { openSharedDialog } from '@/composables/useSharedDialog'
import { useDisplay } from 'vuetify'
import { useToast } from 'vue-toastification'

const props = defineProps<{
  provider: string
  kinds: NotificationTargetKind[]
  messageOptions: { value: string; title: string }[]
  rules: NotificationRule[]
}>()
const emit = defineEmits<{ close: []; apply: [rules: NotificationRule[]] }>()
const { t } = useI18n()
const toast = useToast()
const display = useDisplay()
const ImportCodeDialog = defineAsyncComponent(() => import('@/components/dialog/ImportCodeDialog.vue'))
const text = (key: string) => t('channelSettings.deliveryRules.' + key)
const limit = 100
const filters = ref(emptyChannelRuleFilters())
const filterOpen = ref(false)
const filterCount = computed(() => channelRuleFilterCount(filters.value))
const filterKinds = computed(() =>
  [...new Set([...props.kinds, ...rows.value.map(row => row.rule.kind)])].map(value => ({
    value,
    title: kindLabel(value),
  })),
)
const filterAudiences = computed(() =>
  ['any', 'admin', 'user', 'all'].map(value => ({ value, title: text('audiences.' + value) })),
)
const draft = ref<NotificationRule>()
const editId = ref<number>()
const importing = ref(false)
const accounts = ref<NotificationRuleAccount[]>([])
const isPush = props.provider === 'webpush' || props.provider === 'apppush'
const accountsRequest = new AbortController()
const loadingAccounts = ref(isPush)
if (isPush) {
  void getNotificationRuleAccounts(accountsRequest.signal)
    .then(items => {
      if (!accountsRequest.signal.aborted) accounts.value = items
    })
    .catch(() => {
      if (!accountsRequest.signal.aborted) toast.error(t('channelSettings.loadFailed'))
    })
    .finally(() => {
      loadingAccounts.value = false
    })
}
let importer: ReturnType<typeof openSharedDialog> | undefined
onBeforeUnmount(() => {
  importer?.close()
  accountsRequest.abort()
})
let nextId = 0
const rows = ref(props.rules.map(rule => ({ id: nextId++, rule: copy(rule) })))
const needsAddress = computed(() => ['account', 'user', 'conversation'].includes(draft.value?.kind ?? ''))
const newKinds = computed(() => props.kinds.map(value => ({ value, title: kindLabel(value) })))
const scopes = computed(() => {
  const values: NotificationRuleAudience[] =
    draft.value?.kind === 'all'
      ? ['all']
      : draft.value?.kind === 'bound' || draft.value?.kind === 'account'
        ? ['admin', 'user', 'all']
        : ['admin', 'all']
  return values.map(value => ({ value, title: text('audiences.' + value) }))
})
const visible = computed(() => rows.value.filter(({ rule }) => matchesChannelRuleFilters(rule, filters.value)))
const validDraft = computed(() => {
  const item = draft.value
  return (
    !!item &&
    !!item.name?.trim() &&
    item.name.trim().length <= 80 &&
    props.kinds.includes(item.kind) &&
    item.message_types.length > 0 &&
    (item.kind !== 'all' || selectedAudiences(item).length === 1) &&
    selectedAudiences(item).every(value => scopes.value.some(option => option.value === value)) &&
    (!item.send_time ||
      (/^(?:[01][0-9]|2[0-3]):[0-5][0-9]$/.test(item.send_time.start) &&
        /^(?:[01][0-9]|2[0-3]):[0-5][0-9]$/.test(item.send_time.end))) &&
    (!needsAddress.value || !!item.target?.trim()) &&
    (!item.thread_id?.trim() || /^[1-9]\d*$/.test(item.thread_id.trim()))
  )
})

function copy(rule: NotificationRule): NotificationRule {
  return {
    ...rule,
    audience: selectedAudiences(rule).length === 1 ? selectedAudiences(rule)[0] : 'any',
    audiences: [...selectedAudiences(rule)],
    name: rule.name || label(rule),
    send_time: rule.send_time ? { ...rule.send_time } : null,
    message_types: [...rule.message_types],
    legacy_usernames: [...(rule.legacy_usernames ?? [])],
  }
}

/** 旧单选配置转成独立多选草稿，空集合沿用全局范围。 */
function selectedAudiences(rule: NotificationRule): NotificationRuleAudience[] {
  return rule.audiences ?? (rule.audience === 'any' ? [] : [rule.audience])
}

function audienceLabel(rule: NotificationRule) {
  const values = selectedAudiences(rule)
  return values.length ? values.map(value => text('audiences.' + value)).join('、') : text('audiences.any')
}

function kindLabel(kind: NotificationTargetKind) {
  if (kind === 'conversation' && ['slack', 'discord', 'vocechat'].includes(props.provider)) return text('channel')
  return text('kinds.' + kind)
}

function label(rule: NotificationRule) {
  const target =
    rule.kind === 'account'
      ? (accounts.value.find(item => item.identity === rule.target)?.name ?? rule.target)
      : rule.target
  return target ? kindLabel(rule.kind) + ' · ' + target : kindLabel(rule.kind)
}

function scheduleLabel(rule: NotificationRule) {
  if (!rule.send_time || rule.send_time.start === rule.send_time.end) return t('channelSettings.allDay')
  return (
    rule.send_time.start +
    ' – ' +
    rule.send_time.end +
    (rule.send_time.start > rule.send_time.end ? ' · ' + t('channelSettings.overnight') : '')
  )
}

function openRule(id?: number) {
  editId.value = id
  const rule = rows.value.find(row => row.id === id)?.rule
  if (rule) draft.value = copy(rule)
  else if (props.kinds[0]) {
    draft.value = {
      name: t('channelSettings.defaultRuleName', { number: nextId + 1 }),
      send_time: null,
      kind: props.kinds[0],
      enabled: true,
      audience: 'any',
      audiences: [],
      target: null,
      thread_id: null,
      message_types: [],
      fallback_only: false,
      legacy_usernames: [],
      owner_identity: null,
    }
  }
}

function changeKind() {
  if (!draft.value) return
  const rule = draft.value
  rule.target = null
  rule.thread_id = null
  rule.audiences = rule.kind === 'all' ? ['all'] : []
  rule.audience = rule.kind === 'all' ? 'all' : 'any'
}

function saveRule() {
  if (!draft.value || !validDraft.value) return
  const rule = copy(draft.value)
  rule.name = rule.name?.trim()
  rule.target = needsAddress.value ? (rule.target?.trim() ?? null) : null
  rule.thread_id = props.provider === 'telegram' && rule.kind === 'conversation' ? rule.thread_id?.trim() || null : null
  rule.owner_identity = rule.owner_identity?.trim() || null
  const row = rows.value.find(item => item.id === editId.value)
  if (row) row.rule = rule
  else if (rows.value.length < limit) rows.value.push({ id: nextId++, rule })
  draft.value = undefined
}

async function shareRules() {
  try {
    if (
      await copyToClipboard(
        JSON.stringify({
          version: 2,
          provider: props.provider,
          purpose: 'notification',
          rules: rows.value.map(row => row.rule),
        }),
      )
    )
      toast.success(t('filterRule.shareSuccess'))
    else toast.error(t('filterRule.shareFailed'))
  } catch {
    toast.error(t('filterRule.shareFailed'))
  }
}

function readImport(code: string) {
  const { version, provider, purpose, rules } = JSON.parse(code)
  if (
    ![1, 2].includes(version) ||
    provider !== props.provider ||
    purpose !== 'notification' ||
    !Array.isArray(rules) ||
    rules.length > limit
  )
    throw new Error('Invalid rule list')
  return rules.map(input => {
    if (!input || typeof input !== 'object') throw new Error('Invalid rule')
    const {
      name,
      send_time,
      kind,
      target,
      thread_id,
      audience,
      audiences,
      enabled,
      message_types,
      fallback_only,
      legacy_usernames,
      owner_identity,
    } = input
    const selected = audiences ?? (audience === 'any' ? [] : [audience])
    const needsTarget = kind === 'account' || kind === 'user' || kind === 'conversation'
    const isConcrete = typeof target === 'string' && !!target.trim() && target.length <= 160
    if (
      (name != null && (typeof name !== 'string' || name.trim().length > 80)) ||
      (send_time != null &&
        (!send_time ||
          typeof send_time !== 'object' ||
          !/^(?:[01][0-9]|2[0-3]):[0-5][0-9]$/.test(send_time.start) ||
          !/^(?:[01][0-9]|2[0-3]):[0-5][0-9]$/.test(send_time.end))) ||
      (!props.kinds.includes(kind) && !(kind === 'review' && enabled === false)) ||
      typeof enabled !== 'boolean' ||
      (version === 2 && !Array.isArray(audiences)) ||
      (audiences == null && !['any', 'admin', 'user', 'all'].includes(audience)) ||
      !Array.isArray(selected) ||
      selected.length > 3 ||
      !selected.every(value => ['admin', 'user', 'all'].includes(value)) ||
      (kind === 'all' && (selected.length !== 1 || selected[0] !== 'all')) ||
      (selected.includes('user') && kind !== 'bound' && kind !== 'account' && kind !== 'review') ||
      (needsTarget ? !isConcrete : target != null) ||
      (thread_id != null &&
        (kind !== 'conversation' ||
          props.provider !== 'telegram' ||
          typeof thread_id !== 'string' ||
          !/^[1-9]\d*$/.test(thread_id))) ||
      !Array.isArray(message_types) ||
      (enabled && !message_types.length) ||
      message_types.length > 32 ||
      !message_types.every(value => typeof value === 'string' && value.trim() && value.length <= 160) ||
      (fallback_only !== undefined && typeof fallback_only !== 'boolean') ||
      (legacy_usernames !== undefined &&
        (!Array.isArray(legacy_usernames) ||
          legacy_usernames.length > 100 ||
          !legacy_usernames.every(value => typeof value === 'string' && value.trim() && value.length <= 160))) ||
      (owner_identity != null && (typeof owner_identity !== 'string' || owner_identity.length > 160))
    )
      throw new Error('Invalid rule')

    const rule: NotificationRule = {
      name: name?.trim() || t('channelSettings.defaultRuleName', { number: nextId + 1 }),
      send_time: send_time ? { start: send_time.start, end: send_time.end } : null,
      kind,
      target: target?.trim() ?? null,
      thread_id: thread_id ?? null,
      audience: selected.length === 1 ? selected[0] : 'any',
      audiences: [...new Set<NotificationRuleAudience>(selected)],
      enabled,
      message_types,
      fallback_only: fallback_only ?? false,
      legacy_usernames: legacy_usernames ?? [],
      owner_identity: owner_identity ?? null,
    }
    return { id: nextId++, rule }
  })
}

function openImport() {
  importing.value = true
  importer = openSharedDialog(
    ImportCodeDialog,
    { title: t('filterRule.import') },
    {
      close: () => {
        importing.value = false
      },
      save: (_type: string | undefined, code: Ref<string> | string) => {
        try {
          rows.value = readImport(unref(code))
          filters.value = emptyChannelRuleFilters()
          toast.success(t('filterRule.importSuccess'))
        } catch {
          toast.error(t('channelSettings.ruleImportFailed'))
        } finally {
          importing.value = false
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
    :retain-focus="!draft && !importing && !filterOpen"
    :fullscreen="!display.mdAndUp.value"
    max-width="80rem"
    scrollable
    @update:model-value="open => !open && emit('close')"
  >
    <VCard>
      <VCardItem :title="text('title')">
        <template #subtitle>
          <div class="d-flex align-center flex-wrap ga-2 mt-1">
            <span class="text-caption text-medium-emphasis">{{
              t('channelSettings.ruleCount', { visible: visible.length, total: rows.length })
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
        <div v-else-if="!visible.length" class="text-center">{{ t('channelSettings.ruleSearchEmpty') }}</div>
        <div v-else class="grid gap-3 grid-filterrule-card">
          <ChannelRuleSummaryCard
            v-for="{ id, rule } in visible"
            :key="id"
            :name="rule.name || label(rule)"
            icon="mdi-bell-outline"
            :enabled="rule.enabled"
            :disabled="rule.kind === 'review' || !rule.message_types.length"
            :metrics="[
              { label: t('setting.notification.messageType'), value: rule.message_types.length },
              { label: text('audience'), value: audienceLabel(rule) },
            ]"
            :detail="scheduleLabel(rule)"
            @toggle="value => (rule.enabled = value)"
            @edit="openRule(id)"
            @remove="rows = rows.filter(row => row.id !== id)"
          >
            <div class="d-flex flex-column ga-2">
              <div>{{ label(rule) }}</div>
              <div class="d-flex flex-wrap ga-1">
                <VChip v-for="type in rule.message_types" :key="type" size="x-small" variant="tonal">{{
                  messageOptions.find(item => item.value === type)?.title ?? type
                }}</VChip>
              </div>
              <span v-if="rule.kind === 'review'" class="text-caption">{{ text('reviewHint') }}</span>
              <span v-if="rule.legacy_usernames.length" class="text-caption"
                >{{ text('legacyNames') }} · {{ rule.legacy_usernames.join(', ') }}</span
              >
            </div>
          </ChannelRuleSummaryCard>
        </div>
      </VCardText>
      <VCardActions class="app-dialog-actions">
        <VBtn
          color="primary"
          variant="tonal"
          class="app-dialog-actions__icon-btn"
          :disabled="rows.length >= limit"
          :aria-label="t('filterRule.add')"
          :title="t('filterRule.add')"
          @click="openRule()"
          ><VIcon icon="mdi-plus"
        /></VBtn>
        <VBtn
          color="success"
          variant="tonal"
          class="app-dialog-actions__icon-btn"
          :aria-label="t('filterRule.import')"
          :title="t('filterRule.import')"
          @click="openImport"
          ><VIcon icon="mdi-import"
        /></VBtn>
        <VBtn
          color="info"
          variant="tonal"
          class="app-dialog-actions__icon-btn"
          :disabled="!rows.length"
          :aria-label="t('filterRule.share')"
          :title="t('filterRule.share')"
          @click="shareRules"
          ><VIcon icon="mdi-share"
        /></VBtn>
        <VBtn
          color="error"
          variant="tonal"
          class="app-dialog-actions__icon-btn"
          :disabled="!rows.length"
          :aria-label="t('channelSettings.clearRules')"
          :title="t('channelSettings.clearRules')"
          @click="rows = []"
          ><VIcon icon="mdi-delete-empty-outline"
        /></VBtn>
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
    :kinds="filterKinds"
    :message-types="messageOptions"
    :audiences="filterAudiences"
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
    max-width="34rem"
    scrollable
    @update:model-value="open => !open && (draft = undefined)"
  >
    <VCard :title="text('edit')">
      <DialogCloseBtn @click="draft = undefined" />
      <VDivider />
      <VCardText>
        <div class="d-flex flex-column ga-4">
          <VTextField
            v-model="draft.name"
            :label="t('channelSettings.ruleName')"
            maxlength="80"
            counter="80"
            hide-details="auto"
          />
          <VSelect
            v-model="draft.message_types"
            :items="messageOptions"
            :label="t('setting.notification.messageType')"
            multiple
            chips
            hide-details
          />
          <VSelect
            v-model="draft.kind"
            :items="newKinds"
            :label="text('destination')"
            hide-details
            @update:model-value="changeKind"
          />

          <VAutocomplete
            v-if="draft.kind === 'account'"
            v-model="draft.target"
            :items="accounts"
            item-title="name"
            item-value="identity"
            :label="text('kinds.account')"
            :loading="loadingAccounts"
            hide-details
          />
          <VTextField
            v-else-if="needsAddress"
            v-model="draft.target"
            :label="text('target')"
            maxlength="160"
            hide-details
          />
          <VTextField
            v-if="provider === 'telegram' && draft.kind === 'conversation'"
            v-model="draft.thread_id"
            :label="text('topic')"
            inputmode="numeric"
            maxlength="160"
            hide-details
          />
          <VSelect
            v-model="draft.audiences"
            :items="scopes"
            multiple
            chips
            :clearable="draft.kind !== 'all'"
            :placeholder="text('audiences.any')"
            :label="text('audience')"
            :hint="text('audienceHint')"
            persistent-hint
          />
          <div>
            <VSwitch
              :model-value="!!draft.send_time"
              :label="t('channelSettings.sendingTime')"
              :hint="t('channelSettings.sendingTimeHint')"
              persistent-hint
              @update:model-value="
                value => draft && (draft.send_time = value ? { start: '08:00', end: '22:00' } : null)
              "
            />
            <VRow v-if="draft.send_time" class="mt-2">
              <VCol cols="12" sm="6"
                ><VTextField
                  v-model="draft.send_time.start"
                  type="time"
                  :label="t('channelSettings.timeStart')"
                  hide-details
              /></VCol>
              <VCol cols="12" sm="6"
                ><VTextField
                  v-model="draft.send_time.end"
                  type="time"
                  :label="t('channelSettings.timeEnd')"
                  hide-details
              /></VCol>
            </VRow>
          </div>
          <VAlert v-if="draft.kind === 'all'" type="warning" variant="tonal">{{ text('allHint') }}</VAlert>
          <VAutocomplete
            v-if="isPush"
            v-model="draft.owner_identity"
            :items="accounts"
            item-title="name"
            item-value="identity"
            :label="text('owner')"
            :hint="text('ownerHint')"
            :loading="loadingAccounts"
            clearable
            persistent-hint
          />
          <VAlert v-if="draft.legacy_usernames.length" type="info" variant="tonal">
            {{ text('legacyNames') }} · {{ draft.legacy_usernames.join(', ') }}
          </VAlert>
          <VCheckbox
            v-if="draft.legacy_usernames.length"
            :model-value="true"
            :label="text('retainNames')"
            hide-details
            @update:model-value="value => !value && draft && (draft.legacy_usernames = [])"
          />
          <VCheckbox
            v-if="(needsAddress && draft.kind !== 'account') || draft.kind === 'all'"
            v-model="draft.fallback_only"
            :label="text('fallback')"
            hide-details
          />
        </div>
      </VCardText>
      <VCardActions class="app-dialog-actions">
        <VSpacer />
        <VBtn variant="text" @click="draft = undefined">{{ t('common.cancel') }}</VBtn>
        <VBtn
          color="primary"
          variant="flat"
          prepend-icon="mdi-content-save"
          :disabled="!validDraft"
          @click="saveRule"
          >{{ t('common.save') }}</VBtn
        >
      </VCardActions>
    </VCard>
  </VDialog>
</template>
