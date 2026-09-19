import AgentMcpSettingsDialog from '@/components/dialog/AgentMcpSettingsDialog.vue'
import { shallowMount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@/api', () => ({
  default: {
    post: vi.fn(),
  },
}))

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key: string) => key }),
}))

vi.mock('vuetify', () => ({
  useDisplay: () => ({ mdAndUp: { value: true } }),
}))

const slotStub = { template: '<div><slot /></div>' }

describe('AgentMcpSettingsDialog', () => {
  it('hydrates saved servers when the dialog is mounted open', async () => {
    const wrapper = shallowMount(AgentMcpSettingsDialog, {
      props: {
        modelValue: true,
        servers: [
          {
            id: 'amap',
            name: '高德地图',
            enabled: true,
            transport: 'http',
            args: [],
            env: {},
            headers: {},
            timeout: 30,
            require_admin: true,
          },
        ],
      },
      global: {
        stubs: {
          VAlert: slotStub,
          VBtn: slotStub,
          VCard: slotStub,
          VCardActions: slotStub,
          VCardItem: slotStub,
          VCardSubtitle: slotStub,
          VCardText: slotStub,
          VCardTitle: slotStub,
          VDialog: { template: '<div><slot /></div>' },
          VDialogCloseBtn: true,
          VExpansionPanel: slotStub,
          VExpansionPanelText: slotStub,
          VExpansionPanelTitle: slotStub,
          VExpansionPanels: slotStub,
          VIcon: slotStub,
          VSelect: slotStub,
          VSpacer: slotStub,
          VSwitch: slotStub,
          VTextField: slotStub,
          VTextarea: slotStub,
          VChip: slotStub,
        },
      },
    })

    const localServers = (wrapper.vm as unknown as { localServers: Array<{ name: string }> }).localServers

    expect(localServers).toHaveLength(1)
    expect(localServers[0]?.name).toBe('高德地图')
  })
})
