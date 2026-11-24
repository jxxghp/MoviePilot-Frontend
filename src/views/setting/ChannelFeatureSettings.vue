<script setup lang="ts">
import DialogCloseBtn from '@/@core/components/DialogCloseBtn.vue'
import { ApiRequestError, getApiErrorMessage } from '@/api'
import {
  deleteChannelConnection,
  createChannelConnection,
  getChannelConnectionForm,
  getChannelConnectionReferences,
  getChannelSettings,
  rotateChannelCredential,
  reorderChannelCards,
  updateChannelConnection,
  updateInteractionPolicy,
  updateNotificationRoute,
  type AdmissionMode,
  type AdmissionRule,
  type AutoDownloadPreference,
  type ChannelConnection,
  type ChannelConnectionForm,
  type ChannelConnectionReferences,
  type ChannelSettings,
  type InteractionMatch,
  type NotificationRule,
} from '@/api/channelSettings'
import { stripLegacyChannelAuthorization } from '@/api/authorization'
import type { NotificationConf } from '@/api/types'
import ChannelRuleDialog from '@/components/dialog/ChannelRuleDialog.vue'
import ChannelManagementSwitch from '@/components/dialog/ChannelManagementSwitch.vue'
import NotificationRuleDialog from '@/components/dialog/NotificationRuleDialog.vue'
import ChannelInteractionExtension from '@/components/channel-platforms/ChannelInteractionExtension.vue'
import { useDisplay } from 'vuetify'
import { useToast } from 'vue-toastification'
import NotificationChannelCard from '@/components/cards/NotificationChannelCard.vue'
import { useModuleCatalog } from '@/composables/useModuleCatalog'
import { openSharedDialog, type SharedDialogController } from '@/composables/useSharedDialog'
import type { NativeStandaloneMenuBinding } from '@/native/standalone'

const props = defineProps<{
  /** 当前设置归属，决定筛选和保存的资源类型。 */
  feature: 'connection' | 'notification' | 'interaction'
  /** 只有当前显示的标签页加载和更新其界面状态。 */
  active: boolean
  /** 同页共享连接更新后重新读取，保留正在编辑的草稿。 */
  refreshKey?: number
}>()

const emit = defineEmits<{ changed: [] }>()
const { t } = useI18n()
const display = useDisplay()
const toast = useToast()
const { loadModuleCatalog, moduleOptions } = useModuleCatalog()
const providerOptions = moduleOptions('notification')
const AuthorizationDialog = defineAsyncComponent(() => import('@/components/dialog/ChannelAuthorizationDialog.vue'))
const GlobalNotificationSettingsDialog = defineAsyncComponent(
  () => import('@/components/dialog/GlobalNotificationSettingsDialog.vue'),
)
const Draggable = defineAsyncComponent(() => import('vuedraggable').then(module => module.default))
const ProviderDialog = defineAsyncComponent(() => import('@/components/dialog/NotificationChannelInfoDialog.vue'))
const choices = computed(() => {
  const modules = new Map(providerOptions.value.map(item => [item.value, item.title]))
  for (const [value, title] of Object.entries(settings.value?.providers ?? {})) {
    if (!modules.has(value)) modules.set(value, title)
  }
  return [
    ...[...modules].filter(([value]) => value !== 'custom').map(([value, title]) => ({ value, title })),
    { value: 'custom', title: t('setting.system.custom') },
  ]
})
const typeKeys = {
  资源下载: 'resourceDownload',
  整理入库: 'organize',
  订阅: 'subscribe',
  站点: 'site',
  媒体服务器: 'mediaServer',
  手动处理: 'manual',
  插件: 'plugin',
  智能体: 'agent',
  其它: 'other',
}
const messageOptions = computed(() =>
  Object.entries(typeKeys).map(([value, key]) => ({ value, title: t(`notificationSwitch.${key}`) })),
)

type ManagementSection = 'connection' | 'notification' | 'interaction'
const managementSection = ref<ManagementSection>(props.feature)
const orderFeature = computed(() => (props.feature === 'connection' ? 'notification' : props.feature))

