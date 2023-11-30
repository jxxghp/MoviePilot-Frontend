// 请求和获取剪切板内容
export async function getClipboardContent() {
  try {
    return await navigator.clipboard.readText()
  }
  catch (error) {
    console.error('Unable to read clipboard using navigator.clipboard:', error)

    // Fallback for older browsers or non-secure context
    const input = document.createElement('input')
    document.body.appendChild(input)
    input.select()
    document.execCommand('paste')
    const content = input.value
    document.body.removeChild(input)
    return content
  }
}

// 将内容复制到剪切板，兼容非安全域场景
export async function copyToClipboard(content: string) {
  try {
    await navigator.clipboard.writeText(content)
  }
  catch (error) {
    console.error('Unable to write to clipboard using navigator.clipboard:', error)

    // Fallback for older browsers or non-secure context
    const input = document.createElement('input')
    input.value = content
    document.body.appendChild(input)
    input.select()
    document.execCommand('copy')
    document.body.removeChild(input)
  }
}
