/**
 * 浏览器兼容性处理
 */

/**
 * 修复低版本Safari等浏览器数组不支持at函数的问题
 */
;(function fixArrayAt() {
  if (!Array.prototype.at) {
    Array.prototype.at = function (index: number) {
      if (index >= 0) {
        return this[index]
      } else {
        return this[this.length + index]
      }
    }
  }
})()
