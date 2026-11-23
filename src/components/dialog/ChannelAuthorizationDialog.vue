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
  batchChannelAuthorizations,
  deleteChannelAuthorization,
  type ChannelMemberBatchAction,
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
const selectedIds = ref<string[]>([])
/** 确认框冻结本次选择，避免刷新或筛选悄悄扩大操作范围。 */
const actionDialog = ref<{ action: ChannelMemberBatchAction; members: ChannelMember[]; bulk: boolean } | null>(null)
const actionScopes = ref<ChannelScope[]>([...DEFAULT_CHANNEL_SCOPES])
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

/** 在当前状态页即时匹配身份与渠道信息，不为每次输入请求接口。 */
const filteredMembers = computed(() => {
  const query = (keyword.value || '').trim().toLocaleLowerCase()
  return members.value.filter(member => {
    const statusMatches =
      tab.value === 'inactive' ? ['disabled', 'rejected'].includes(member.status) : member.status === tab.value
    return (
      statusMatches &&
      (!query ||
        `${member.display_name} ${member.sender_id} ${member.linked_username ?? ''} ${member.source} ${member.channel}`
          .toLocaleLowerCase()
          .includes(query))
    )
  })
})
const selectedMembers = computed(() => filteredMembers.value.filter(member => selectedIds.value.includes(member.id)))
const allSelected = computed(
  () => filteredMembers.value.length > 0 && selectedMembers.value.length === filteredMembers.value.length,
)
const batchActions = computed<ChannelMemberBatchAction[]>(() =>
  tab.value === 'pending'
    ? ['approve', 'reject', 'delete']
    : tab.value === 'approved'
      ? ['disable', 'delete']
      : ['delete'],
)

/** 仅选择当前状态和搜索结果内可见的记录，避免隐藏选择误操作。 */
function selectAll(value: boolean) {
  selectedIds.value = value ? filteredMembers.value.map(member => member.id) : []
}
watch([tab, keyword], () => {
  selectedIds.value = []
})

/** 批量操作先确认；单条已授权删除也必须二次确认。 */
function prepareAction(action: ChannelMemberBatchAction, records: ChannelMember[], bulk: boolean) {
  if (saving.value || loading.value || !records.length || records.length > 100) return
  error.value = ''
  const snapshot = records.map(member => ({ ...member, scopes: [...member.scopes] }))
  if (!bulk && action === 'delete' && snapshot[0].status !== 'approved') {
    void performAction(action, snapshot, false, false)
    return
  }
  actionScopes.value = [...DEFAULT_CHANNEL_SCOPES]
  actionDialog.value = { action, members: snapshot, bulk }
}

/** 取消确认时清理错误提示，不应用本次权限草稿。 */
function cancelAction() {
  if (saving.value) return
  actionDialog.value = null
  error.value = ''
}

