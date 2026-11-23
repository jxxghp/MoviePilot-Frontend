import { defineAsyncComponent, defineComponent, h, shallowRef, type Component } from 'vue'
import RemoteComponentError from '@/components/misc/RemoteComponentError.vue'
import RemoteComponentLoading from '@/components/misc/RemoteComponentLoading.vue'

/** 为联邦弹窗提供加载超时和原地重试，重新创建包装器以清除 Vue 的失败状态。 */
export function useRetryableRemoteComponent(loader: () => Promise<Component>) {
  /** 用户重试时保留弹窗及表单状态，只重新加载远程组件。 */
  function retry() {
    component.value = createComponent()
  }

  /** 每次加载使用独立错误态，超时后仍允许迟到的成功结果正常显示。 */
  function createComponent() {
    return defineAsyncComponent({
      loader,
      loadingComponent: RemoteComponentLoading,
      errorComponent: defineComponent({
        setup: () => () => h(RemoteComponentError, { retry }),
      }),
      timeout: 20000,
    })
  }

  const component = shallowRef<Component>(createComponent())
  return component
}