const state = ref<'loading' | 'ready' | 'error'>('loading')
const settings = ref<ChannelSettings>()
const selectedId = ref<string>()
const connection = computed(() => settings.value?.connections.find(item => item.id === selectedId.value))
const newConnections = ref<NotificationConf[]>([])
const draftOrder = ref<string[]>()
let orderBaseline: string[] | undefined
const savedCards = computed<NotificationConf[]>(() => {
  const dataset = settings.value
  if (!dataset) return []
  const feature = props.feature
  const resources = feature === 'notification' ? dataset.notifications : dataset.interactions
  const featureStates = new Map(resources.map(item => [item.connection_id, item.enabled]))
  const visible = dataset.connections
    .filter(item => feature === 'connection' || featureStates.has(item.id))
    .map(item => ({
      id: item.id,
      name: item.name,
      type: item.provider,
      config: {},
      enabled:
        item.enabled &&
        item.credential_status !== 'verification_required' &&
        (feature === 'connection' || featureStates.get(item.id) === true),
    }))
  const order = dataset.orders?.[orderFeature.value]
  if (!order) return visible
  const ranks = new Map(order.map((id, index) => [id, index]))
  return visible.sort((first, second) => (ranks.get(first.id) ?? order.length) - (ranks.get(second.id) ?? order.length))
})
const unsortedCards = computed(() => [...savedCards.value, ...newConnections.value])
const cards = computed(() => {
  const visible = [...unsortedCards.value]
  if (!draftOrder.value) return visible
  const ranks = new Map(draftOrder.value.map((id, index) => [id, index]))
  return visible.sort((first, second) => (ranks.get(first.id) ?? ranks.size) - (ranks.get(second.id) ?? ranks.size))
})
const orderChanged = computed(() => cards.value.some((card, index) => card.id !== unsortedCards.value[index]?.id))
const notification = computed(() => settings.value?.notifications.find(item => item.connection_id === selectedId.value))
const interaction = computed(() => settings.value?.interactions.find(item => item.connection_id === selectedId.value))
const notificationEnabled = ref(false)
const interactionEnabled = ref(false)
const enabled = computed({
  get: () => (managementSection.value === 'notification' ? notificationEnabled.value : interactionEnabled.value),
  set: value => {
    if (managementSection.value === 'notification') notificationEnabled.value = value
    else interactionEnabled.value = value
  },
})
const types = ref<string[]>([])
const notificationRules = ref<NotificationRule[]>([])
const notificationRuleEditor = ref(false)
const notificationKinds = computed(() => settings.value?.notification_target_kinds?.[selectedId.value ?? ''] ?? [])
const platformOptions = ref<Record<string, unknown>>({})
const capabilities = computed(() => settings.value?.capabilities?.[selectedId.value ?? ''] ?? {})

function applyNotificationRules(rules: NotificationRule[]) {
  notificationRules.value = rules
  notificationRuleEditor.value = false
}
const admission = ref<AdmissionMode>('manual')
const admissionRules = ref<AdmissionRule[]>([])
const autoDownloadRules = ref<InteractionMatch[]>([])
const autoDownload = ref<AutoDownloadPreference>('off')
const ruleEditor = ref<'admission' | 'download'>()
const allowedModes = computed(() =>
  selectedId.value ? settings.value?.rule_kinds && settings.value.admission_modes?.[selectedId.value] : undefined,
)
const allowedKinds = computed(() => settings.value?.rule_kinds?.[selectedId.value ?? ''] ?? [])
const admissionOptions = computed(() =>
  (['manual', 'manual_rules', 'rules', 'open'] as const).map(value => ({
    value,
    title: t(`channelSettings.admission.${value}`),
    props: { disabled: !allowedModes.value?.includes(value) },
  })),
)
const downloadOptions = computed(() =>
  (['off', 'specified', 'all'] as const).map(value => ({
    value,
    title: t(`channelSettings.autoDownload.${value}`),
    props: { disabled: value === 'specified' && !allowedKinds.value.length },
  })),
)
const hasAdmissionRules = computed(() => admission.value === 'manual_rules' || admission.value === 'rules')
const invalidPolicy = computed(() => !!allowedModes.value && !allowedModes.value.includes(admission.value))

function applyRules(rules: AdmissionRule[]) {
  if (ruleEditor.value === 'admission') admissionRules.value = rules
  if (ruleEditor.value === 'download')
    autoDownloadRules.value = rules.map(({ name, kind, target, enabled }) => ({ name, kind, target, enabled }))
  ruleEditor.value = undefined
}

const providerForm = ref<ChannelConnectionForm>()
const saving = ref(false)
const featureEditor = ref(false)
const connectionEditor = ref(false)
const editorSession = computed(() => featureEditor.value || connectionEditor.value)
const featureTitle = computed(() => t(`channelSettings.${managementSection.value}Title`))
const editorOpen = computed({
  get: () => featureEditor.value || (connectionEditor.value && !providerForm.value),
  set: open => {
    if (!open) {
      featureEditor.value = false
      connectionEditor.value = false
    }
  },
})
const deleteConfirm = ref(false)
const deleteReferences = ref<ChannelConnectionReferences>()
const connectionName = ref('')
const connectionEnabled = ref(false)
const credential = ref('')
const inboundToken = ref('')
let controller: AbortController | undefined
let providerDialog: SharedDialogController | undefined
let providerRequest: AbortController | undefined
const loadingProvider = ref(false)
let generation = 0
let saveGeneration = 0

/** 每次从卡片打开设置时，按对应连接的已保存资源初始化草稿。 */
function resetFeatureDraft() {
  const route = notification.value
  const policy = interaction.value
  notificationEnabled.value = route?.enabled ?? false
  interactionEnabled.value = policy?.enabled ?? false
  types.value = [...(route?.message_types ?? [])]
  notificationRules.value = [...(route?.rules ?? [])]
  platformOptions.value = { ...policy?.platform_options }
  notificationRuleEditor.value = false
  admission.value = policy?.admission ?? 'manual'
  ruleEditor.value = undefined
  admissionRules.value = [...(policy?.admission_rules ?? [])]
  autoDownloadRules.value = [...(policy?.auto_download_rules ?? [])]
  autoDownload.value = policy?.auto_download ?? 'off'
}

watch([notification, interaction], resetFeatureDraft)

watch(featureEditor, open => {
  if (!open) {
    ruleEditor.value = undefined
    notificationRuleEditor.value = false
  }
})

