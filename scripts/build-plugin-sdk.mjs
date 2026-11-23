/** 从宿主的唯一契约源生成可供插件下载的 ESM 和类型定义。 */
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

const root = fileURLToPath(new URL('../', import.meta.url))
const output = path.join(root, 'public/plugin-sdk/v1')
const check = process.argv.includes('--check')
const source = await fs.readFile(path.join(root, 'src/sdk/plugin.ts'), 'utf8')
const agent = await fs.readFile(path.join(root, 'src/types/agentHost.ts'), 'utf8')
const compilerOptions = { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext }
const declarations = ts.transpileDeclaration(source, { compilerOptions, fileName: 'index.ts', reportDiagnostics: true })
const agentDeclarations = ts.transpileDeclaration(agent, {
  compilerOptions,
  fileName: 'agent.ts',
  reportDiagnostics: true,
})
const diagnostics = [...(declarations.diagnostics ?? []), ...(agentDeclarations.diagnostics ?? [])]
if (diagnostics.length)
  throw new Error(
    ts.formatDiagnosticsWithColorAndContext(diagnostics, {
      getCanonicalFileName: name => name,
      getCurrentDirectory: () => root,
      getNewLine: () => '\n',
    }),
  )
const banner = '// 此文件由 build:plugin-sdk 自动生成，请修改 src/sdk/plugin.ts 或 src/types/agentHost.ts。\n'
const files = {
  'index.js': ts.transpileModule(source, { compilerOptions }).outputText,
  'index.d.ts': declarations.outputText.replaceAll('../types/agentHost', './agent'),
  'agent.d.ts': agentDeclarations.outputText,
}
await fs.mkdir(output, { recursive: true })
for (const [name, contents] of Object.entries(files)) {
  const destination = path.join(output, name)
  const expected = banner + contents
  if (check) {
    if ((await fs.readFile(destination, 'utf8')) !== expected) throw new Error(`SDK 公开产物已过期：${name}`)
  } else await fs.writeFile(destination, expected)
}
console.log(check ? '插件 SDK 公开产物与契约源一致。' : '已生成 public/plugin-sdk/v1 的 ESM 与类型定义。')
