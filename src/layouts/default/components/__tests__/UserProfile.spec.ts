import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const profile = readFileSync(resolve('src/layouts/default/components/UserProfile.vue'), 'utf8')
const styles = readFileSync(resolve('src/styles/themes/glass.scss'), 'utf8')

function getHandoffSelector() {
  const line = styles.split('\n').find(line => line.trim().startsWith('.v-overlay-container:has('))
  expect(line).toBeDefined()
  expect(styles).toContain(`${line}\n    display: none;\n  }`)
  return line!.trim().slice(0, -1).trim()
}

describe('UserProfile modal handoff', () => {
  it('identifies only the avatar menu and its three submenus as source surfaces', () => {
    const menus = profile.match(/<VMenu\b[^>]*>/g) ?? []
    expect(menus).toHaveLength(4)
    expect(menus.every(menu => /class="[^"]*\buser-profile-menu\b/.test(menu))).toBe(true)
  })

  it('retires source painting only while a dialog is actually active in the same overlay host', () => {
    const rule = getHandoffSelector()
    const host = document.createElement('div')
    host.className = 'v-overlay-container'
    host.innerHTML = '<div class="v-menu user-profile-menu"></div><div class="v-dialog"></div>'
    document.body.append(host)
    try {
      expect(document.querySelectorAll(rule!)).toHaveLength(0)
      host.querySelector('.v-dialog')!.classList.add('v-overlay--active')
      expect(document.querySelectorAll(rule!)).toHaveLength(1)
      expect(document.querySelector(rule!)?.classList.contains('user-profile-menu')).toBe(true)
      host.querySelector('.v-dialog')!.classList.remove('v-overlay--active')
      expect(document.querySelectorAll(rule!)).toHaveLength(0)
    } finally {
      host.remove()
    }
  })

  it('leaves dialog-owned menus and other overlay hosts alone', () => {
    const rule = getHandoffSelector()
    const root = document.createElement('div')
    root.innerHTML = `
      <div class="v-overlay-container"><div class="v-dialog v-overlay--active"></div><div class="v-menu"></div></div>
      <div class="v-overlay-container"><div class="v-menu user-profile-menu"></div></div>
    `
    document.body.append(root)
    try {
      expect(document.querySelectorAll(rule!)).toHaveLength(0)
    } finally {
      root.remove()
    }
  })
})