watch(connectionEditor, open => {
  if (open) return
  providerRequest?.abort()
  loadingProvider.value = false
  deleteConfirm.value = false
})

watch(editorSession, open => {
  if (open) return
  credential.value = ''
  inboundToken.value = ''
  providerForm.value = undefined
})

watch([deleteConfirm, connection], ([show, item], _, cleanup) => {
  deleteReferences.value = undefined
  if (!show || !item) return
  const request = new AbortController()
  cleanup(() => request.abort())
  void getChannelConnectionReferences(item, request.signal)
    .then(references => {
      if (!request.signal.aborted) deleteReferences.value = references
    })
    .catch(cause => {
      if (!request.signal.aborted) {
        deleteConfirm.value = false
        toast.error(getApiErrorMessage(cause) ?? t('channelSettings.loadFailed'))
      }
    })
})

/** 页面失活时撤销旧请求和弹窗的界面控制权。 */
function endPageSession() {
  generation += 1
  saveGeneration += 1
  controller?.abort()
  providerRequest?.abort()
  loadingProvider.value = false
  providerDialog?.close()
  providerDialog = undefined
  featureEditor.value = false
  connectionEditor.value = false
  deleteConfirm.value = false
  credential.value = ''
  saving.value = false
  newConnections.value = []
  draftOrder.value = undefined
  orderBaseline = undefined
}

/** 取消旧读取并丢弃切换标签前返回的响应。 */
async function reload() {
  controller?.abort()
  const request = new AbortController()
  controller = request
  const current = ++generation
  state.value = 'loading'
  try {
    const data = await getChannelSettings(request.signal)
    if (current !== generation) return
    settings.value = data
    if (!cards.value.some(item => item.id === selectedId.value)) {
      selectedId.value = undefined
      featureEditor.value = false
      connectionEditor.value = false
    }
    state.value = 'ready'
  } catch (cause) {
    if (current !== generation) return
    state.value = 'error'
    toast.error(getApiErrorMessage(cause) ?? t('channelSettings.loadFailed'))
  }
}

watch(
  () => props.active,
  active => {
    if (active) {
      void reload()
      void loadModuleCatalog()
    } else {
      endPageSession()
    }
  },
  { immediate: true },
)
const appliedRefresh = ref(props.refreshKey)
watch(
  () => [
    props.refreshKey,
    props.active,
    saving.value,
    editorSession.value,
    newConnections.value.length,
    orderChanged.value,
  ],
  () => {
    if (
      !props.active ||
      saving.value ||
      editorSession.value ||
      newConnections.value.length ||
      orderChanged.value ||
      appliedRefresh.value === props.refreshKey
    )
      return
    appliedRefresh.value = props.refreshKey
    void reload()
  },
)
onBeforeUnmount(endPageSession)

/** 使用页面内的独立资源版本保存，并向用户显示冲突。 */
async function runSave(save: () => Promise<unknown>, current: number, credentialRotation = false) {
  if (saving.value) return
  const currentSave = ++saveGeneration
  let committed = false
  saving.value = true
  try {
    await save()
    if (current !== generation) return
    featureEditor.value = false
    connectionEditor.value = false
    deleteConfirm.value = false
    await reload()
    committed = state.value === 'ready'
    if (currentSave === saveGeneration && props.active && state.value === 'ready')
      toast.success(t('channelSettings.saved'))
  } catch (cause) {
    if (current === generation) {
      const failedCredential =
        cause instanceof ApiRequestError
          ? (cause.payload as { data?: Pick<ChannelConnection, 'credential_status'> } | undefined)?.data
          : undefined
      if (credentialRotation && failedCredential?.credential_status === 'verification_required') {
        connectionEditor.value = false
        await reload()
        if (currentSave === saveGeneration && props.active) toast.error(t('channelSettings.credentialPaused'))
        return
      }
      if (!credentialRotation && cause instanceof ApiRequestError && cause.status === 409) {
        featureEditor.value = false
        connectionEditor.value = false
        deleteConfirm.value = false
        draftOrder.value = undefined
        orderBaseline = undefined
        toast.error(t('channelSettings.conflict'))
        await reload()
      } else {
        toast.error(getApiErrorMessage(cause) ?? t('channelSettings.saveFailed'))
      }
    }
  } finally {
    if (currentSave === saveGeneration) saving.value = false
    if (committed && currentSave === saveGeneration && props.active) emit('changed')
  }
}

/** 卡片上的拖动只更新当前页草稿。 */
function stageCardOrder(items: NotificationConf[]) {
  if (saving.value) return
  orderBaseline ??= savedCards.value.map(card => card.id)
  draftOrder.value = items.map(card => card.id)
  if (!orderChanged.value) {
    orderBaseline = undefined
    draftOrder.value = undefined
  }
}

