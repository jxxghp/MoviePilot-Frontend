import { ref } from 'vue'

/** 全局系统重启状态，重启入口写入，离线探测与连接提示按此状态抑制。 */
const isRestarting = ref(false)

/** 管理 MoviePilot 系统重启的全局状态。 */
export function useSystemRestartStatus() {
  /** 标记系统进入重启流程（此后服务不可达属预期行为）。 */
  function startSystemRestart() {
    isRestarting.value = true
  }

  /** 结束重启流程，恢复常规连接状态提示。 */
  function finishSystemRestart() {
    isRestarting.value = false
  }

  return {
    isRestarting,
    startSystemRestart,
    finishSystemRestart,
  }
}