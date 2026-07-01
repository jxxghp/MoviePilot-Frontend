import type { ComponentPublicInstance, Ref } from 'vue'
import { gsap, useGsapMotionDisabled } from '@/composables/useGsapMotion'

// 整理弹窗（ReorganizeDialog）的动画编排 composable。
// 把原先内联在 .vue 里的 3 条 timeline、目标解析、reduce-motion 守卫与清理逻辑
// 集中到此处，业务组件只需保留 refs 并调用暴露出的命令式 API。
//
// 这是纯结构抽取——动画的目标、时序与观感与重构前保持一致。

const MOTION_CLEAR_PROPS = 'opacity,visibility,transform,willChange'

const PREVIEW_MOTION_TARGET_SELECTOR = [
  '.reorganize-preview-pane__loading',
  '.preview-note',
  '.preview-overview-card',
  '.preview-custom-words__item',
  '.preview-file-row',
  '.preview-file-row__card',
  '.preview-file-row__arrow',
  '.reorganize-preview-list__empty',
  '.reorganize-preview-pane__pagination',
].join(', ')

export interface ReorganizeDialogMotionContext {
  cardRef: Ref<HTMLElement | ComponentPublicInstance | null>
  previewPaneRef: Ref<HTMLElement | null>
  previewVisible: Ref<boolean>
  previewLoading: Ref<boolean>
  previewLoaded: Ref<boolean>
  // 桌面断点（display.mdAndUp）以 getter 传入，避免 composable 直接耦合 vuetify。
  isDesktop: () => boolean
}