/** 新建成功后立即替换草稿 ID，后续保存失败时重试不会重复创建。 */
async function saveCards() {
  const expected = [...(orderBaseline ?? savedCards.value.map(card => card.id))]
  const order = cards.value.map(card => card.id)
  const feature = orderFeature.value
  const current = generation
  let createdAny = false
  let failed = false
  await runSave(async () => {
    try {
      for (const draft of [...newConnections.value]) {
        const created = await createChannelConnection(
          draft.name,
          draft.type,
          stripLegacyChannelAuthorization(draft.config),
        )
        if (generation !== current) return
        createdAny = true
        newConnections.value = newConnections.value.filter(item => item.id !== draft.id)
        expected.push(created.id)
        orderBaseline?.push(created.id)
        order.splice(order.indexOf(draft.id), 1, created.id)
        if (draftOrder.value) draftOrder.value = draftOrder.value.map(id => (id === draft.id ? created.id : id))
      }
      if (settings.value?.orders && order.some((id, index) => id !== expected[index])) {
        await reorderChannelCards(feature, order, expected)
      }
      if (generation === current) {
        draftOrder.value = undefined
        orderBaseline = undefined
      }
    } catch (error) {
      failed = true
      throw error
    }
  }, current)
  if (createdAny && failed && props.active && current === generation) await reload()
}

function saveFeature() {
  const route = notification.value
  const policy = interaction.value
  const selectedEnabled = enabled.value
  const selectedTypes = [...types.value]
  if (managementSection.value === 'notification' && route)
    void runSave(
      () =>
        notificationKinds.value.length
          ? updateNotificationRoute(route, selectedEnabled, selectedTypes, notificationRules.value)
          : updateNotificationRoute(route, selectedEnabled, selectedTypes),
      generation,
    )
  if (managementSection.value === 'interaction' && policy && !invalidPolicy.value) {
    const options = allowedModes.value
      ? {
          admission: admission.value,
          platform_options: { ...platformOptions.value },
          admission_rules: hasAdmissionRules.value ? admissionRules.value : [],
          auto_download: autoDownload.value,
          auto_download_rules: autoDownload.value === 'specified' ? autoDownloadRules.value : [],
        }
      : undefined
    void runSave(
      () =>
        options
          ? updateInteractionPolicy(policy, selectedEnabled, options)
          : updateInteractionPolicy(policy, selectedEnabled),
      generation,
    )
  }
}

function editFeature(id: string, section: ManagementSection = props.feature) {
  const draft = newConnections.value.find(item => item.id === id)
  if (draft) {
    editNewConnection(draft)
    return
  }
  selectedId.value = id
  resetFeatureDraft()
  switchManagement(section)
}

/** 相同连接在三个管理页面间切换时保留各自草稿。 */
function switchManagement(section: ManagementSection) {
  if (!connection.value || saving.value) return
  if (section === 'notification' && !notification.value) return
  if (section === 'interaction' && !interaction.value) return
  managementSection.value = section
  if (section === 'connection') {
    editConnection(connection.value)
  } else {
    featureEditor.value = true
    connectionEditor.value = false
  }
}

/** 菜单只包含已经保存且支持相应用途的连接功能。 */
function cardManagementOptions(id: string) {
  return [
    { value: 'connection' as const, title: t('channelSettings.configurationTitle'), icon: 'mdi-cog-outline' },
    ...(settings.value?.notifications.some(item => item.connection_id === id)
      ? [{ value: 'notification' as const, title: t('channelSettings.notificationTitle'), icon: 'mdi-bell-outline' }]
      : []),
    ...(settings.value?.interactions.some(item => item.connection_id === id)
      ? [{ value: 'interaction' as const, title: t('channelSettings.interactionTitle'), icon: 'mdi-robot-outline' }]
      : []),
  ]
}

/** 在同一次编辑会话内切换，功能与连接两边的草稿都可继续编辑。 */
function editConnection(item: ChannelConnection) {
  managementSection.value = 'connection'
  if (!connectionEditor.value && !providerForm.value) {
    connectionName.value = item.name
    connectionEnabled.value = item.enabled
  }
  featureEditor.value = false
  connectionEditor.value = true
  if (settings.value?.can_edit_provider_config && !providerForm.value) void loadProviderForm(item)
}

/** 移除未保存的草稿，已保存连接使用带影响范围的确认框。 */
function requestConnectionRemoval(id: string) {
  if (saving.value) return
  if (newConnections.value.some(item => item.id === id)) {
    newConnections.value = newConnections.value.filter(item => item.id !== id)
    return
  }
  if (!settings.value?.can_delete_connections) return
  selectedId.value = id
  deleteConfirm.value = true
}

/** 确认时提交已显示的配置版本，另一页有更新时先重新读取。 */
function deleteConnection() {
  const item = connection.value
  if (!item || !deleteConfirm.value || !deleteReferences.value) return
  const route = notification.value
  const policy = interaction.value
  void runSave(() => deleteChannelConnection(item, route, policy), generation)
}

function saveConnection() {
  saveProviderConnection()
}

function saveProviderConnection(value?: NotificationConf) {
  const item = connection.value
  if (!item || !(value?.name ?? connectionName.value).trim()) return
  const name = (value?.name ?? connectionName.value).trim()
  const available = connectionEnabled.value
  const token = inboundToken.value.trim() || undefined
  if (token && token.length < 32) {
    toast.error(t('channelSettings.inboundTokenHint'))
    return
  }
  const form = providerForm.value
  const patch =
    value && form
      ? Object.fromEntries(Object.entries(value.config ?? {}).filter(([key]) => form.editable_fields.includes(key)))
      : undefined
  void runSave(
    () => updateChannelConnection(form ? { ...item, revision: form.revision } : item, name, available, token, patch),
    generation,
  )
}

