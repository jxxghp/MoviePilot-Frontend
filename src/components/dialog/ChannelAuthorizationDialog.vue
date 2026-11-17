<script setup lang="ts">
import { computed, onBeforeUnmount, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useDisplay } from 'vuetify'
import { getApiErrorMessage } from '@/api/client'
import { nativeChromeActive } from '@/native/layout'
import {
  CHANNEL_SCOPES,
  DEFAULT_CHANNEL_SCOPES,
  createChannelAuthorization,
  getChannelAuthorizations,
  updateChannelAuthorization,
  type AuthorizationChannel,
  type ChannelMember,
  type ChannelMemberUpdate,
  type ChannelRole,
  type ChannelScope,
} from '@/api/authorization'

/** 共享弹窗宿主传入的可见状态。 */
const props = withDefaults(defineProps<{ modelValue?: boolean }>(), { modelValue: true })
/** 关闭即释放整个管理会话，不把审批表单留在用户列表中。 */
const emit = defineEmits<{ (event: 'close'): void; (event: 'update:modelValue', value: boolean): void }>()
const { t } = useI18n()
const display = useDisplay()
const saving = ref(false)
const visible = computed({
  get: () => props.modelValue,
  set: value => {
    if (saving.value) return
    emit('update:modelValue', value)
    if (!value) emit('close')
  },
})
const members = ref<ChannelMember[]>([])
const channels = ref<AuthorizationChannel[]>([])
const loading = ref(false)
const error = ref('')
const tab = ref<'pending' | 'approved' | 'inactive'>('pending')
const keyword = ref('')
const channelFilter = ref<string | null>(null)
const editing = ref(false)
const selected = ref<ChannelMember | null>(null)
const adminConfirmed = ref(false)
const form = reactive({
  notificationId: '',
  senderId: '',
  displayName: '',
  role: 'member' as ChannelRole,
  scopes: [...DEFAULT_CHANNEL_SCOPES],
})
let controller: AbortController | null = null
let generation = 0
let disposed = false

const filteredMembers = computed(() => {
  const query = (keyword.value || '').trim().toLocaleLowerCase()
  return members.value.filter(member => {
    const statusMatches =
      tab.value === 'inactive' ? ['disabled', 'rejected'].includes(member.status) : member.status === tab.value
    return (
      statusMatches &&
      (!channelFilter.value || member.notification_id === channelFilter.value) &&
      (!query ||
        `${member.display_name} ${member.sender_id} ${member.linked_username ?? ''}`
          .toLocaleLowerCase()
          .includes(query))
    )
  })
})
const channelOptions = computed(() =>
  channels.value.map(channel => ({
    title: `${channel.name} · ${channel.channel}`,
    value: channel.id,
  })),
)
const enabledChannels = computed(() =>
  channelOptions.value.filter(option => channels.value.some(channel => channel.id === option.value && channel.enabled)),
)
const roleOptions = computed(() =>
  (['member', 'admin'] as const).map(value => ({ title: t(`channelAuthorization.roles.${value}`), value })),
)
const needsAdminConfirmation = computed(
  () => form.role === 'admin' && (selected.value?.role !== 'admin' || selected.value?.status !== 'approved'),
)
const canSave = computed(
  () =>
    (Boolean(selected.value) || Boolean(form.notificationId && form.senderId.trim())) &&
    (!needsAdminConfirmation.value || adminConfirmed.value),
)

/** 读取关闭代际内的数据；失败保留已加载列表，并提供显式重试。 */
async function load() {
  controller?.abort()
  controller = new AbortController()
  const current = ++generation
  loading.value = true
  error.value = ''
  try {
    const result = await getChannelAuthorizations(controller.signal)
    if (disposed || !visible.value || current !== generation) return
    members.value = result.members
    channels.value = result.channels
  } catch (cause) {
    if (!disposed && visible.value && current === generation)
      error.value = getApiErrorMessage(cause) ?? t('channelAuthorization.loadFailed')
  } finally {
    if (!disposed && current === generation) loading.value = false
  }
}

/** 在同一弹窗中打开审批或编辑表单，角色和能力始终来自当前记录。 */
function edit(member: ChannelMember | null) {
  selected.value = member
  form.notificationId = member?.notification_id ?? enabledChannels.value[0]?.value ?? ''
  form.senderId = member?.sender_id ?? ''
  form.displayName = member?.display_name ?? ''
  form.role = member?.role ?? 'member'
  form.scopes = [...(member?.scopes ?? DEFAULT_CHANNEL_SCOPES)]
  adminConfirmed.value = false
  error.value = ''
  editing.value = true
}