/** 后台原子提交后才移除或替换列表；失败保留确认框及权限输入。 */
async function performAction(
  action: ChannelMemberBatchAction,
  records: ChannelMember[],
  bulk: boolean,
  confirmed: boolean,
) {
  if (saving.value) return
  const current = generation
  saving.value = true
  error.value = ''
  try {
    if (!bulk && action === 'delete') {
      await deleteChannelAuthorization(records[0], confirmed)
      if (disposed || !visible.value || current !== generation) return
      members.value = members.value.filter(member => member.id !== records[0].id)
    } else {
      const result = await batchChannelAuthorizations({
        action,
        members: records.map(member => ({ id: member.id, expected_updated_at: member.updated_at })),
        ...(action === 'approve' ? { scopes: [...actionScopes.value] } : {}),
        confirm_approved: confirmed,
      })
      if (disposed || !visible.value || current !== generation) return
      const deleted = new Set(result.deleted_ids)
      members.value = members.value.filter(member => !deleted.has(member.id))
      result.members.forEach(acceptSaved)
    }
    selectedIds.value = []
    actionDialog.value = null
  } catch (cause) {
    if (!disposed && current === generation)
      error.value = getApiErrorMessage(cause) ?? t('channelAuthorization.saveFailed')
  } finally {
    if (!disposed) saving.value = false
  }
}

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
  selectedIds.value = []
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
  <VDialog
    v-model="visible"
    :retain-focus="!actionDialog"
    max-width="58rem"
    :fullscreen="!display.mdAndUp.value"
    :persistent="saving"
    scrollable
  >
    <VCard class="channel-authorization-dialog">
      <VCardItem class="py-3" data-native-sheet-actions>
        <template #prepend
          ><VAvatar color="primary" variant="tonal" rounded class="me-2"
            ><VIcon icon="mdi-shield-check-outline" /></VAvatar
        ></template>
        <VCardTitle>{{ t('channelAuthorization.title') }}</VCardTitle>
        <!-- App 将现有业务按钮投影到原生标题栏左上角的操作菜单。 -->
        <template v-if="nativeChromeActive && !editing" #append>
          <VBtn
            variant="text"
            prepend-icon="mdi-shield-check-outline"
            data-native-sheet-action="mdi-shield-check-outline"
            :disabled="loading || saving || enabledChannels.length === 0"
            @click="edit(null)"
            >{{ t('channelAuthorization.add') }}</VBtn
          >
          <VBtn
            variant="text"
            prepend-icon="mdi-refresh"
            data-native-sheet-action="mdi-refresh"
            :aria-label="t('common.refresh')"
            :loading="loading"
            :disabled="loading || saving"
            @click="load"
            >{{ t('common.refresh') }}</VBtn
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
          <VTabs v-model="tab" :disabled="saving" color="primary" class="mb-4"
            ><VTab v-for="status in ['pending', 'approved', 'inactive'] as const" :key="status" :value="status"
              >{{ t(`channelAuthorization.tabs.${status}`) }} ({{ count(status) }})</VTab
            ></VTabs
          >
          <VTextField
            v-model="keyword"
            :disabled="saving"
            :aria-label="t('channelAuthorization.search')"
            :placeholder="t('channelAuthorization.search')"
            prepend-inner-icon="mdi-magnify"
            clearable
            hide-details
            density="compact"
            class="mb-4"
          />
          <div v-if="filteredMembers.length" class="d-flex align-center flex-wrap ga-2 mb-3">
            <VCheckbox
              :model-value="allSelected"
              :indeterminate="selectedMembers.length > 0 && !allSelected"
              :label="t('channelAuthorization.selectAll')"
              :disabled="saving || loading"
              :mobile-layout="false"
              hide-details
              density="compact"
              class="flex-grow-0"
              @update:model-value="value => selectAll(!!value)"
            />
            <span class="text-caption text-medium-emphasis">{{
              t('channelAuthorization.selectedCount', { count: selectedMembers.length })
            }}</span>
            <VSpacer />
            <VMenu>
              <template #activator="{ props: menuProps }">
                <VBtn
                  v-bind="menuProps"
                  variant="tonal"
                  prepend-icon="mdi-checkbox-multiple-marked-outline"
                  :disabled="saving || loading || !selectedMembers.length || selectedMembers.length > 100"
                  >{{ t('channelAuthorization.batch') }}</VBtn
                >
              </template>
              <VList>
                <VListItem
                  v-for="action in batchActions"
                  :key="action"
                  :title="t('channelAuthorization.batchActions.' + action)"
                  @click="prepareAction(action, selectedMembers, true)"
                />
              </VList>
            </VMenu>
            <span v-if="selectedMembers.length > 100" class="text-caption text-warning">{{
              t('channelAuthorization.batchLimit')
            }}</span>
          </div>
          <VProgressLinear v-if="loading" indeterminate color="primary" :aria-label="t('common.loading')" />
          <div v-else-if="filteredMembers.length === 0 && !error" class="authorization-empty text-medium-emphasis">
            <VIcon icon="mdi-account-check-outline" size="42" class="mb-3" />
            <div>{{ t('channelAuthorization.empty') }}</div>
            <div v-if="tab === 'pending' && !keyword" class="text-caption mt-2">
              {{ t('channelAuthorization.applyHint') }}
            </div>
          </div>
          <div v-for="member in filteredMembers" :key="member.id" class="authorization-member">
            <VCheckbox
              v-model="selectedIds"
              :value="member.id"
              :mobile-layout="false"
              :aria-label="t('channelAuthorization.selectMember', { name: member.display_name || member.sender_id })"
              :disabled="saving || loading"
              hide-details
              density="compact"
              class="flex-grow-0"
            />
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
              <VBtn
                icon="mdi-delete-outline"
                variant="text"
                size="small"
                color="error"
                :disabled="saving || loading"
                :aria-label="t('channelAuthorization.delete') + ' ' + (member.display_name || member.sender_id)"
                @click="prepareAction('delete', [member], false)"
              />
            </div>
          </div>
        </template>
      </VCardText>
      <VDivider v-if="editing || !nativeChromeActive" />
      <VCardActions
        v-if="editing || !nativeChromeActive"
        class="app-dialog-actions px-4 py-3"
        :class="{ 'justify-space-between': !editing }"
        ><VBtn
          v-if="!editing"
          variant="text"
          prepend-icon="mdi-shield-check-outline"
          class="authorization-add"
          :disabled="loading || saving || enabledChannels.length === 0"
          @click="edit(null)"
          >{{ t('channelAuthorization.add') }}</VBtn
        ><VSpacer /><VBtn
          v-if="!editing"
          variant="text"
          prepend-icon="mdi-refresh"
          class="authorization-refresh"
          :aria-label="t('common.refresh')"
          :loading="loading"
          :disabled="loading || saving"
          @click="load"
          >{{ t('common.refresh') }}</VBtn
        ><template v-else
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
  <VDialog
    v-if="actionDialog"
    :model-value="true"
    :persistent="saving"
    max-width="36rem"
    scrollable
    @update:model-value="value => !value && !saving && (actionDialog = null)"
  >
    <VCard
      :title="
        actionDialog.bulk
          ? t('channelAuthorization.batchActions.' + actionDialog.action)
          : t('channelAuthorization.confirmDeleteTitle')
      "
    >
      <VCardText class="d-flex flex-column ga-4">
        <VAlert v-if="error" type="error" variant="tonal">{{ error }}</VAlert>
        <div>
          {{
            t('channelAuthorization.batchHint', {
              count: actionDialog.members.length,
              action: actionDialog.bulk
                ? t('channelAuthorization.batchActions.' + actionDialog.action)
                : t('channelAuthorization.delete'),
            })
          }}
        </div>
        <div v-if="!actionDialog.bulk">
          <div class="text-subtitle-2">
            {{ actionDialog.members[0].display_name || actionDialog.members[0].sender_id }}
          </div>
          <div class="text-caption text-medium-emphasis authorization-sender">
            {{ actionDialog.members[0].source }} · {{ actionDialog.members[0].sender_id }}
          </div>
        </div>
        <template v-if="actionDialog.action === 'approve'">
          <div class="text-body-2 text-medium-emphasis">{{ t('channelAuthorization.batchApproveHint') }}</div>
          <div class="text-subtitle-2">{{ t('channelAuthorization.capabilities') }}</div>
          <div class="authorization-scopes">
            <VCheckbox
              v-for="scope in CHANNEL_SCOPES"
              :key="scope"
              v-model="actionScopes"
              :value="scope"
              :mobile-layout="false"
              :disabled="saving"
              :label="t('channelAuthorization.scopes.' + scope)"
              hide-details
            />
          </div>
        </template>
        <template v-if="actionDialog.action === 'delete'">
          <VAlert
            v-if="actionDialog.members.some(member => member.status === 'approved')"
            type="warning"
            variant="tonal"
            >{{ t('channelAuthorization.approvedDeleteWarning') }}</VAlert
          >
          <div class="text-body-2 text-medium-emphasis">{{ t('channelAuthorization.deleteHint') }}</div>
        </template>
      </VCardText>
      <VCardActions class="app-dialog-actions">
        <VSpacer />
        <VBtn variant="text" :disabled="saving" @click="cancelAction">{{ t('common.cancel') }}</VBtn>
        <VBtn
          variant="flat"
          :color="actionDialog.action === 'delete' ? 'error' : 'primary'"
          :loading="saving"
          @click="
            performAction(
              actionDialog.action,
              actionDialog.members,
              actionDialog.bulk,
              actionDialog.action === 'delete' && actionDialog.members.some(member => member.status === 'approved'),
            )
          "
          >{{ t('common.confirm') }}</VBtn
        >
      </VCardActions>
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
.app-dialog-actions > .v-btn:is(.authorization-add, .authorization-refresh) {
  flex: 0 0 auto;
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
