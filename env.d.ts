import 'vue-router'

declare module 'vue-router' {
  interface RouteMeta {
    action?: string
    subject?: string
    keepAlive?: boolean
    keepAliveKey?: string
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