/** 返回列表时清除表单引用，正在提交的操作不可重复触发。 */
function back() {
  if (saving.value) return
  editing.value = false
  selected.value = null
  error.value = ''
}

/** 用服务器已提交的记录替换列表，不因保存失败丢失输入。 */
function acceptSaved(member: ChannelMember) {
  const index = members.value.findIndex(item => item.id === member.id)
  if (index === -1) members.value.unshift(member)
  else members.value[index] = member
}

/** 提交明确批准或编辑的角色与范围；新增管理员需要额外确认。 */
async function save() {
  if (saving.value || !canSave.value) return
  const current = generation
  saving.value = true
  error.value = ''
  const payload: ChannelMemberUpdate = {
    status: 'approved',
    role: form.role,
    scopes: form.role === 'admin' ? [...CHANNEL_SCOPES] : [...form.scopes],
  }
  try {
    const member = selected.value
      ? await updateChannelAuthorization(selected.value.id, payload)
      : await createChannelAuthorization({
          ...payload,
          notification_id: form.notificationId,
          sender_id: form.senderId.trim(),
          display_name: form.displayName.trim(),
        })
    if (disposed || !visible.value || current !== generation) return
    acceptSaved(member)
    if (!selected.value || tab.value === 'inactive') tab.value = 'approved'
    editing.value = false
    selected.value = null
  } catch (cause) {
    if (!disposed && current === generation)
      error.value = getApiErrorMessage(cause) ?? t('channelAuthorization.saveFailed')
  } finally {
    if (!disposed) saving.value = false
  }
}

/** 拒绝或停用时保留原权限，恢复必须重新打开表单明确批准。 */
async function changeStatus(member: ChannelMember, status: 'rejected' | 'disabled') {
  if (saving.value) return
  const current = generation
  saving.value = true
  error.value = ''
  try {
    const result = await updateChannelAuthorization(member.id, {
      status,
      role: member.role,
      scopes: [...member.scopes],
    })
    if (!disposed && visible.value && current === generation) acceptSaved(result)
  } catch (cause) {
    if (!disposed && current === generation)
      error.value = getApiErrorMessage(cause) ?? t('channelAuthorization.saveFailed')
  } finally {
    if (!disposed) saving.value = false
  }
}

/** 计算各状态总量，不把搜索后的数量误当作待审批总量。 */
function count(status: 'pending' | 'approved' | 'inactive') {
  return members.value.filter(member =>
    status === 'inactive' ? ['disabled', 'rejected'].includes(member.status) : member.status === status,
  ).length
}

watch(
  () => props.modelValue,
  value => {
    generation++
    controller?.abort()
    if (value) void load()
  },
  { immediate: true },
)
onBeforeUnmount(() => {
  disposed = true
  generation++
  controller?.abort()
})
</script>

