import { useSetupWizard, type WizardData } from '@/composables/useSetupWizard'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  apiGet: vi.fn(),
  apiPost: vi.fn(),
  apiPut: vi.fn(),
  copyToClipboard: vi.fn(),
  routerPush: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
}))

vi.mock('@/api', () => ({
  default: createDataApiMock({
    get: (...args: unknown[]) => mocks.apiGet(...args),
    post: (...args: unknown[]) => mocks.apiPost(...args),
    put: (...args: unknown[]) => mocks.apiPut(...args),
  }),
}))

vi.mock('@/@core/utils/navigator', () => ({
  copyToClipboard: (...args: unknown[]) => mocks.copyToClipboard(...args),
}))

vi.mock('vue-i18n', () => ({
  useI18n: () => ({
    t: (key: string, params?: Record<string, unknown>) => (params ? `${key}:${Object.values(params).join(',')}` : key),
  }),
}))

vi.mock('vue-router', () => ({
  useRouter: () => ({ push: mocks.routerPush }),
}))

vi.mock('vue-toastification', () => ({
  useToast: () => ({ error: mocks.toastError, success: mocks.toastSuccess }),
}))

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, reject, resolve }
}

function cloneWizardData(data: WizardData) {
  return JSON.parse(JSON.stringify(data)) as WizardData
}

const originalWizardData = cloneWizardData(useSetupWizard().wizardData.value)

function resetWizard() {
  const wizard = useSetupWizard()
  wizard.currentStep.value = 1
  wizard.wizardData.value = cloneWizardData(originalWizardData)
  wizard.authSites.value = {}
  wizard.selectedPreset.value = ''
  wizard.connectivityTest.value = {
    isTesting: false,
    showResult: false,
    testMessage: '',
    testProgress: 0,
    testResult: null,
  }
  wizard.clearValidationErrors()
  return wizard
}

function success(data: unknown = null) {
  return { data, message: '', success: true }
}

function businessFailure(message = '业务失败') {
  return { data: null, message, success: false }
}

function currentUser() {
  return {
    avatar: 'avatar.png',
    email: 'admin@example.com',
    id: 7,
    is_active: true,
    is_otp: true,
    is_superuser: true,
    name: 'admin',
    nickname: '管理员',
    permissions: { manage: true },
    settings: { theme: 'dark' },
  }
}

function seedValidStep(wizard: ReturnType<typeof useSetupWizard>, step: number) {
  wizard.currentStep.value = step
  wizard.wizardData.value.basic.username = 'admin'
  wizard.wizardData.value.basic.apiToken = 'token'
  wizard.wizardData.value.storage.downloadPath = '/downloads'
  wizard.wizardData.value.storage.libraryPath = '/media'

  if (step === 4) {
    Object.assign(wizard.wizardData.value.downloader, {
      config: { host: 'http://qb', password: 'secret', username: 'admin' },
      name: '主下载器',
      type: 'qbittorrent',
    })
  }
  if (step === 5) {
    Object.assign(wizard.wizardData.value.mediaServer, {
      config: { apikey: 'key', host: 'http://emby' },
      name: '主媒体服务器',
      sync_libraries: ['Movies'],
      type: 'emby',
    })
  }
  if (step === 6) {
    Object.assign(wizard.wizardData.value.notification, {
      config: { TELEGRAM_CHAT_ID: '123', TELEGRAM_TOKEN: 'token' },
      enabled: true,
      name: 'Telegram 通知',
      switchs: ['资源下载'],
      type: 'telegram',
    })
  }
}

async function resolveConnectivity<T>(promise: Promise<T>) {
  await vi.advanceTimersByTimeAsync(2_000)
  return promise
}