export function useReorganizeDialogMotion(context: ReorganizeDialogMotionContext) {
  const motionDisabled = useGsapMotionDisabled()

  let introTimeline: ReturnType<typeof gsap.timeline> | null = null
  let previewPaneTimeline: ReturnType<typeof gsap.timeline> | null = null
  let previewContentTimeline: ReturnType<typeof gsap.timeline> | null = null

  function resolveMotionElement(element: HTMLElement | ComponentPublicInstance | null) {
    if (!element || typeof HTMLElement === 'undefined') return null
    if (element instanceof HTMLElement) return element

    return element.$el instanceof HTMLElement ? element.$el : null
  }

  function getCardElement() {
    return resolveMotionElement(context.cardRef.value)
  }

  function isVisibleMotionElement(element: HTMLElement) {
    return element.offsetParent !== null || element.getClientRects().length > 0
  }

  function getVisibleMotionElements(root: HTMLElement, selector: string) {
    return Array.from(root.querySelectorAll<HTMLElement>(selector)).filter(isVisibleMotionElement)
  }

  function setMotionTargetsVisible(targets: Element[]) {
    if (!targets.length) return

    gsap.set(targets, {
      autoAlpha: 1,
      clearProps: MOTION_CLEAR_PROPS,
      scale: 1,
      x: 0,
      y: 0,
    })
  }

  function clearMotionTargets(targets: Element[]) {
    if (!targets.length) return
    gsap.set(targets, { clearProps: MOTION_CLEAR_PROPS })
  }

  function getPreviewMotionTargets(previewPaneElement: HTMLElement) {
    return Array.from(previewPaneElement.querySelectorAll<HTMLElement>(PREVIEW_MOTION_TARGET_SELECTOR))
  }

  // 各 play 函数的公共前缀：先杀掉旧补间；reduce-motion 时直接可见并返回 false 短路。
  function beginMotion(targets: Element[]) {
    gsap.killTweensOf(targets)

    if (motionDisabled.value) {
      setMotionTargetsVisible(targets)
      return false
    }

    return true
  }

  function resetPreview() {
    previewPaneTimeline?.kill()
    previewPaneTimeline = null
    previewContentTimeline?.kill()
    previewContentTimeline = null

    const previewPaneElement = context.previewPaneRef.value
    if (!previewPaneElement) return

    const motionTargets = [previewPaneElement, ...getPreviewMotionTargets(previewPaneElement)]
    gsap.killTweensOf(motionTargets)
    clearMotionTargets(motionTargets)
  }

  function playIntro() {
    const cardElement = getCardElement()
    if (!cardElement) return

    const headerElement = cardElement.querySelector<HTMLElement>('.reorganize-motion-header')
    const stepElements = getVisibleMotionElements(cardElement, '.reorganize-motion-step')
    const actionElement = cardElement.querySelector<HTMLElement>('.reorganize-motion-actions')
    const contentTargets = [headerElement, ...stepElements, actionElement].filter(Boolean) as HTMLElement[]
    const motionTargets = [cardElement, ...contentTargets]

    introTimeline?.kill()

    if (!beginMotion(motionTargets)) return

    gsap.set(cardElement, {
      autoAlpha: 0,
      scale: 0.992,
      transformOrigin: '50% 0%',
      willChange: 'opacity, transform',
      y: 10,
    })
    gsap.set(contentTargets, {
      autoAlpha: 0,
      scale: 0.99,
      willChange: 'opacity, transform',
      y: 14,
    })

    introTimeline = gsap.timeline({
      defaults: { ease: 'power3.out' },
      onComplete: () => {
        clearMotionTargets(motionTargets)
        introTimeline = null
      },
    })

    introTimeline
      .to(cardElement, {
        autoAlpha: 1,
        duration: 0.24,
        scale: 1,
        y: 0,
      })
      .to(
        contentTargets,
        {
          autoAlpha: 1,
          duration: 0.32,
          scale: 1,
          stagger: {
            each: 0.045,
            from: 'start',
          },
          y: 0,
        },
        '<0.04',
      )
  }

  function playEpisodeFields() {
    const cardElement = getCardElement()
    const episodeStepElement = cardElement?.querySelector<HTMLElement>('.reorganize-motion-step--episode')
    if (!episodeStepElement || !isVisibleMotionElement(episodeStepElement)) return

    const fieldElements = getVisibleMotionElements(episodeStepElement, '.reorganize-motion-field')
    const targets = fieldElements.length ? fieldElements : [episodeStepElement]

    if (!beginMotion(targets)) return

    gsap.fromTo(
      targets,
      {
        autoAlpha: 0,
        scale: 0.99,
        willChange: 'opacity, transform',
        y: 8,
      },
      {
        autoAlpha: 1,
        clearProps: MOTION_CLEAR_PROPS,
        duration: 0.24,
        ease: 'power3.out',
        overwrite: true,
        scale: 1,
        stagger: {
          each: 0.035,
          from: 'start',
        },
        y: 0,
      },
    )
  }

  function playPreviewPane() {
    const previewPaneElement = context.previewPaneRef.value
    if (!previewPaneElement || !context.previewVisible.value || !isVisibleMotionElement(previewPaneElement)) return

    previewPaneTimeline?.kill()

    if (!beginMotion([previewPaneElement])) return

    previewPaneTimeline = gsap.timeline({
      defaults: { ease: 'power3.out' },
      onComplete: () => {
        clearMotionTargets([previewPaneElement])
        previewPaneTimeline = null
      },
    })

    previewPaneTimeline.fromTo(
      previewPaneElement,
      {
        autoAlpha: 0,
        scale: 0.992,
        willChange: 'opacity, transform',
        x: context.isDesktop() ? 22 : 0,
        y: context.isDesktop() ? 0 : 12,
      },
      {
        autoAlpha: 1,
        duration: 0.28,
        scale: 1,
        x: 0,
        y: 0,
      },
    )
  }

  function getPreviewFlowPartOffset(element: HTMLElement) {
    if (element.classList.contains('preview-file-row__card--source')) return -10
    if (element.classList.contains('preview-file-row__card--target')) return 10
    return 0
  }

  function playPreviewLoading() {
    const previewPaneElement = context.previewPaneRef.value
    const loadingElement = previewPaneElement?.querySelector<HTMLElement>('.reorganize-preview-pane__loading')
    if (!loadingElement || !context.previewVisible.value || !context.previewLoading.value) return

    if (!beginMotion([loadingElement])) return

    gsap.fromTo(
      loadingElement,
      {
        autoAlpha: 0,
        willChange: 'opacity, transform',
        y: 8,
      },
      {
        autoAlpha: 1,
        clearProps: MOTION_CLEAR_PROPS,
        duration: 0.22,
        ease: 'power3.out',
        overwrite: true,
        y: 0,
      },
    )
  }

  function playPreviewRows() {
    const previewPaneElement = context.previewPaneRef.value
    if (!previewPaneElement || !context.previewVisible.value || !context.previewLoaded.value) return

    const summaryTargets = getVisibleMotionElements(
      previewPaneElement,
      '.preview-note, .preview-overview-card, .preview-custom-words__item',
    )
    const rowElements = getVisibleMotionElements(previewPaneElement, '.preview-file-row')
    const emptyElement = previewPaneElement.querySelector<HTMLElement>('.reorganize-preview-list__empty')
    const paginationElement = previewPaneElement.querySelector<HTMLElement>('.reorganize-preview-pane__pagination')
    const visibleEmptyTargets = emptyElement && isVisibleMotionElement(emptyElement) ? [emptyElement] : []
    const visiblePaginationTargets =
      paginationElement && isVisibleMotionElement(paginationElement) ? [paginationElement] : []
    const flowPartElements = rowElements.flatMap(row =>
      Array.from(
        row.querySelectorAll<HTMLElement>(
          '.preview-file-row__card--source, .preview-file-row__arrow, .preview-file-row__card--target',
        ),
      ),
    )
    const motionTargets = [
      ...summaryTargets,
      ...rowElements,
      ...flowPartElements,
      ...visibleEmptyTargets,
      ...visiblePaginationTargets,
    ]
    if (!motionTargets.length) return

    previewContentTimeline?.kill()

    if (!beginMotion(motionTargets)) return

    previewContentTimeline = gsap.timeline({
      defaults: { ease: 'power3.out' },
      onComplete: () => {
        clearMotionTargets(motionTargets)
        previewContentTimeline = null
      },
    })

    if (summaryTargets.length) {
      previewContentTimeline.fromTo(
        summaryTargets,
        {
          autoAlpha: 0,
          scale: 0.99,
          willChange: 'opacity, transform',
          y: 8,
        },
        {
          autoAlpha: 1,
          duration: 0.24,
          scale: 1,
          stagger: {
            each: 0.025,
            from: 'start',
          },
          y: 0,
        },
      )
    }

    if (rowElements.length) {
      gsap.set(rowElements, {
        autoAlpha: 0,
        scale: 0.995,
        willChange: 'opacity, transform',
        y: 10,
      })
      gsap.set(flowPartElements, {
        autoAlpha: 0,
        willChange: 'opacity, transform',
        x: (_index, target) => getPreviewFlowPartOffset(target as HTMLElement),
      })

      previewContentTimeline
        .to(
          rowElements,
          {
            autoAlpha: 1,
            duration: 0.3,
            scale: 1,
            stagger: {
              each: 0.04,
              from: 'start',
            },
            y: 0,
          },
          summaryTargets.length ? '<0.08' : 0,
        )
        .to(
          flowPartElements,
          {
            autoAlpha: 1,
            duration: 0.22,
            stagger: {
              each: 0.018,
              from: 'start',
            },
            x: 0,
          },
          '<0.02',
        )
    } else if (visibleEmptyTargets.length) {
      previewContentTimeline.fromTo(
        visibleEmptyTargets,
        {
          autoAlpha: 0,
          scale: 0.99,
          willChange: 'opacity, transform',
          y: 8,
        },
        {
          autoAlpha: 1,
          duration: 0.24,
          scale: 1,
          y: 0,
        },
        summaryTargets.length ? '<0.08' : 0,
      )
    }

    if (visiblePaginationTargets.length) {
      previewContentTimeline.fromTo(
        visiblePaginationTargets,
        {
          autoAlpha: 0,
          willChange: 'opacity, transform',
          y: 6,
        },
        {
          autoAlpha: 1,
          duration: 0.2,
          y: 0,
        },
        '<0.08',
      )
    }
  }

  function kill() {
    introTimeline?.kill()
    introTimeline = null
    previewPaneTimeline?.kill()
    previewPaneTimeline = null
    previewContentTimeline?.kill()
    previewContentTimeline = null

    const cardElement = getCardElement()
    if (!cardElement) return

    const motionTargets = [
      cardElement,
      ...Array.from(
        cardElement.querySelectorAll<HTMLElement>(
          [
            '.reorganize-motion-header',
            '.reorganize-motion-step',
            '.reorganize-motion-field',
            '.reorganize-motion-actions',
            '.reorganize-preview-pane',
            PREVIEW_MOTION_TARGET_SELECTOR,
          ].join(', '),
        ),
      ),
    ]

    gsap.killTweensOf(motionTargets)
    clearMotionTargets(motionTargets)
  }

  return {
    playIntro,
    playEpisodeFields,
    playPreviewPane,
    playPreviewLoading,
    playPreviewRows,
    resetPreview,
    kill,
  }
}