/** 轮换只保存凭据，名称和开关由原有保存按钮管理。 */
function saveCredential() {
  const item = connection.value
  const secret = credential.value.trim()
  if (!item?.can_rotate_credential || !secret || saving.value) return
  credential.value = ''
  void runSave(() => rotateChannelCredential(item, secret), generation, true)
}

/** 按下载器设置页的流程先新增卡片，点卡片编辑草稿。 */
function addConnection(provider: string, title: string) {
  const names = new Set(
    [...(settings.value?.connections ?? []), ...newConnections.value].map(item => item.name.toLowerCase()),
  )
  let sequence = 1
  while (names.has(`${title} ${sequence}`.toLowerCase())) sequence += 1
  const id = globalThis.crypto?.randomUUID?.() ?? `notification-${Date.now()}-${Math.random().toString(16).slice(2)}`
  newConnections.value.push({ id, name: `${title} ${sequence}`, type: provider, config: {}, enabled: false })
}

function editNewConnection(draft: NotificationConf) {
  const current = generation
  const names = [
    ...(settings.value?.connections ?? []).map(item => ({
      id: item.id,
      name: item.name,
      type: item.provider,
      config: {},
      enabled: item.enabled,
    })),
    ...newConnections.value,
  ]
  providerDialog?.close()
  providerDialog = openSharedDialog(
    ProviderDialog,
    {
      notification: draft,
      notifications: names,
      connectionOnly: true,
      removableDraft: true,
    },
    {
      change: (value: NotificationConf) => {
        if (generation !== current || !props.active) return
        newConnections.value = newConnections.value.map(item => (item.id === draft.id ? value : item))
      },
      remove: () => {
        newConnections.value = newConnections.value.filter(item => item.id !== draft.id)
        if (draftOrder.value) draftOrder.value = draftOrder.value.filter(id => id !== draft.id)
        providerDialog?.close()
      },
    },
  )
}

async function loadProviderForm(item: ChannelConnection) {
  providerRequest?.abort()
  const request = new AbortController()
  providerRequest = request
  loadingProvider.value = true
  const current = generation
  try {
    const form = await getChannelConnectionForm(item, request.signal)
    if (request.signal.aborted || current !== generation || selectedId.value !== item.id || !connectionEditor.value)
      return
    if (form.revision !== item.revision) {
      toast.error(t('channelSettings.conflict'))
      connectionEditor.value = false
      await reload()
      return
    }
    providerForm.value = form
  } catch (cause) {
    if (!request.signal.aborted && current === generation && connectionEditor.value) {
      toast.error(getApiErrorMessage(cause) ?? t('channelSettings.loadFailed'))
      connectionEditor.value = false
    }
  } finally {
    if (providerRequest === request) loadingProvider.value = false
  }
}

/** 扫码凭据绑定已保存的稳定连接，重新打开也能读取原登录状态。 */
function openPlatformLogin(item: ChannelConnection) {
  connectionEditor.value = false
  providerDialog?.close()
  providerDialog = openSharedDialog(ProviderDialog, {
    notification: { id: item.id, name: item.name, type: item.provider, config: {}, enabled: item.enabled },
    notifications: [],
    loginManagement: true,
  })
}

/** 与其他设置页共用添加菜单，允许新建多个同类型连接。 */
const nativeAddMenu = computed<NativeStandaloneMenuBinding>(() => ({
  key: `add-channel-${props.feature}`,
  title: t('channelSettings.create'),
  items: action =>
    choices.value.map(item =>
      action(item.value, { title: item.title, invoke: () => addConnection(item.value, item.title) }),
    ),
}))
</script>