describe('useSetupWizard defaults, selection and validation', () => {
  beforeEach(() => {
    mocks.apiGet.mockReset()
    mocks.apiPost.mockReset()
    mocks.apiPut.mockReset()
    mocks.copyToClipboard.mockReset()
    mocks.routerPush.mockReset()
    mocks.toastError.mockReset()
    mocks.toastSuccess.mockReset()
    mocks.apiGet.mockResolvedValue(success())
    mocks.apiPost.mockResolvedValue(success())
    mocks.apiPut.mockResolvedValue(success())
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(console, 'log').mockImplementation(() => {})
    resetWizard()
  })

  it('exposes eight ordered steps and stable defaults', () => {
    const wizard = resetWizard()

    expect(wizard.totalSteps).toBe(8)
    expect(wizard.stepTitles.value).toEqual([
      'setupWizard.basic.title',
      'setupWizard.siteAuth.title',
      'setupWizard.storage.title',
      'setupWizard.downloader.title',
      'setupWizard.mediaServer.title',
      'setupWizard.notification.title',
      'setupWizard.agent.title',
      'setupWizard.preferences.title',
    ])
    expect(wizard.stepDescriptions.value).toHaveLength(8)
    expect(wizard.wizardData.value).toMatchObject({
      agent: {
        enabled: false,
        maxContextTokens: 64,
        model: 'deepseek-chat',
        provider: 'deepseek',
        thinkingLevel: 'off',
      },
      basic: { apiToken: '', recognizeSource: 'themoviedb', username: '' },
      preferences: { quality: '4K', resolution: '2160p', subtitle: 'chinese' },
      storage: { overwriteMode: 'never', transferType: 'link' },
    })
  })

  it('selects, renames and toggles optional service types without clearing configuration', () => {
    const wizard = resetWizard()
    wizard.wizardData.value.downloader.config = { host: 'http://qb' }
    wizard.selectDownloader('qbittorrent')
    expect(wizard.wizardData.value.downloader).toMatchObject({
      config: { host: 'http://qb' },
      name: 'qbittorrent 下载器',
      type: 'qbittorrent',
    })
    wizard.selectDownloader('transmission')
    expect(wizard.wizardData.value.downloader.name).toBe('transmission 下载器')
    wizard.selectDownloader('transmission')
    expect(wizard.wizardData.value.downloader.type).toBe('')

    wizard.wizardData.value.mediaServer.config = { token: 'token' }
    wizard.selectMediaServer('plex')
    expect(wizard.wizardData.value.mediaServer).toMatchObject({
      config: { token: 'token' },
      name: 'plex 服务器',
      type: 'plex',
    })
    wizard.selectMediaServer('plex')
    expect(wizard.wizardData.value.mediaServer.type).toBe('')

    wizard.selectNotification('wechat')
    expect(wizard.wizardData.value.notification).toMatchObject({
      enabled: true,
      name: '企业微信 通知',
      type: 'wechat',
    })
    wizard.selectNotification('wechat')
    expect(wizard.wizardData.value.notification.type).toBe('')
  })

  it('preserves custom service names and falls back to the raw notification type', () => {
    const wizard = resetWizard()
    wizard.wizardData.value.downloader.name = '下载专线'
    wizard.selectDownloader('qbittorrent')
    expect(wizard.wizardData.value.downloader.name).toBe('下载专线')

    wizard.wizardData.value.mediaServer.name = '客厅媒体库'
    wizard.selectMediaServer('plex')
    expect(wizard.wizardData.value.mediaServer.name).toBe('客厅媒体库')

    wizard.wizardData.value.notification.name = ''
    wizard.selectNotification('custom')
    expect(wizard.wizardData.value.notification.name).toBe('custom 通知')
  })

  it.each([
    ['4k', '4K', 'bilingual', '2160p'],
    ['balanced', '1080P', 'chinese', '1080p'],
    ['chinese', '1080P', 'chinese', '1080p'],
  ])('applies the %s preference preset', (preset, quality, subtitle, resolution) => {
    const wizard = resetWizard()
    wizard.selectPreset(preset)

    expect(wizard.selectedPreset.value).toBe(preset)
    expect(wizard.wizardData.value.preferences).toMatchObject({ quality, resolution, subtitle })
  })

  it('stores detailed preference rules', () => {
    const wizard = resetWizard()
    const options = { excludeBluray: true, excludeDolbyVision: false }
    const rules = [{ category: '电影', media_type: '电影', name: '高画质', rule_string: '4K' }]

    wizard.updatePreferences(options, rules)

    expect(wizard.wizardData.value.preferences).toMatchObject({
      personalizationOptions: options,
      ruleSequences: rules,
    })
  })

  it('generates and copies API tokens with success and failure feedback', async () => {
    const wizard = resetWizard()
    vi.spyOn(window.crypto, 'getRandomValues').mockImplementation(array => {
      ;(array as Uint8Array).fill(1)
      return array
    })
    wizard.createRandomString()
    expect(wizard.wizardData.value.basic.apiToken).toBe('1'.repeat(32))

    mocks.copyToClipboard
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false)
      .mockRejectedValueOnce(new Error('no'))
    await wizard.copyValue('token')
    await wizard.copyValue('token')
    await wizard.copyValue('token')

    expect(mocks.toastSuccess).toHaveBeenCalledWith('setting.system.copySuccess')
    expect(mocks.toastError.mock.calls).toEqual([['setting.system.copyFailed'], ['setting.system.copyError']])
  })

  it('validates basic, storage and missing site-auth values', () => {
    const wizard = resetWizard()
    expect(wizard.validateCurrentStep()).toEqual({
      errors: ['dialog.userAddEdit.usernameRequired', 'setupWizard.basic.apiTokenRequired'],
      isValid: false,
    })

    Object.assign(wizard.wizardData.value.basic, {
      apiToken: 'token',
      confirmPassword: 'different',
      password: 'short',
      username: 'admin',
    })
    expect(wizard.validateCurrentStep().errors).toEqual([
      'dialog.userAddEdit.passwordMinLength',
      'dialog.userAddEdit.passwordMismatch',
    ])

    wizard.currentStep.value = 2
    wizard.wizardData.value.siteAuth.site = 'm-team'
    expect(wizard.validateCurrentStep().errors).toEqual(['setupWizard.siteAuth.siteConfigNotExist'])

    wizard.authSites.value = {
      'm-team': {
        icon: 'm-team.png',
        name: 'M-Team',
        params: { api_key: { name: 'API Key', type: 'text' } },
      },
    }
    expect(wizard.validateCurrentStep().errors).toEqual(['setupWizard.siteAuth.fieldRequired:API Key'])
    wizard.wizardData.value.siteAuth.params['M-TEAM_API_KEY'] = 'key'
    expect(wizard.validateCurrentStep()).toEqual({ errors: [], isValid: true })

    wizard.currentStep.value = 3
    expect(wizard.validateCurrentStep().errors).toEqual([
      'setupWizard.storage.downloadPathRequired',
      'setupWizard.storage.libraryPathRequired',
    ])
  })

  it('accepts an omitted optional site and reports a missing password confirmation', () => {
    const wizard = resetWizard()
    wizard.currentStep.value = 2
    expect(wizard.validateSiteAuthFields()).toEqual({ errors: [], isValid: true })

    wizard.currentStep.value = 1
    Object.assign(wizard.wizardData.value.basic, {
      apiToken: 'token',
      confirmPassword: '',
      password: 'long-enough',
      username: 'admin',
    })
    expect(wizard.validateCurrentStep().errors).toEqual(['dialog.userAddEdit.confirmPasswordRequired'])
  })

  it.each([
    ['qbittorrent', { host: 'http://qb' }, ['downloader.usernameRequired', 'downloader.passwordRequired']],
    ['transmission', { host: 'http://tr' }, ['downloader.usernameRequired', 'downloader.passwordRequired']],
    ['rtorrent', { host: 'http://rt' }, ['downloader.usernameRequired', 'downloader.passwordRequired']],
  ])('validates the %s downloader contract', (type, config, expectedErrors) => {
    const wizard = resetWizard()
    wizard.currentStep.value = 4
    Object.assign(wizard.wizardData.value.downloader, { config, name: '下载器', type })
    expect(wizard.validateCurrentStep().errors).toEqual(expectedErrors)

    wizard.wizardData.value.downloader.config = {
      ...config,
      apikey: type === 'qbittorrent' ? 'key' : undefined,
      password: 'password',
      username: 'admin',
    }
    expect(wizard.validateCurrentStep()).toEqual({ errors: [], isValid: true })
  })

  it.each([
    ['emby', { host: 'http://emby' }, 'mediaserver.apiKeyRequired'],
    ['jellyfin', { host: 'http://jellyfin' }, 'mediaserver.apiKeyRequired'],
    ['plex', { host: 'http://plex' }, 'mediaserver.tokenRequired'],
    ['zspace', { host: 'http://zspace' }, 'mediaserver.usernameRequired'],
    ['trimemedia', { host: 'http://trimemedia' }, 'mediaserver.usernameRequired'],
    ['ugreen', { host: 'http://ugreen' }, 'mediaserver.usernameRequired'],
  ])('validates the %s media-server contract', (type, config, expectedError) => {
    const wizard = resetWizard()
    wizard.currentStep.value = 5
    Object.assign(wizard.wizardData.value.mediaServer, { config, name: '媒体服务器', type })
    expect(wizard.validateCurrentStep().errors).toContain(expectedError)
  })

  it.each([
    ['emby', { apikey: 'key', host: 'http://emby' }],
    ['jellyfin', { apikey: 'key', host: 'http://jellyfin' }],
    ['plex', { host: 'http://plex', token: 'token' }],
    ['zspace', { host: 'http://zspace', password: 'secret', username: 'admin' }],
    ['trimemedia', { host: 'http://trimemedia', password: 'secret', username: 'admin' }],
    ['ugreen', { host: 'http://ugreen', password: 'secret', username: 'admin' }],
  ])('accepts the complete %s media-server contract', (type, config) => {
    const wizard = resetWizard()
    wizard.currentStep.value = 5
    Object.assign(wizard.wizardData.value.mediaServer, { config, name: '媒体服务器', type })
    expect(wizard.validateCurrentStep()).toEqual({ errors: [], isValid: true })
  })

  it.each([
    ['wechat', {}, 'notification.wechat.corpIdRequired'],
    ['feishu', {}, 'notification.feishu.appIdRequired'],
    ['telegram', {}, 'notification.telegram.tokenRequired'],
    ['slack', {}, 'notification.slack.oauthTokenRequired'],
    ['synologychat', {}, 'notification.synologychat.webhookRequired'],
    ['vocechat', {}, 'notification.vocechat.hostRequired'],
    ['webpush', {}, 'notification.webpush.usernameRequired'],
    ['qqbot', {}, 'notification.qqbot.appIdRequired'],
    ['wechatclawbot', {}, null],
  ])('validates the %s notification contract', (type, config, expectedError) => {
    const wizard = resetWizard()
    wizard.currentStep.value = 6
    Object.assign(wizard.wizardData.value.notification, { config, name: '通知', type })
    const result = wizard.validateCurrentStep()
    if (expectedError) expect(result.errors).toContain(expectedError)
    else expect(result).toEqual({ errors: [], isValid: true })
  })

  it.each([
    ['wechat', { WECHAT_APP_ID: 'app', WECHAT_APP_SECRET: 'secret', WECHAT_CORPID: 'corp' }],
    ['feishu', { FEISHU_APP_ID: 'app', FEISHU_APP_SECRET: 'secret' }],
    ['telegram', { TELEGRAM_CHAT_ID: 'chat', TELEGRAM_TOKEN: 'token' }],
    ['slack', { SLACK_CHANNEL: 'channel', SLACK_OAUTH_TOKEN: 'token' }],
    ['synologychat', { SYNOLOGYCHAT_WEBHOOK: 'https://chat.example.com' }],
    ['vocechat', { VOCECHAT_API_KEY: 'key', VOCECHAT_HOST: 'https://voce.example.com' }],
    ['webpush', { WEBPUSH_USERNAME: 'admin' }],
    ['qqbot', { QQ_APP_ID: 'app', QQ_APP_SECRET: 'secret' }],
  ])('accepts the complete %s notification contract', (type, config) => {
    const wizard = resetWizard()
    wizard.currentStep.value = 6
    Object.assign(wizard.wizardData.value.notification, { config, name: '通知', type })
    expect(wizard.validateCurrentStep()).toEqual({ errors: [], isValid: true })
  })

  it('reports missing service names and hosts before provider-specific fields', () => {
    const wizard = resetWizard()
    wizard.currentStep.value = 4
    Object.assign(wizard.wizardData.value.downloader, { config: {}, name: '', type: 'qbittorrent' })
    expect(wizard.validateCurrentStep().errors).toEqual([
      'downloader.nameRequired',
      'downloader.hostRequired',
      'downloader.usernameRequired',
      'downloader.passwordRequired',
    ])

    wizard.currentStep.value = 5
    Object.assign(wizard.wizardData.value.mediaServer, { config: {}, name: '', type: 'plex' })
    expect(wizard.validateCurrentStep().errors).toEqual([
      'mediaserver.nameRequired',
      'mediaserver.hostRequired',
      'mediaserver.tokenRequired',
    ])

    wizard.currentStep.value = 6
    Object.assign(wizard.wizardData.value.notification, { config: undefined, name: '', type: 'wechatclawbot' })
    expect(wizard.validateCurrentStep().errors).toEqual(['notification.nameRequired'])
  })

  it('validates enabled agent fields and skips them when disabled', () => {
    const wizard = resetWizard()
    wizard.currentStep.value = 7
    wizard.wizardData.value.agent.enabled = true
    Object.assign(wizard.wizardData.value.agent, {
      apiKey: '',
      authConnected: false,
      maxContextTokens: 0,
      model: '',
      provider: '',
      recommendEnabled: true,
      recommendMaxItems: 0,
    })
    expect(wizard.validateCurrentStep().errors).toEqual([
      'setupWizard.agent.providerRequired',
      'setupWizard.agent.authOrApiKeyRequired',
      'setupWizard.agent.modelRequired',
      'setupWizard.agent.maxContextTokensRequired',
      'setupWizard.agent.recommendMaxItemsRequired',
    ])

    wizard.wizardData.value.agent.enabled = false
    expect(wizard.validateCurrentStep()).toEqual({ errors: [], isValid: true })
    wizard.currentStep.value = 8
    expect(wizard.validateCurrentStep()).toEqual({ errors: [], isValid: true })
  })
})

