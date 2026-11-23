import fs from 'node:fs'
import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'

const root = process.cwd()

describe('SDK 公开产物', () => {
  it('公开文件由唯一契约源生成，ESM 可在宿主源码之外加载', () => {
    execFileSync(process.execPath, ['scripts/build-plugin-sdk.mjs', '--check'], { cwd: root })
    const moduleUrl = pathToFileURL(path.join(root, 'public/plugin-sdk/v1/index.js')).href
    const output = execFileSync(
      process.execPath,
      [
        '--input-type=module',
        '-e',
        `import {PLUGIN_HOST_SDK_KEY, PLUGIN_HOST_SDK_VERSION} from ${JSON.stringify(moduleUrl)}; console.log(JSON.stringify([PLUGIN_HOST_SDK_KEY, PLUGIN_HOST_SDK_VERSION]));`,
      ],
      { encoding: 'utf8' },
    )
    expect(JSON.parse(output)).toEqual(['moviepilot:sdk', 1])
    expect(fs.readFileSync(path.join(root, 'public/plugin-sdk/v1/index.d.ts'), 'utf8')).not.toContain('@/')
  })

  it('插件可仅凭公开定义获得请求类型、能力查询及管理动作检查', () => {
    const filename = path.join(root, 'plugin-sdk-consumer.ts')
    const source = `
import type {PluginHostSDK, NativeSubscriptionAction} from './public/plugin-sdk/v1/index';
declare const sdk: PluginHostSDK;
const action: NativeSubscriptionAction = 'edit';
sdk.files?.select({kind: 'directory', multiple: true}).then(result => {
  if (result.success) result.data?.forEach(file => file.path.toUpperCase());
});
sdk.workflows?.manage({action: 'design', workflowId: 7});
sdk.environment?.subscribe(snapshot => snapshot.permissions.manage);
sdk.subscriptions?.createMusic?.({type: '音乐', media_source: 'musicbrainz', media_id: 'album', music_type: 'album'});
// @ts-expect-error 文件选择模式必须使用公开枚举。
sdk.files?.select({kind: 'folder'});
// @ts-expect-error 不公开任意外部事件连接地址参数。
sdk.events?.subscribe({url: 'https://example.invalid', onMessage: () => {}});
sdk.api.get<{list: string[]}>('plugin/demo/items').then(result => result.list.map(item => item.toUpperCase()));
if (sdk.supports('subscription.manage.edit')) sdk.subscriptions?.manage?.({action, subscriptionId: 7});
// @ts-expect-error 未定义的管理动作必须由公开类型拒绝。
const invalid: NativeSubscriptionAction = 'destroy';
// @ts-expect-error API 结果保留业务类型，不能误作 AxiosResponse。
sdk.api.get<{list: string[]}>('plugin/demo/items').then(result => result.data);
`
    const options: ts.CompilerOptions = {
      strict: true,
      noEmit: true,
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      types: [],
      skipLibCheck: true,
    }
    const host = ts.createCompilerHost(options)
    const original = host.getSourceFile.bind(host)
    host.getSourceFile = (file, ...args) =>
      file === filename ? ts.createSourceFile(file, source, options.target!) : original(file, ...args)
    const program = ts.createProgram([filename], options, host)
    const errors = ts.getPreEmitDiagnostics(program)
    expect(errors.map(error => ts.flattenDiagnosticMessageText(error.messageText, '\n'))).toEqual([])
  })
})