<template>
  <VRow>
    <VCol cols="12">
      <VCard>
        <VCardItem>
          <VCardTitle>{{ t(`channelSettings.${feature}Title`) }}</VCardTitle>
          <VCardSubtitle class="text-wrap">{{ t(`channelSettings.${feature}Description`) }}</VCardSubtitle>
        </VCardItem>
        <VProgressLinear v-if="state === 'loading'" indeterminate />
        <VCardText v-else>
          <VBtn v-if="state === 'error'" variant="text" :disabled="saving" @click="reload">
            {{ t('channelSettings.reload') }}
          </VBtn>
          <template v-if="state === 'ready'">
            <Draggable
              v-if="cards.length"
              :model-value="cards"
              item-key="id"
              handle=".channel-card-drag"
              :disabled="saving || !settings?.orders || cards.length < 2"
              :component-data="{ class: 'grid gap-3 grid-app-card' }"
              @update:model-value="stageCardOrder"
            >
              <template #item="{ element: card }">
                <div class="position-relative">
                  <NotificationChannelCard
                    class="h-100 w-100"
                    :notification="card"
                    :notifications="cards"
                    :disabled="saving"
                    :sortable="!!settings?.orders"
                    :has-outer-action="feature === 'connection'"
                    managed
                    @edit="editFeature(card.id)"
                  />
                  <DialogCloseBtn
                    v-if="
                      feature === 'connection' &&
                      (settings?.can_delete_connections || newConnections.some(item => item.id === card.id))
                    "
                    inner-class="absolute top-3 right-3 mp-setting-card__action mp-setting-card__action--danger"
                    :aria-label="t('channelSettings.removeConnectionCard', { name: card.name })"
                    :title="t('channelSettings.removeConnectionCard', { name: card.name })"
                    :disabled="saving"
                    @click="requestConnectionRemoval(card.id)"
                  />
                  <span
                    v-if="settings?.orders"
                    class="app-card-top-action absolute top-3"
                    style="inset-inline-end: 2.625rem"
                  >
                    <IconBtn
                      class="mp-setting-card__action"
                      :aria-label="t('channelSettings.dragCard')"
                      :title="t('channelSettings.dragCard')"
                      :disabled="saving || cards.length < 2"
                      @click.stop
                    >
                      <VIcon class="channel-card-drag cursor-move" icon="mdi-drag" />
                    </IconBtn>
                  </span>
                  <span
                    v-if="feature === 'connection' && !newConnections.some(item => item.id === card.id)"
                    class="app-card-top-action absolute top-3"
                    style="inset-inline-end: 4.5rem"
                  >
                    <IconBtn
                      class="mp-setting-card__action"
                      :aria-label="t('channelSettings.moreActions', { name: card.name })"
                      :title="t('channelSettings.moreActions', { name: card.name })"
                      :disabled="saving"
                      @click.stop
                    >
                      <VIcon icon="mdi-dots-vertical" />
                      <VMenu activator="parent">
                        <VList>
                          <VListItem
                            v-for="item in cardManagementOptions(card.id)"
                            :key="item.value"
                            :title="item.title"
                            :prepend-icon="item.icon"
                            @click="editFeature(card.id, item.value)"
                          />
                        </VList>
                      </VMenu>
                    </IconBtn>
                  </span>
                </div>
              </template>
            </Draggable>
            <p v-else class="mb-0 text-medium-emphasis">{{ t('channelSettings.noConnections') }}</p>
          </template>
        </VCardText>
        <VCardText v-if="state === 'ready'">
          <VForm @submit.prevent="saveCards">
            <div class="d-flex flex-wrap gap-4 mt-4">
              <VBtn
                v-if="feature === 'connection' || settings?.orders"
                type="submit"
                prepend-icon="mdi-content-save"
                :loading="saving"
                :disabled="saving || (!newConnections.length && !orderChanged)"
              >
                {{ t('common.save') }}
              </VBtn>
              <VBtn
                v-if="feature === 'connection'"
                color="success"
                variant="tonal"
                :aria-label="t('channelSettings.create')"
                :disabled="saving"
              >
                <VIcon icon="mdi-plus" />
                <VMenu activator="parent" close-on-content-click :native-menu="nativeAddMenu">
                  <VList>
                    <VListItem
                      v-for="choice in choices"
                      :key="choice.value"
                      :title="choice.title"
                      @click="addConnection(choice.value, choice.title)"
                    />
                  </VList>
                </VMenu>
              </VBtn>
              <VSpacer v-if="feature === 'connection'" />
              <VBtn
                v-if="feature === 'connection'"
                color="secondary"
                variant="tonal"
                prepend-icon="mdi-bell-cog-outline"
                @click="openSharedDialog(GlobalNotificationSettingsDialog)"
              >
                {{ t('channelSettings.globalNotifications') }}
              </VBtn>
              <VBtn
                v-if="feature === 'connection'"
                color="info"
                variant="tonal"
                prepend-icon="mdi-shield-account-outline"
                @click="openSharedDialog(AuthorizationDialog)"
              >
                {{ t('channelAuthorization.title') }}
              </VBtn>
            </div>
          </VForm>
        </VCardText>
      </VCard>
    </VCol>
  </VRow>

  <VDialog
    v-model="editorOpen"
    :persistent="saving"
    :retain-focus="!notificationRuleEditor && !ruleEditor"
    :transition="false"
    max-width="40rem"
    scrollable
    :fullscreen="!display.mdAndUp.value"
  >
    <VCard v-if="featureEditor && connection">
      <VCardItem class="py-2">
        <template #prepend>
          <VIcon :icon="managementSection === 'notification' ? 'mdi-bell-outline' : 'mdi-robot-outline'" class="me-2" />
        </template>
        <VCardTitle>{{ featureTitle }}</VCardTitle>
        <VCardSubtitle>{{ connection.name }}</VCardSubtitle>
        <template v-if="!saving" #append>
          <div class="d-flex align-center ga-1">
            <ChannelManagementSwitch
              :current="managementSection"
              :notification="!!notification"
              :interaction="!!interaction"
              :disabled="saving"
              @select="switchManagement"
            />
            <DialogCloseBtn v-model="editorOpen" inner-class="position-relative" />
          </div>
        </template>
      </VCardItem>
      <VDivider />
      <VCardText>
        <VAlert v-if="!connection.enabled" type="info" variant="tonal" class="mb-3">
          {{ t('channelSettings.connectionOff') }}
        </VAlert>
        <VAlert
          v-if="connection.credential_status === 'verification_required'"
          type="warning"
          variant="tonal"
          class="mb-3"
        >
          {{ t('channelSettings.credentialPaused') }}
        </VAlert>
        <VForm class="pt-3">
          <VRow>
            <VCol cols="12">
              <VSwitch
                v-model="enabled"
                :label="t(`channelSettings.${managementSection}Enabled`)"
                :disabled="saving"
                hide-details
              />
            </VCol>
            <VCol v-if="managementSection === 'notification'" cols="12">
              <VBtn
                v-if="notificationKinds.length"
                variant="tonal"
                prepend-icon="mdi-tune-variant"
                @click="notificationRuleEditor = true"
              >
                {{ t('channelSettings.deliveryRules.title') }} ({{ notificationRules.length }})
              </VBtn>
              <VSelect
                v-else
                v-model="types"
                :items="messageOptions"
                :label="t('setting.notification.messageType')"
                :disabled="saving"
                prepend-inner-icon="mdi-bell-ring-outline"
                multiple
                chips
              />
            </VCol>
            <template v-else-if="allowedModes">
              <VCol v-if="capabilities.interaction_form" cols="12">
                <ChannelInteractionExtension
                  v-model="platformOptions"
                  :extension="capabilities.interaction_form"
                  :disabled="saving"
                />
              </VCol>
              <VCol cols="12" md="6" class="d-flex flex-column align-self-start ga-3">
                <VSelect
                  id="channel-admission-mode"
                  class="flex-grow-0"
                  v-model="admission"
                  :items="admissionOptions"
                  :label="t('channelSettings.admissionLabel')"
                  :disabled="saving"
                  prepend-inner-icon="mdi-shield-account-outline"
                  :hint="allowedKinds.length ? undefined : t('channelSettings.rulesUnavailable')"
                  :persistent-hint="!allowedKinds.length"
                />
                <VBtn
                  v-if="hasAdmissionRules"
                  class="align-self-start"
                  variant="tonal"
                  size="small"
                  prepend-icon="mdi-pencil-outline"
                  :disabled="saving"
                  :aria-label="t('channelSettings.editAdmissionRules')"
                  @click="ruleEditor = 'admission'"
                >
                  {{ t('channelSettings.editRules') }} ({{ admissionRules.length }})
                </VBtn>
              </VCol>
              <VCol cols="12" md="6" class="d-flex flex-column align-self-start ga-3">
                <VSelect
                  id="channel-auto-download"
                  class="flex-grow-0"
                  v-model="autoDownload"
                  :items="downloadOptions"
                  :label="t('channelSettings.autoDownloadLabel')"
                  :hint="t('channelSettings.autoDownloadHint')"
                  :disabled="saving"
                  prepend-inner-icon="mdi-download-outline"
                  persistent-hint
                />
                <VBtn
                  v-if="autoDownload === 'specified'"
                  class="align-self-start"
                  variant="tonal"
                  size="small"
                  prepend-icon="mdi-pencil-outline"
                  :disabled="saving"
                  :aria-label="t('channelSettings.editDownloadRules')"
                  @click="ruleEditor = 'download'"
                >
                  {{ t('channelSettings.editRules') }} ({{ autoDownloadRules.length }})
                </VBtn>
              </VCol>
              <VCol v-if="admission === 'open'" cols="12">
                <VAlert type="warning" variant="tonal" role="alert">{{ t('channelSettings.openWarning') }}</VAlert>
              </VCol>
              <VCol v-if="invalidPolicy" cols="12">
                <VAlert type="info" variant="tonal">{{ t('channelSettings.incompletePolicy') }}</VAlert>
              </VCol>
            </template>
            <VCol v-else-if="interaction" cols="12">
              <p class="mb-0">{{ t(`channelSettings.admission.${interaction.admission}`) }}</p>
            </VCol>
          </VRow>
        </VForm>
      </VCardText>
      <VDivider />
      <VCardActions class="app-dialog-actions">
        <VSpacer />
        <VBtn variant="text" :disabled="saving" @click="featureEditor = false">{{ t('common.cancel') }}</VBtn>
        <VBtn
          color="primary"
          variant="flat"
          prepend-icon="mdi-content-save"
          :loading="saving"
          :disabled="state !== 'ready' || (managementSection === 'interaction' && invalidPolicy)"
          @click="saveFeature"
          >{{ t('common.save') }}</VBtn
        >
      </VCardActions>
    </VCard>
    <VCard v-else-if="connectionEditor && connection">
      <VCardItem class="py-2">
        <template #prepend><VIcon icon="mdi-cog-outline" class="me-2" /></template>
        <VCardTitle>{{ t('channelSettings.configurationTitle') }}</VCardTitle>
        <VCardSubtitle>{{ connection.name }}</VCardSubtitle>
        <template v-if="!saving" #append>
          <div class="d-flex align-center ga-1">
            <ChannelManagementSwitch
              :current="managementSection"
              :notification="!!notification"
              :interaction="!!interaction"
              :disabled="saving"
              @select="switchManagement"
            />
            <DialogCloseBtn v-model="editorOpen" inner-class="position-relative" />
          </div>
        </template>
      </VCardItem>
      <VDivider />
      <VProgressLinear v-if="loadingProvider" indeterminate />
      <VCardText v-else>
        <VTextField v-model="connectionName" :label="t('channelSettings.connectionName')" />
        <VSwitch v-model="connectionEnabled" :label="t('channelSettings.connectionEnabled')" />
        <VTextField
          v-if="connection.can_rotate_credential"
          v-model="credential"
          type="password"
          autocomplete="new-password"
          :label="t('channelSettings.newCredential')"
        />
        <VBtn
          v-if="connection.can_rotate_credential"
          variant="tonal"
          :disabled="saving || !credential.trim()"
          @click="saveCredential"
        >
          {{ t('channelSettings.rotateCredential') }}
        </VBtn>
      </VCardText>
      <VCardActions v-if="!loadingProvider" class="app-dialog-actions">
        <VSpacer />
        <VBtn color="primary" variant="flat" prepend-icon="mdi-content-save" :loading="saving" @click="saveConnection">
          {{ t('common.save') }}
        </VBtn>
      </VCardActions>
    </VCard>
  </VDialog>

  <ProviderDialog
    v-if="editorSession && providerForm && connection"
    :model-value="connectionEditor"
    :notification="{
      id: connection.id,
      name: connection.name,
      type: connection.provider,
      config: providerForm.values,
      enabled: connection.enabled,
    }"
    :notifications="cards"
    :editable-connection-fields="providerForm.editable_fields"
    :suspend-focus="deleteConfirm"
    :saving="saving"
    connection-only
    managed-submit
    @change="saveProviderConnection"
    @close="connectionEditor = false"
  >
    <template #header-actions>
      <IconBtn
        v-if="feature === 'connection' && settings?.can_delete_connections"
        :aria-label="t('common.delete')"
        :title="t('channelSettings.deleteTitle')"
        @click="deleteConfirm = true"
      >
        <VIcon icon="mdi-delete-outline" />
      </IconBtn>
      <ChannelManagementSwitch
        :current="managementSection"
        :notification="!!notification"
        :interaction="!!interaction"
        :disabled="saving"
        @select="switchManagement"
      />
    </template>
    <template #connection-fields>
      <VSwitch
        v-model="connectionEnabled"
        class="mb-5"
        :label="t('channelSettings.connectionEnabled')"
        :hint="t('channelSettings.connectionScope')"
        :disabled="saving"
        persistent-hint
      />
    </template>
    <template #connection-actions>
      <VTextField
        v-if="capabilities.inbound_token"
        v-model="inboundToken"
        class="mt-4"
        type="password"
        autocomplete="new-password"
        :label="t('channelSettings.inboundToken')"
        :hint="
          t(
            connection.inbound_token_configured
              ? 'channelSettings.inboundTokenSet'
              : 'channelSettings.inboundTokenHint',
          )
        "
        :disabled="saving"
        maxlength="256"
        persistent-hint
      />
      <VBtn
        v-if="capabilities.login_management"
        class="mt-4"
        variant="tonal"
        :disabled="saving"
        @click="openPlatformLogin(connection)"
      >
        {{ t('channelSettings.loginStatus') }}
      </VBtn>
      <div v-if="connection.can_rotate_credential" class="mt-4">
        <VTextField
          v-model="credential"
          type="password"
          autocomplete="new-password"
          :label="t(capabilities.credential_label ?? 'channelSettings.newCredential')"
          :disabled="saving"
        />
        <VBtn variant="tonal" :disabled="saving || !credential.trim()" @click="saveCredential">
          {{ t(capabilities.credential_action ?? 'channelSettings.rotateCredential') }}
        </VBtn>
      </div>
    </template>
  </ProviderDialog>

  <VDialog v-if="deleteConfirm" v-model="deleteConfirm" :persistent="saving" max-width="40rem" scrollable>
    <VCard :title="t('channelSettings.deleteTitle')">
      <DialogCloseBtn v-if="!saving" v-model="deleteConfirm" />
      <VDivider />
      <VCardText>
        <p>{{ t('channelSettings.deleteDescription', { name: connection?.name }) }}</p>
        <ul class="ps-5">
          <li v-if="notification">{{ t('channelSettings.deleteNotification') }}</li>
          <li v-if="interaction">{{ t('channelSettings.deleteInteraction') }}</li>
          <li v-if="deleteReferences && interaction">
            {{
              t('channelSettings.deleteReferences', {
                members: deleteReferences.member_count,
                tasks: deleteReferences.task_count,
              })
            }}
          </li>
        </ul>
        <VProgressLinear v-if="!deleteReferences" indeterminate class="mt-3" />
      </VCardText>
      <VCardActions class="app-dialog-actions">
        <VSpacer />
        <VBtn variant="text" :disabled="saving" @click="deleteConfirm = false">{{ t('common.cancel') }}</VBtn>
        <VBtn color="error" variant="flat" :loading="saving" :disabled="!deleteReferences" @click="deleteConnection">
          {{ t('channelSettings.deleteTitle') }}
        </VBtn>
      </VCardActions>
    </VCard>
  </VDialog>

  <NotificationRuleDialog
    v-if="notificationRuleEditor && connection"
    :provider="connection.provider"
    :capabilities="capabilities"
    :kinds="notificationKinds"
    :message-options="messageOptions"
    :rules="notificationRules"
    @close="notificationRuleEditor = false"
    @apply="applyNotificationRules"
  />

  <ChannelRuleDialog
    v-if="ruleEditor && connection"
    :key="ruleEditor"
    :purpose="ruleEditor"
    :provider="connection.provider"
    :capabilities="capabilities"
    :kinds="allowedKinds"
    :rules="ruleEditor === 'admission' ? admissionRules : autoDownloadRules"
    @close="ruleEditor = undefined"
    @apply="applyRules"
  />
</template>

<style scoped>
.channel-card-drag {
  cursor: grab;
  touch-action: none;
}
</style>