describe('useSetupWizard initialization and step payloads', () => {
  beforeEach(() => {
    mocks.apiGet.mockReset()
    mocks.apiPost.mockReset()
    mocks.apiPut.mockReset()
    mocks.routerPush.mockReset()
    mocks.toastError.mockReset()
    mocks.toastSuccess.mockReset()
    mocks.apiPost.mockResolvedValue(success())
    mocks.apiPut.mockResolvedValue(success())
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(console, 'log').mockImplementation(() => {})
    resetWizard()
  })

  it('loads existing settings across all eight setup domains', async () => {
    mocks.apiGet.mockImplementation((endpoint: unknown) => {
      const responses: Record<string, unknown> = {
        'site/auth': success({
          'm-team': { icon: 'm-team.png', name: 'M-Team', params: {} },
        }),
        'system/env': success({
          AI_AGENT_ENABLE: true,
          AI_AGENT_GLOBAL: true,
          AI_AGENT_JOB_INTERVAL: 15,
          AI_AGENT_RECOMMEND_MAX_ITEMS: 25,
          AI_AGENT_RETRY_TRANSFER: true,
          AI_RECOMMEND_ENABLED: true,
          API_TOKEN: 'existing-token',
          APP_DOMAIN: 'https://mp.example.com',
          AUXILIARY_AUTH_ENABLE: true,
          GITHUB_TOKEN: 'github-token',
          LLM_API_KEY: 'llm-key',
          LLM_DISABLE_THINKING: false,
          LLM_MAX_CONTEXT_TOKENS: 128,
          LLM_MODEL: 'deepseek-reasoner',
          LLM_PROVIDER: 'deepseek',
          LLM_REASONING_EFFORT: 'high',
          OCR_HOST: 'http://ocr',
          PROXY_HOST: 'http://proxy',
          SUPERUSER: 'admin',
        }),
        'system/setting/Downloaders': success({
          value: [{ config: { host: 'http://qb' }, name: 'QB', type: 'qbittorrent' }],
        }),
        'system/setting/MediaServers': success({
          value: [{ config: { host: 'http://emby' }, name: 'Emby', sync_libraries: ['Movies'], type: 'emby' }],
        }),
        'system/setting/Notifications': success({
          value: [{ config: { TOKEN: 'token' }, enabled: true, name: 'Bot', switchs: ['下载'], type: 'telegram' }],
        }),
        'system/setting/UserSiteAuthParams': success({ value: { params: { M_TEAM_KEY: 'key' }, site: 'm-team' } }),
        'system/setting/public/Directories': success({
          value: [
            {
              download_path: '/downloads',
              library_path: '/media',
              overwrite_mode: 'always',
              transfer_type: 'copy',
            },
          ],
        }),
      }
      return responses[String(endpoint)] ?? success()
    })

    const wizard = resetWizard()
    const initializing = wizard.initialize()
    expect(wizard.isLoading.value).toBe(true)
    await initializing

    expect(wizard.isLoading.value).toBe(false)
    expect(wizard.wizardData.value).toMatchObject({
      agent: {
        apiKey: 'llm-key',
        enabled: true,
        global: true,
        maxContextTokens: 128,
        model: 'deepseek-reasoner',
        thinkingLevel: 'high',
      },
      basic: {
        apiToken: 'existing-token',
        appDomain: 'https://mp.example.com',
        githubToken: 'github-token',
        username: 'admin',
      },
      downloader: { name: 'QB', type: 'qbittorrent' },
      mediaServer: { name: 'Emby', sync_libraries: ['Movies'], type: 'emby' },
      notification: { enabled: true, name: 'Bot', type: 'telegram' },
      siteAuth: { auxiliaryAuthEnable: true, site: 'm-team' },
      storage: {
        downloadPath: '/downloads',
        libraryPath: '/media',
        overwriteMode: 'always',
        transferType: 'copy',
      },
    })
    expect(wizard.authSites.value).toHaveProperty('m-team')
  })

  it.each([
    [{ LLM_THINKING_LEVEL: 'ENABLED' }, 'auto'],
    [{ LLM_DISABLE_THINKING: true, LLM_REASONING_EFFORT: 'high' }, 'off'],
    [{ LLM_DISABLE_THINKING: false }, 'auto'],
  ])('normalizes thinking configuration %#', async (environment, expected) => {
    mocks.apiGet.mockImplementation((endpoint: unknown) =>
      endpoint === 'system/env' ? success(environment) : success(),
    )
    const wizard = resetWizard()
    await wizard.initialize()
    expect(wizard.wizardData.value.agent.thinkingLevel).toBe(expected)
  })

  it('applies defaults for sparse successful responses and generates a missing API token', async () => {
    mocks.apiGet.mockImplementation((endpoint: unknown) => {
      const responses: Record<string, unknown> = {
        'site/auth': success(null),
        'system/env': success({ LLM_TEMPERATURE: 'invalid' }),
        'system/setting/Downloaders': success({ value: [{ config: null, name: 'QB', type: 'qbittorrent' }] }),
        'system/setting/MediaServers': success({
          value: [{ config: null, name: 'Emby', sync_libraries: null, type: 'emby' }],
        }),
        'system/setting/Notifications': success({
          value: [{ config: null, enabled: false, name: 'Bot', switchs: null, type: 'telegram' }],
        }),
        'system/setting/UserSiteAuthParams': success({ value: {} }),
        'system/setting/public/Directories': success({ value: [{}] }),
      }
      return responses[String(endpoint)] ?? success()
    })
    const wizard = resetWizard()

    await wizard.initialize()

    expect(wizard.wizardData.value.basic.apiToken).toHaveLength(32)
    expect(wizard.wizardData.value.agent).toMatchObject({
      maxContextTokens: 64,
      model: '',
      provider: 'deepseek',
      temperature: 0.3,
    })
    expect(wizard.wizardData.value.siteAuth).toMatchObject({ params: {}, site: '' })
    expect(wizard.wizardData.value.storage).toMatchObject({
      downloadPath: '',
      libraryPath: '',
      overwriteMode: 'never',
      transferType: 'link',
    })
    expect(wizard.wizardData.value.downloader.config).toEqual({})
    expect(wizard.wizardData.value.mediaServer).toMatchObject({ config: {}, sync_libraries: [] })
    expect(wizard.wizardData.value.notification).toMatchObject({ config: {}, switchs: [] })
    expect(wizard.authSites.value).toEqual({})
  })

  it('keeps defaults and finishes initialization when every load endpoint fails', async () => {
    mocks.apiGet.mockRejectedValue(new Error('offline'))
    const wizard = resetWizard()

    await expect(wizard.initialize()).resolves.toBeUndefined()

    expect(wizard.isLoading.value).toBe(false)
    expect(wizard.wizardData.value.storage).toMatchObject({
      downloadPath: '',
      libraryPath: '',
      overwriteMode: 'never',
      transferType: 'link',
    })
  })

  it('saves the basic environment payload without changing the password when it is blank', async () => {
    const wizard = resetWizard()
    seedValidStep(wizard, 1)
    Object.assign(wizard.wizardData.value.basic, {
      appDomain: 'https://mp.example.com',
      githubToken: 'github-token',
      ocrHost: 'http://ocr',
      proxyHost: 'http://proxy',
    })

    await expect(wizard.nextStep()).resolves.toBe(true)

    expect(mocks.apiPost).toHaveBeenCalledWith('system/env', {
      API_TOKEN: 'token',
      APP_DOMAIN: 'https://mp.example.com',
      GITHUB_TOKEN: 'github-token',
      OCR_HOST: 'http://ocr',
      PROXY_HOST: 'http://proxy',
      RECOGNIZE_SOURCE: 'themoviedb',
    })
    expect(mocks.apiGet).not.toHaveBeenCalled()
    expect(wizard.currentStep.value).toBe(2)
  })

  it('updates the current user password through the complete User contract', async () => {
    mocks.apiGet.mockResolvedValue(success(currentUser()))
    const wizard = resetWizard()
    seedValidStep(wizard, 1)
    const passwordValue = ['updated', currentUser().id, 'credential'].join('-')
    Object.assign(wizard.wizardData.value.basic, {
      confirmPassword: passwordValue,
      password: passwordValue,
    })

    await expect(wizard.nextStep()).resolves.toBe(true)

    expect(mocks.apiGet).toHaveBeenCalledWith('user/current')
    expect(mocks.apiPut).toHaveBeenCalledWith('user/', {
      avatar: 'avatar.png',
      email: 'admin@example.com',
      id: 7,
      is_active: true,
      is_otp: true,
      is_superuser: true,
      name: 'admin',
      password: passwordValue,
      permissions: { manage: true },
      settings: { theme: 'dark' },
    })
    expect(mocks.apiPost).not.toHaveBeenCalledWith('user/', expect.anything())
  })

  it('saves site authentication and storage payloads in their owning steps', async () => {
    const wizard = resetWizard()
    seedValidStep(wizard, 2)
    Object.assign(wizard.wizardData.value.siteAuth, {
      auxiliaryAuthEnable: true,
      params: { 'M-TEAM_API_KEY': 'key' },
      site: 'm-team',
    })
    wizard.authSites.value = {
      'm-team': { icon: '', name: 'M-Team', params: { api_key: { name: 'API Key', type: 'text' } } },
    }

    await expect(wizard.nextStep()).resolves.toBe(true)
    expect(mocks.apiPost.mock.calls).toEqual([
      ['system/env', { AUXILIARY_AUTH_ENABLE: true }],
      ['site/auth', { params: { 'M-TEAM_API_KEY': 'key' }, site: 'm-team' }],
    ])

    mocks.apiPost.mockClear()
    seedValidStep(wizard, 3)
    vi.useFakeTimers()
    await resolveConnectivity(wizard.nextStep())
    expect(mocks.apiPost).toHaveBeenNthCalledWith(1, 'system/setting/Storages', [
      { config: {}, name: '本地存储', type: 'local' },
    ])
    expect(mocks.apiPost).toHaveBeenNthCalledWith(
      2,
      'system/setting/Directories',
      expect.arrayContaining([
        expect.objectContaining({
          download_path: '/downloads',
          library_path: '/media',
          overwrite_mode: 'never',
          transfer_type: 'link',
        }),
      ]),
    )
    expect(mocks.apiGet).toHaveBeenCalledWith('system/moduletest/FileManagerModule')
  })

  it('saves auxiliary authentication without a site request when no site is selected', async () => {
    const wizard = resetWizard()
    seedValidStep(wizard, 2)
    wizard.wizardData.value.siteAuth.auxiliaryAuthEnable = true

    await expect(wizard.nextStep()).resolves.toBe(true)

    expect(mocks.apiPost.mock.calls).toEqual([['system/env', { AUXILIARY_AUTH_ENABLE: true }]])
  })

  it.each([
    [4, 'system/setting/Downloaders', 'system/moduletest/QbittorrentModule'],
    [5, 'system/setting/MediaServers', 'system/moduletest/EmbyModule'],
    [6, 'system/setting/Notifications', 'system/moduletest/TelegramModule'],
  ])('saves and tests step %i before advancing', async (step, saveEndpoint, testEndpoint) => {
    vi.useFakeTimers()
    const wizard = resetWizard()
    seedValidStep(wizard, step)

    await expect(resolveConnectivity(wizard.nextStep())).resolves.toBe(true)

    expect(mocks.apiPost).toHaveBeenCalledWith(saveEndpoint, expect.any(Array))
    expect(mocks.apiGet).toHaveBeenCalledWith(testEndpoint)
    expect(wizard.currentStep.value).toBe(step + 1)
  })

  it('skips optional service writes and tests when no service is selected', async () => {
    const wizard = resetWizard()

    for (const step of [4, 5, 6]) {
      wizard.currentStep.value = step
      await expect(wizard.nextStep()).resolves.toBe(true)
    }

    expect(mocks.apiPost).not.toHaveBeenCalled()
    expect(mocks.apiGet).not.toHaveBeenCalled()
    expect(wizard.currentStep.value).toBe(7)
  })

  it('saves the full agent environment mapping', async () => {
    const wizard = resetWizard()
    seedValidStep(wizard, 7)
    Object.assign(wizard.wizardData.value.agent, {
      apiKey: 'llm-key',
      enabled: true,
      global: true,
      model: 'deepseek-chat',
      provider: 'deepseek',
      recommendEnabled: true,
      retryTransfer: true,
    })

    await expect(wizard.nextStep()).resolves.toBe(true)

    expect(mocks.apiPost).toHaveBeenCalledWith(
      'system/env',
      expect.objectContaining({
        AI_AGENT_ENABLE: true,
        AI_AGENT_GLOBAL: true,
        AI_AGENT_RETRY_TRANSFER: true,
        AI_RECOMMEND_ENABLED: true,
        LLM_API_KEY: 'llm-key',
        LLM_MODEL: 'deepseek-chat',
        LLM_PROVIDER: 'deepseek',
      }),
    )
    expect(wizard.currentStep.value).toBe(8)
  })

  it('normalizes disabled agent payload values and invalid temperature', async () => {
    const wizard = resetWizard()
    seedValidStep(wizard, 7)
    Object.assign(wizard.wizardData.value.agent, {
      apiProtocol: '',
      audioInputProvider: '',
      audioOutputProvider: '',
      baseUrl: '',
      enabled: false,
      global: true,
      jobInterval: 15,
      retryTransfer: true,
      temperature: Number.NaN,
      verbose: true,
      webSearchMode: '',
    })

    await expect(wizard.nextStep()).resolves.toBe(true)

    expect(mocks.apiPost).toHaveBeenCalledWith(
      'system/env',
      expect.objectContaining({
        AI_AGENT_GLOBAL: false,
        AI_AGENT_JOB_INTERVAL: 0,
        AI_AGENT_RETRY_TRANSFER: false,
        AI_AGENT_VERBOSE: false,
        AUDIO_INPUT_PROVIDER: 'openai',
        AUDIO_OUTPUT_PROVIDER: 'openai',
        LLM_API_PROTOCOL: 'auto',
        LLM_BASE_URL: null,
        LLM_TEMPERATURE: 0.3,
        LLM_WEB_SEARCH_MODE: 'local',
      }),
    )
  })

  it('saves all preference rule groups before reporting the final step as saved', async () => {
    const wizard = resetWizard()
    seedValidStep(wizard, 8)
    wizard.wizardData.value.preferences.ruleSequences = [
      { category: '电影', media_type: '电影', name: '高画质', rule_string: '4K' },
      { category: '电视剧', media_type: '电视剧', name: '小体积', rule_string: '1080P' },
    ]

    await expect(wizard.nextStep()).resolves.toBe(true)

    expect(mocks.apiPost.mock.calls).toEqual([
      ['system/setting/UserFilterRuleGroups', wizard.wizardData.value.preferences.ruleSequences],
      ['system/setting/SubscribeFilterRuleGroups', ['高画质', '小体积']],
      ['system/setting/BestVersionFilterRuleGroups', ['高画质', '小体积']],
    ])
    expect(wizard.currentStep.value).toBe(8)
  })
})

