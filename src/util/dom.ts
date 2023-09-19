export function removeEl(selector: string) {
  if (selector) {
    const el = document.querySelector(selector)
    el?.parentNode?.removeChild(el)
  }
}
