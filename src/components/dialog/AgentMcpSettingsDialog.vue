<script lang="ts" setup>
import { useToast } from 'vue-toastification'
import api from '@/api'
import { useDisplay } from 'vuetify'
import { useI18n } from 'vue-i18n'

type AgentMcpTransport = 'stdio' | 'sse' | 'http' | 'streamable_http'

interface AgentMcpServer {
  id: string
  name: string
  enabled: boolean
  transport: AgentMcpTransport
  description?: string | null
  command?: string | null
  args: string[]
  env: Record<string, string>
  url?: string | null
  headers: Record<string, string>
  timeout: number
  tool_prefix?: string | null
  require_admin: boolean
}

interface EditableAgentMcpServer extends AgentMcpServer {
  argsText: string
  envText: string
  headersText: string
}

interface AgentMcpToolInfo {
  name: string
  agent_tool_name: string
  description?: string
}

interface AgentMcpTestState {
  loading: boolean
  success?: boolean
  message?: string
  tools?: AgentMcpToolInfo[]
}

const props = defineProps<{
  modelValue: boolean
  servers: AgentMcpServer[]
}>()

const emit = defineEmits<{
  (event: 'update:modelValue', value: boolean): void
  (event: 'saved', value: AgentMcpServer[]): void
}>()

const { t } = useI18n()
const toast = useToast()
const display = useDisplay()

const saving = ref(false)
const localServers = ref<EditableAgentMcpServer[]>([])
const testStates = ref<Record<string, AgentMcpTestState>>({})

const dialogVisible = computed({
  get: () => props.modelValue,
  set: value => emit('update:modelValue', value),
})

const transportItems = computed(() => [
  { title: t('setting.system.aiAgentMcpTransportStdio'), value: 'stdio' },
  { title: t('setting.system.aiAgentMcpTransportSse'), value: 'sse' },
  { title: t('setting.system.aiAgentMcpTransportHttp'), value: 'http' },
])