describe('useSetupWizard failure and concurrency boundaries', () => {
  beforeEach(() => {
    mocks.apiGet.mockReset()
    mocks.apiPost.mockReset()
    mocks.apiPut.mockReset()
    mocks.routerPush.mockReset()
    mocks.toastError.mockReset()
    mocks.toastSuccess.mockReset()
    mocks.apiGet.mockResolvedValue(success())
    mocks.apiPost.mockResolvedValue(success())
    mocks.apiPut.mockResolvedValue(success())
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(console, 'log').mockImplementation(() => {})
    resetWizard()
  })

  it.each([
    ['business failure', businessFailure('保存被拒绝')],
    ['HTTP failure', new Error('offline')],
  ])('does not advance when a step save has a %s', async (_label, failure) => {
    const wizard = resetWizard()
    seedValidStep(wizard, 1)
    if (failure instanceof Error) mocks.apiPost.mockRejectedValueOnce(failure)
    else mocks.apiPost.mockResolvedValueOnce(failure)

    await expect(wizard.nextStep()).resolves.toBe(false)

    expect(wizard.currentStep.value).toBe(1)
    expect(mocks.toastError).toHaveBeenCalledWith('setupWizard.saveBasicSettingsFailed')
  })

  it.each([
    ['business failure', businessFailure('测试被拒绝')],
    ['HTTP failure', new Error('offline')],
  ])('does not advance when connectivity has a %s', async (_label, failure) => {
    vi.useFakeTimers()
    const wizard = resetWizard()
    seedValidStep(wizard, 4)
    if (failure instanceof Error) mocks.apiGet.mockRejectedValueOnce(failure)
    else mocks.apiGet.mockResolvedValueOnce(failure)

    await expect(resolveConnectivity(wizard.nextStep())).resolves.toBe(false)

    expect(wizard.currentStep.value).toBe(4)
    expect(wizard.connectivityTest.value).toMatchObject({
      isTesting: false,
      showResult: true,
      testResult: 'error',
    })
  })

  it('rejects unsupported connectivity types without calling a module endpoint', async () => {
    vi.useFakeTimers()
    const wizard = resetWizard()
    wizard.wizardData.value.downloader.type = 'unknown'
    await expect(resolveConnectivity(wizard.testConnectivity(4))).resolves.toBe(false)
    expect(mocks.apiGet).not.toHaveBeenCalled()
    expect(wizard.connectivityTest.value.testMessage).toBe('setupWizard.unsupportedDownloaderType:unknown')

    wizard.wizardData.value.mediaServer.type = 'unknown'
    await expect(resolveConnectivity(wizard.testConnectivity(5))).resolves.toBe(false)
    wizard.wizardData.value.notification.type = 'unknown'
    await expect(resolveConnectivity(wizard.testConnectivity(6))).resolves.toBe(false)
  })

  it('allows only one next action while the current save is pending', async () => {
    const pendingSave = deferred<ReturnType<typeof success>>()
    mocks.apiPost.mockReturnValue(pendingSave.promise)
    const wizard = resetWizard()
    seedValidStep(wizard, 1)

    const first = wizard.nextStep()
    const second = wizard.nextStep()
    expect(mocks.apiPost).toHaveBeenCalledTimes(1)

    pendingSave.resolve(success())
    await expect(Promise.all([first, second])).resolves.toEqual([true, false])
    expect(wizard.currentStep.value).toBe(2)
  })

  it('does not move backward while a next action is pending', async () => {
    const pendingSave = deferred<ReturnType<typeof success>>()
    mocks.apiPost.mockReturnValue(pendingSave.promise)
    const wizard = resetWizard()
    seedValidStep(wizard, 2)

    const next = wizard.nextStep()
    wizard.prevStep()
    expect(wizard.currentStep.value).toBe(2)

    pendingSave.resolve(success())
    await expect(next).resolves.toBe(true)
    expect(wizard.currentStep.value).toBe(3)
  })

  it('uses the starting-step snapshot when a save result arrives late', async () => {
    const pendingSave = deferred<ReturnType<typeof success>>()
    mocks.apiPost.mockReturnValue(pendingSave.promise)
    const wizard = resetWizard()
    seedValidStep(wizard, 2)

    const next = wizard.nextStep()
    wizard.currentStep.value = 6
    pendingSave.resolve(success())
    await expect(next).resolves.toBe(false)

    expect(wizard.currentStep.value).toBe(6)
    expect(mocks.apiGet).not.toHaveBeenCalled()
  })

  it.each([
    ['system/setting/UserFilterRuleGroups'],
    ['system/setting/SubscribeFilterRuleGroups'],
    ['system/setting/BestVersionFilterRuleGroups'],
  ])('does not complete when %s rejects its rule payload', async failingEndpoint => {
    mocks.apiPost.mockImplementation((endpoint: unknown) =>
      endpoint === failingEndpoint ? businessFailure('规则保存失败') : success(),
    )
    const wizard = resetWizard()
    seedValidStep(wizard, 8)
    wizard.wizardData.value.preferences.ruleSequences = [
      { category: '电影', media_type: '电影', name: '高画质', rule_string: '4K' },
    ]

    await wizard.completeWizard()

    expect(mocks.apiPost).not.toHaveBeenCalledWith('system/setting/SetupWizardState', '1')
    expect(mocks.routerPush).not.toHaveBeenCalled()
  })

  it('treats SetupWizardState as best-effort and still navigates after all required writes succeed', async () => {
    mocks.apiPost.mockImplementation((endpoint: unknown) =>
      endpoint === 'system/setting/SetupWizardState' ? businessFailure('状态保存失败') : success(),
    )
    const wizard = resetWizard()
    seedValidStep(wizard, 8)

    await wizard.completeWizard()

    expect(mocks.apiPost).toHaveBeenCalledWith('system/setting/SetupWizardState', '1')
    expect(mocks.toastSuccess).toHaveBeenCalledWith('setupWizard.completed')
    expect(mocks.routerPush).toHaveBeenCalledWith('/')
  })
})
