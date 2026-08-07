import MarkdownIt from 'markdown-it'
import mdLinkAttributes from 'markdown-it-link-attributes'

const agentMarkdown = new MarkdownIt({
  html: false,
  breaks: true,
  linkify: true,
  typographer: true,
})

agentMarkdown.use(mdLinkAttributes, {
  attrs: {
    target: '_blank',
    rel: 'noopener noreferrer',
  },
})

// Agent 内容来自模型和工具输出，禁用原始 HTML 后统一转换为可展示 Markdown。
export function renderAgentMarkdown(content: string) {
  return content ? agentMarkdown.render(content) : ''
}