<template>
  <VDialog v-model="visible" max-width="58rem" :fullscreen="!display.mdAndUp.value" :persistent="saving" scrollable>
    <VCard class="channel-authorization-dialog">
      <VCardItem class="py-3" data-native-sheet-actions>
        <template #prepend
          ><VAvatar color="primary" variant="tonal" rounded class="me-2"
            ><VIcon icon="mdi-account-key-outline" /></VAvatar
        ></template>
        <VCardTitle>{{ t('channelAuthorization.title') }}</VCardTitle>
        <template #append>
          <VBtn
            v-if="nativeChromeActive && !editing"
            variant="text"
            prepend-icon="mdi-account-plus-outline"
            data-native-sheet-action="mdi-account-plus"
            :disabled="loading || saving || enabledChannels.length === 0"
            @click="edit(null)"
            >{{ t('channelAuthorization.add') }}</VBtn
          >
        </template>
        <VDialogCloseBtn v-model="visible" />
      </VCardItem>
      <VDivider />
      <VCardText class="authorization-body">
        <VAlert v-if="error" type="error" variant="tonal" class="mb-4" role="alert">
          {{ error }}
          <template v-if="!editing" #append
            ><VBtn variant="text" :disabled="loading" @click="load">{{ t('common.retry') }}</VBtn></template
          >
        </VAlert>
        <template v-if="editing">
          <VBtn variant="text" prepend-icon="mdi-arrow-left" class="mb-3" :disabled="saving" @click="back">{{
            t('channelAuthorization.back')
          }}</VBtn>
          <VForm id="channel-authorization-form" @submit.prevent="save">
            <VRow>
              <VCol cols="12"
                ><VSelect
                  v-if="!selected"
                  v-model="form.notificationId"
                  :items="enabledChannels"
                  :label="t('channelAuthorization.channel')"
                  :disabled="saving" /><VTextField
                  v-else
                  :model-value="`${selected.source} · ${selected.channel}`"
                  :label="t('channelAuthorization.channel')"
                  readonly
              /></VCol>
              <VCol cols="12" md="6"
                ><VTextField
                  v-model="form.senderId"
                  :mobile-layout="false"
                  :label="t('channelAuthorization.senderId')"
                  :hint="!selected ? t('channelAuthorization.senderHint') : undefined"
                  :persistent-hint="!selected"
                  :readonly="!!selected"
                  :disabled="saving"
              /></VCol>
              <VCol cols="12" md="6"
                ><VTextField
                  v-model="form.displayName"
                  :label="t('channelAuthorization.displayName')"
                  :readonly="!!selected"
                  :disabled="saving"
              /></VCol>
              <VCol cols="12"
                ><VSelect
                  v-model="form.role"
                  :items="roleOptions"
                  :label="t('channelAuthorization.role')"
                  :disabled="saving"
              /></VCol>
              <VCol cols="12" class="pt-0">
                <div class="text-subtitle-2 mb-1">{{ t('channelAuthorization.capabilities') }}</div>
                <div class="authorization-scopes">
                  <VCheckbox
                    v-for="scope in CHANNEL_SCOPES"
                    :mobile-layout="false"
                    :key="scope"
                    :model-value="form.role === 'admin' ? CHANNEL_SCOPES : form.scopes"
                    :value="scope"
                    :label="t(`channelAuthorization.scopes.${scope}`)"
                    :disabled="saving || form.role === 'admin'"
                    hide-details
                    @update:model-value="form.scopes = $event as ChannelScope[]"
                  />
                </div>
              </VCol>
              <VCol v-if="form.role === 'admin'" cols="12" class="pt-0"
                ><VAlert type="info" variant="tonal">{{ t('channelAuthorization.adminHint') }}</VAlert
                ><VCheckbox
                  v-if="needsAdminConfirmation"
                  v-model="adminConfirmed"
                  :label="t('channelAuthorization.confirmAdmin')"
                  :disabled="saving"
                  hide-details
              /></VCol>
              <VCol v-if="selected && !selected.channel_enabled" cols="12"
                ><VAlert type="warning" variant="tonal">{{ t('channelAuthorization.channelDisabled') }}</VAlert></VCol
              >
            </VRow>
          </VForm>
        </template>
        <template v-else>
          <VTabs v-model="tab" color="primary" class="mb-4"
            ><VTab v-for="status in ['pending', 'approved', 'inactive'] as const" :key="status" :value="status"
              >{{ t(`channelAuthorization.tabs.${status}`) }} ({{ count(status) }})</VTab
            ></VTabs
          >
          <div class="authorization-filters mb-4">
            <VTextField
              v-model="keyword"
              :label="t('channelAuthorization.search')"
              prepend-inner-icon="mdi-magnify"
              clearable
              hide-details
              density="compact"
            /><VSelect
              v-model="channelFilter"
              :items="channelOptions"
              :label="t('channelAuthorization.channel')"
              clearable
              hide-details
              density="compact"
            /><VBtn
              icon="mdi-refresh"
              variant="text"
              :aria-label="t('common.refresh')"
              :loading="loading"
              :disabled="saving"
              @click="load"
            />
          </div>
          <VProgressLinear v-if="loading" indeterminate color="primary" :aria-label="t('common.loading')" />
          <div v-else-if="filteredMembers.length === 0 && !error" class="authorization-empty text-medium-emphasis">
            <VIcon icon="mdi-account-check-outline" size="42" class="mb-3" />
            <div>{{ t('channelAuthorization.empty') }}</div>
            <div v-if="tab === 'pending' && !keyword && !channelFilter" class="text-caption mt-2">
              {{ t('channelAuthorization.applyHint') }}
            </div>
          </div>
          <div v-for="member in filteredMembers" :key="member.id" class="authorization-member">
            <div class="authorization-member-info">
              <div class="d-flex align-center flex-wrap ga-2">
                <span class="text-subtitle-1 font-weight-medium">{{ member.display_name || member.sender_id }}</span
                ><VChip v-if="member.role === 'admin'" color="warning" size="x-small">{{
                  t('channelAuthorization.roles.admin')
                }}</VChip
                ><VChip v-if="member.origin === 'legacy'" size="x-small" variant="tonal">{{
                  t('channelAuthorization.migrated')
                }}</VChip
                ><VChip
                  v-if="['disabled', 'rejected'].includes(member.status)"
                  size="x-small"
                  :color="member.status === 'disabled' ? 'warning' : 'error'"
                  >{{ t(`channelAuthorization.status.${member.status}`) }}</VChip
                >
              </div>
              <div class="text-caption text-medium-emphasis mt-1">{{ member.source }} · {{ member.channel }}</div>
              <div class="authorization-sender text-body-2 mt-1">{{ member.sender_id }}</div>
              <div v-if="member.linked_username" class="text-caption mt-1">
                {{ t('channelAuthorization.linkedAccount', { name: member.linked_username }) }}
              </div>
              <div v-if="!member.channel_enabled" class="text-caption text-warning mt-1">
                {{ t('channelAuthorization.channelDisabled') }}
              </div>
              <div v-if="member.status === 'approved' && member.role === 'member'" class="d-flex flex-wrap ga-1 mt-2">
                <VChip v-for="scope in member.scopes" :key="scope" size="x-small" variant="tonal">{{
                  t(`channelAuthorization.scopes.${scope}`)
                }}</VChip>
              </div>
            </div>
            <div class="authorization-member-actions">
              <VBtn
                v-if="member.status === 'pending'"
                color="primary"
                variant="tonal"
                :disabled="saving"
                :aria-label="`${t('channelAuthorization.review')} ${member.display_name}`"
                @click="edit(member)"
                >{{ t('channelAuthorization.review') }}</VBtn
              >
              <VBtn
                v-else
                color="primary"
                variant="text"
                :disabled="saving"
                :aria-label="`${t(member.status === 'approved' ? 'common.edit' : 'channelAuthorization.restore')} ${member.display_name}`"
                @click="edit(member)"
                >{{ t(member.status === 'approved' ? 'common.edit' : 'channelAuthorization.restore') }}</VBtn
              >
              <VBtn
                v-if="member.status === 'pending'"
                color="error"
                variant="text"
                :disabled="saving"
                :aria-label="`${t('channelAuthorization.reject')} ${member.display_name}`"
                @click="changeStatus(member, 'rejected')"
                >{{ t('channelAuthorization.reject') }}</VBtn
              >
              <VBtn
                v-if="member.status === 'approved'"
                color="warning"
                variant="text"
                :disabled="saving"
                :aria-label="`${t('channelAuthorization.disable')} ${member.display_name}`"
                @click="changeStatus(member, 'disabled')"
                >{{ t('channelAuthorization.disable') }}</VBtn
              >
            </div>
          </div>
        </template>
      </VCardText>
      <VDivider v-if="editing || !nativeChromeActive" />
      <VCardActions
        v-if="editing || !nativeChromeActive"
        class="app-dialog-actions px-4 py-3"
        :class="{ 'justify-start': !editing }"
        ><VBtn
          v-if="!editing"
          variant="text"
          prepend-icon="mdi-account-plus-outline"
          class="authorization-add"
          :disabled="loading || saving || enabledChannels.length === 0"
          @click="edit(null)"
          >{{ t('channelAuthorization.add') }}</VBtn
        ><VSpacer /><template v-if="editing"
          ><VBtn variant="text" :disabled="saving" @click="back">{{ t('common.cancel') }}</VBtn
          ><VBtn
            type="submit"
            form="channel-authorization-form"
            variant="flat"
            color="primary"
            :disabled="!canSave"
            :loading="saving"
            >{{ t(selected?.status === 'approved' ? 'common.save' : 'channelAuthorization.approve') }}</VBtn
          ></template
        ></VCardActions
      >
    </VCard>
  </VDialog>
</template>

<style scoped>
.channel-authorization-dialog {
  display: flex;
  flex-direction: column;
  max-block-size: min(54rem, calc(100dvh - 3rem));
}
.authorization-body {
  overflow-y: auto;
  min-block-size: 14rem;
}
.app-dialog-actions > .v-btn.authorization-add {
  flex: 0 0 auto;
}
.authorization-filters {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
  align-items: center;
}
.authorization-filters > :not(button) {
  flex: 1 1 12rem;
}
.authorization-member {
  display: flex;
  flex-wrap: wrap;
  gap: 1rem;
  align-items: center;
  padding-block: 1rem;
  border-block-end: 1px solid rgba(var(--v-theme-on-surface), 0.08);
}
.authorization-member:last-child {
  border-block-end: 0;
}
.authorization-member-info {
  flex: 1 1 16rem;
  min-inline-size: 0;
}
.authorization-sender {
  overflow-wrap: anywhere;
  font-family: monospace;
}
.authorization-member-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.25rem;
}
.authorization-scopes {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
}
.authorization-empty {
  padding-block: 3rem;
  text-align: center;
}
@media (width < 960px) {
  .channel-authorization-dialog {
    block-size: 100dvh;
    max-block-size: 100dvh;
  }
}
</style>
