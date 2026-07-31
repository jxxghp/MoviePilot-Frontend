import 'vue-router'

declare module 'vue-router' {
  interface RouteMeta {
    action?: string
    subject?: string
    keepAlive?: boolean
    keepAliveKey?: string
    /** 来源页面停用成本较高时，分阶段把目标页起始态交给 compositor。 */
    pagePresentationHandoff?: 'staged'
    layoutWrapperClasses?: string
    navActiveLink?: RouteLocationRaw
    requiresAuth?: boolean
    subType?: string
    hideFooter?: boolean
  }
}

// 支持动态导入远程模块
declare module '*' {
  import { DefineComponent } from 'vue'
  const component: DefineComponent<{}, {}, any>
  export default component
}
