// 请求和获取剪切板内容
export async function getClipboardContent() {
  return await navigator.clipboard.readText()
}

// 将内容复制到剪切板，兼容非安全域场景
export async function copyToClipboard(content: string) {
  if (navigator.clipboard && window.isSecureContext) {
    await navigator.clipboard.writeText(content)
  }
  else {
    const input = document.createElement('input')
    input.value = content
    document.body.appendChild(input)
    input.select()
    document.execCommand('copy')
    document.body.removeChild(input)
  }
}
