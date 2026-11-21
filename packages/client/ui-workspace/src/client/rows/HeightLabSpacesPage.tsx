/**
 * HeightLab 共享空间页（2026-11-22 R3）——侧栏「共享空间」tab 的整页面板。
 *
 * 刻意做成空壳：vendor 只提供挂载容器与生命周期，空间列表/详情/聊天/
 * 接入本机全部 UI 由 web-plugin @heightlab/dsh-client-space-collab 接管
 * （hl:spaces-page-mount 事件携带容器；卸载发 hl:spaces-page-unmount）。
 * 好处：协作逻辑单点维护在插件里，vendor 无业务重复；与 WorkBuddy 的
 * 「空间」常驻侧栏形态对齐（用户拍板：独立面板，不要悬浮窗）。
 */
import { useEffect, useRef } from 'react'

export function HeightLabSpacesPage() {
  const mountRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = mountRef.current
    if (el === null) return
    window.dispatchEvent(new CustomEvent('hl:spaces-page-mount', { detail: { container: el } }))
    return () => {
      window.dispatchEvent(new CustomEvent('hl:spaces-page-unmount', { detail: { container: el } }))
    }
  }, [])
  return (
    <div
      ref={mountRef}
      data-hl-spaces-page='1'
      style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '6px 4px 12px', position: 'relative', zIndex: 5 }}
    />
  )
}