function createServerId() {
  return `mcp-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

function dictToLines(value?: Record<string, string>) {
  return Object.entries(value || {})
    .map(([key, item]) => `${key}=${item}`)
    .join('\n')
}

function linesToDict(value: string) {
  return String(value || '')
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
    .reduce<Record<string, string>>((result, line) => {
      const separatorIndex = line.indexOf('=')
      const key = separatorIndex >= 0 ? line.slice(0, separatorIndex).trim() : line
      if (!key) return result
      result[key] = separatorIndex >= 0 ? line.slice(separatorIndex + 1).trim() : ''
      return result
    }, {})
}

function toEditableServer(server: AgentMcpServer): EditableAgentMcpServer {
  return {
    id: server.id || createServerId(),
    name: server.name || t('setting.system.aiAgentMcpUnnamedServer'),
    enabled: server.enabled !== false,
    transport: server.transport || 'stdio',
    description: server.description || '',
    command: server.command || '',
    args: [...(server.args || [])],
    env: { ...(server.env || {}) },
    url: server.url || '',
    headers: { ...(server.headers || {}) },
    timeout: Number(server.timeout || 30),
    tool_prefix: server.tool_prefix || '',
    require_admin: server.require_admin !== false,
    argsText: (server.args || []).join('\n'),
    envText: dictToLines(server.env),
    headersText: dictToLines(server.headers),
  }
}

function toServerPayload(server: EditableAgentMcpServer): AgentMcpServer {
  return {
    id: server.id || createServerId(),
    name: String(server.name || '').trim() || t('setting.system.aiAgentMcpUnnamedServer'),
    enabled: Boolean(server.enabled),
    transport: server.transport || 'stdio',
    description: String(server.description || '').trim() || null,
    command: String(server.command || '').trim() || null,
    args: String(server.argsText || '')
      .split('\n')
      .map(item => item.trim())
      .filter(Boolean),
    env: linesToDict(server.envText),
    url: String(server.url || '').trim() || null,
    headers: linesToDict(server.headersText),
    timeout: Math.max(1, Number(server.timeout || 30)),
    tool_prefix: String(server.tool_prefix || '').trim() || null,
    require_admin: Boolean(server.require_admin),
  }
}

function resetLocalServers() {
  localServers.value = (props.servers || []).map(toEditableServer)
  testStates.value = {}
}

function addServer() {
  localServers.value.push(
    toEditableServer({
      id: createServerId(),
      name: t('setting.system.aiAgentMcpNewServer'),
      enabled: true,
      transport: 'stdio',
      description: '',
      command: '',
      args: [],
      env: {},
      url: '',
      headers: {},
      timeout: 30,
      tool_prefix: '',
      require_admin: true,
    }),
  )
}

function removeServer(server: EditableAgentMcpServer) {
  localServers.value = localServers.value.filter(item => item.id !== server.id)
}

async function testServer(server: EditableAgentMcpServer) {
  const payload = toServerPayload(server)
  testStates.value[payload.id] = { loading: true }
  try {
    const result: { [key: string]: any } = await api.post('message/agent/mcp/servers/test', { server: payload })
    testStates.value[payload.id] = {
      loading: false,
      success: Boolean(result.success),
      message: result.message || result.data?.message || '',
      tools: result.data?.tools || [],
    }
  } catch (error) {
    testStates.value[payload.id] = {
      loading: false,
      success: false,
      message: error instanceof Error ? error.message : String(error),
      tools: [],
    }
  }
}

async function saveServers() {
  saving.value = true
  try {
    const servers = localServers.value.map(toServerPayload)
    const result: { [key: string]: any } = await api.post('message/agent/mcp/servers', { servers })
    if (result.success) {
      toast.success(t('setting.system.aiAgentMcpSaveSuccess'))
      emit('saved', servers)
      dialogVisible.value = false
      return
    }
    toast.error(result.message || t('setting.system.aiAgentMcpSaveFailed'))
  } catch (error) {
    toast.error(error instanceof Error ? error.message : String(error))
  } finally {
    saving.value = false
  }
}

watch(
  () => props.modelValue,
  value => {
    if (value) resetLocalServers()
  },
)

watch(
  () => props.servers,
  () => {
    if (props.modelValue) resetLocalServers()
  },
  { deep: true },
)
</script>

<template>
  <VDialog v-model="dialogVisible" scrollable max-width="72rem" :fullscreen="!display.mdAndUp.value">
    <VCard>
      <VCardItem class="py-2">
        <template #prepend>
          <VIcon icon="mdi-server-network" class="me-2" />
        </template>
        <VCardTitle>{{ t('setting.system.aiAgentMcpDialogTitle') }}</VCardTitle>
        <VCardSubtitle>{{ t('setting.system.aiAgentMcpDialogDesc') }}</VCardSubtitle>
      </VCardItem>
      <VDialogCloseBtn @click="dialogVisible = false" />

      <VCardText>
        <div class="d-flex justify-end mb-4">
          <VBtn color="success" variant="tonal" prepend-icon="mdi-plus" @click="addServer">
            {{ t('setting.system.aiAgentMcpAddServer') }}
          </VBtn>
        </div>

        <VAlert v-if="localServers.length === 0" type="info" variant="tonal">
          {{ t('setting.system.aiAgentMcpEmpty') }}
        </VAlert>

        <VExpansionPanels v-else variant="accordion" class="agent-mcp-panels">
          <VExpansionPanel v-for="server in localServers" :key="server.id">
            <VExpansionPanelTitle>
              <div class="agent-mcp-panel-title">
                <VIcon :icon="server.enabled ? 'mdi-lan-connect' : 'mdi-lan-disconnect'" />
                <span>{{ server.name || t('setting.system.aiAgentMcpUnnamedServer') }}</span>
                <VChip size="small" variant="tonal">{{ server.transport }}</VChip>
              </div>
            </VExpansionPanelTitle>
            <VExpansionPanelText>
              <VRow>
                <VCol cols="12" md="6">
                  <VTextField
                    v-model="server.name"
                    :label="t('setting.system.aiAgentMcpName')"
                    prepend-inner-icon="mdi-label-outline"
                  />
                </VCol>
                <VCol cols="12" md="6">
                  <VSelect
                    v-model="server.transport"
                    :label="t('setting.system.aiAgentMcpTransport')"
                    :items="transportItems"
                    prepend-inner-icon="mdi-transit-connection-variant"
                  />
                </VCol>
                <VCol cols="12" md="6">
                  <VSwitch
                    v-model="server.enabled"
                    :label="t('setting.system.aiAgentMcpEnabled')"
                    :hint="t('setting.system.aiAgentMcpEnabledHint')"
                    persistent-hint
                  />
                </VCol>
                <VCol cols="12" md="6">
                  <VSwitch
                    v-model="server.require_admin"
                    :label="t('setting.system.aiAgentMcpRequireAdmin')"
                    :hint="t('setting.system.aiAgentMcpRequireAdminHint')"
                    persistent-hint
                  />
                </VCol>
                <VCol cols="12" md="6">
                  <VTextField
                    v-model.number="server.timeout"
                    :label="t('setting.system.aiAgentMcpTimeout')"
                    type="number"
                    min="1"
                    prepend-inner-icon="mdi-timer-sand"
                  />
                </VCol>
                <VCol cols="12" md="6">
                  <VTextField
                    v-model="server.tool_prefix"
                    :label="t('setting.system.aiAgentMcpToolPrefix')"
                    :hint="t('setting.system.aiAgentMcpToolPrefixHint')"
                    persistent-hint
                    prepend-inner-icon="mdi-form-textbox"
                  />
                </VCol>
                <VCol cols="12">
                  <VTextarea
                    v-model="server.description"
                    :label="t('setting.system.aiAgentMcpDescription')"
                    rows="1"
                    auto-grow
                    prepend-inner-icon="mdi-text-box-outline"
                  />
                </VCol>

                <template v-if="server.transport === 'stdio'">
                  <VCol cols="12" md="6">
                    <VTextField
                      v-model="server.command"
                      :label="t('setting.system.aiAgentMcpCommand')"
                      placeholder="npx"
                      prepend-inner-icon="mdi-console"
                    />
                  </VCol>
                  <VCol cols="12" md="6">
                    <VTextarea
                      v-model="server.argsText"
                      :label="t('setting.system.aiAgentMcpArgs')"
                      :hint="t('setting.system.aiAgentMcpArgsHint')"
                      persistent-hint
                      rows="2"
                      auto-grow
                      prepend-inner-icon="mdi-format-list-bulleted"
                    />
                  </VCol>
                  <VCol cols="12">
                    <VTextarea
                      v-model="server.envText"
                      :label="t('setting.system.aiAgentMcpEnv')"
                      :hint="t('setting.system.aiAgentMcpKeyValueHint')"
                      persistent-hint
                      rows="2"
                      auto-grow
                      prepend-inner-icon="mdi-code-braces"
                    />
                  </VCol>
                </template>

                <template v-else>
                  <VCol cols="12">
                    <VTextField
                      v-model="server.url"
                      :label="t('setting.system.aiAgentMcpUrl')"
                      placeholder="http://127.0.0.1:3001/api/v1/mcp"
                      prepend-inner-icon="mdi-link-variant"
                    />
                  </VCol>
                  <VCol cols="12">
                    <VTextarea
                      v-model="server.headersText"
                      :label="t('setting.system.aiAgentMcpHeaders')"
                      :hint="t('setting.system.aiAgentMcpKeyValueHint')"
                      persistent-hint
                      rows="2"
                      auto-grow
                      prepend-inner-icon="mdi-format-align-left"
                    />
                  </VCol>
                </template>
              </VRow>

              <VAlert
                v-if="testStates[server.id]?.message"
                :type="testStates[server.id]?.success ? 'success' : 'error'"
                variant="tonal"
                density="comfortable"
                class="mt-3"
              >
                <div>{{ testStates[server.id]?.message }}</div>
                <div v-if="testStates[server.id]?.tools?.length" class="agent-mcp-tool-list mt-2">
                  <VChip
                    v-for="tool in testStates[server.id]?.tools"
                    :key="tool.agent_tool_name"
                    size="small"
                    variant="tonal"
                  >
                    {{ tool.agent_tool_name }}
                  </VChip>
                </div>
              </VAlert>

              <div class="agent-mcp-actions mt-4">
                <VBtn
                  color="info"
                  variant="tonal"
                  prepend-icon="mdi-connection"
                  :loading="testStates[server.id]?.loading"
                  @click="testServer(server)"
                >
                  {{ t('setting.system.aiAgentMcpTest') }}
                </VBtn>
                <VBtn color="error" variant="text" prepend-icon="mdi-delete-outline" @click="removeServer(server)">
                  {{ t('common.delete') }}
                </VBtn>
              </div>
            </VExpansionPanelText>
          </VExpansionPanel>
        </VExpansionPanels>
      </VCardText>

      <VCardActions class="app-dialog-actions">
        <VSpacer />
        <VBtn
          color="primary"
          variant="flat"
          prepend-icon="mdi-content-save"
          class="px-5"
          :loading="saving"
          @click="saveServers"
        >
          {{ t('common.save') }}
        </VBtn>
      </VCardActions>
    </VCard>
  </VDialog>
</template>

<style lang="scss" scoped>
.agent-mcp-panel-title {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  min-width: 0;

  span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
}

.agent-mcp-actions,
.agent-mcp-tool-list {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}
</style>
