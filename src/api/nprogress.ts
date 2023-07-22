import NProgress from 'nprogress'
import 'nprogress/nprogress.css'

export function configureNProgress() {
  NProgress.configure({
    showSpinner: false,
  })
}

export function startNProgress() {
  NProgress.start()
}

export function doneNProgress() {
  NProgress.done()
}
