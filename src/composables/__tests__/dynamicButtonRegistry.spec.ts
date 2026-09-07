import { createDynamicButtonRegistry } from '@/composables/dynamicButtonRegistry'
import { describe, expect, it } from 'vitest'

function createButton(icon: string) {
  return {
    icon,
    action: () => undefined,
    show: true,
  }
}

describe('dynamicButtonRegistry', () => {
  it('keeps a newer page registration when an older owner unregisters late', () => {
    const registry = createDynamicButtonRegistry()

    registry.register(createButton('mdi-old'), 'old-page')
    registry.register(createButton('mdi-new'), 'new-page')
    registry.unregister('old-page')

    expect(registry.registration.value).toMatchObject({
      button: { icon: 'mdi-new' },
      ownerId: 'new-page',
    })

    registry.unregister('new-page')
    expect(registry.registration.value).toBeNull()
  })

  it('updates the same owner without changing the registration slot', () => {
    const registry = createDynamicButtonRegistry()

    registry.register(createButton('mdi-old'), 'page')
    registry.register(createButton('mdi-new'), 'page')

    expect(registry.registration.value).toMatchObject({
      button: { icon: 'mdi-new' },
      ownerId: 'page',
    })
  })

  it('preserves the unowned global bridge cleanup semantics', () => {
    const registry = createDynamicButtonRegistry()

    registry.register(createButton('mdi-legacy'))
    registry.unregister()

    expect(registry.registration.value).toBeNull()
  })
})
