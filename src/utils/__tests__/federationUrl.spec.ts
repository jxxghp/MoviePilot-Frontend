import { resolveFederationRemoteUrl } from '@/utils/federationUrl'
import { describe, expect, it } from 'vitest'

describe('resolveFederationRemoteUrl', () => {
  const remotePath = '/plugin/file/example/frontend/dist/assets/remoteEntry.js'

  it.each([
    {
      name: 'Docker 根路径 HTTP 入口',
      apiBaseUrl: 'api/v1/',
      documentBaseUri: 'http://moviepilot.local/',
      expected: 'http://moviepilot.local/api/v1/plugin/file/example/frontend/dist/assets/remoteEntry.js',
    },
    {
      name: 'Docker 或 local_setup 的无尾斜杠 fallback 入口',
      apiBaseUrl: 'api/v1/',
      documentBaseUri: 'http://moviepilot.local/dashboard',
      expected: 'http://moviepilot.local/api/v1/plugin/file/example/frontend/dist/assets/remoteEntry.js',
    },
    {
      name: 'HTTPS 反向代理入口',
      apiBaseUrl: 'api/v1/',
      documentBaseUri: 'https://moviepilot.example.com/dashboard',
      expected: 'https://moviepilot.example.com/api/v1/plugin/file/example/frontend/dist/assets/remoteEntry.js',
    },
    {
      name: '反向代理子路径入口',
      apiBaseUrl: 'api/v1/',
      documentBaseUri: 'https://moviepilot.example.com/mp/',
      expected: 'https://moviepilot.example.com/mp/api/v1/plugin/file/example/frontend/dist/assets/remoteEntry.js',
    },
    {
      name: '根路径 API 配置',
      apiBaseUrl: '/api/v1/',
      documentBaseUri: 'https://moviepilot.example.com/mp/',
      expected: 'https://moviepilot.example.com/api/v1/plugin/file/example/frontend/dist/assets/remoteEntry.js',
    },
    {
      name: '完整跨域 API 配置',
      apiBaseUrl: 'https://api.example.com/api/v1',
      documentBaseUri: 'http://moviepilot.local/dashboard',
      expected: 'https://api.example.com/api/v1/plugin/file/example/frontend/dist/assets/remoteEntry.js',
    },
  ])('$name', ({ apiBaseUrl, documentBaseUri, expected }) => {
    expect(resolveFederationRemoteUrl(remotePath, apiBaseUrl, documentBaseUri)).toBe(expected)
  })
})
