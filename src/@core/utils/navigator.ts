// 请求和获取剪贴板内容
export async function getClipboardContent() {
  if (navigator.clipboard && window.isSecureContext) {
    return await navigator.clipboard.readText()
  }
  else {
    const input = document.createElement('textarea')
    document.body.appendChild(input)
    input.select()
    document.execCommand('paste')
    const content = input.value
    document.body.removeChild(input)
    return content
  }
}

// 将内容复制到剪贴板，兼容非安全域场景
export async function copyToClipboard(content: string) {
  if (navigator.clipboard && window.isSecureContext) {
    await navigator.clipboard.writeText(content)
  }
  else {
    const input = document.createElement('textarea')
    input.value = content
    document.body.appendChild(input)
    input.select()
    document.execCommand('copy')
    document.body.removeChild(input)
  }
}
