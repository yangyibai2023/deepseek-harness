/** O44（2026-11-09 用户拍板「插件管理挪到设置」）：设置页「插件管理」入口卡
 * ——说明 + 「打开插件管理」按钮（hl:open-panel 事件桥由 SidebarRoot 转发
 * selectPanel('plugins')，与实验室自动化卡同模式）。 */
import type { ReactNode } from 'react'

export interface PluginManagementEntryProps {
  close: () => void
}

export function PluginManagementEntry({ close }: PluginManagementEntryProps): ReactNode {
  const open = (): void => {
    window.dispatchEvent(new CustomEvent('hl:open-panel', { detail: { panelId: 'plugins' } }))
    close()
  }
  return (
    <div style={{ padding: '8px 0', display: 'flex', flexDirection: 'column', gap: 8 }}>
      <p style={{ margin: 0, fontSize: 13, lineHeight: '20px', color: 'var(--dsw-alias-label-secondary)' }}>
        插件市场、安装与启停管理已集中到独立面板——打开后可浏览、安装、启用或停用插件。
      </p>
      <button
        type="button"
        onClick={open}
        style={{
          alignSelf: 'flex-start',
          padding: '6px 14px',
          borderRadius: 6,
          border: '1px solid var(--dsw-alias-border-l3, #d9d9d9)',
          background: 'var(--dsw-alias-surface-primary, #fff)',
          color: 'var(--dsw-alias-label-primary, #1a1a1a)',
          fontSize: 12,
          cursor: 'pointer',
          fontFamily: 'inherit',
        }}
      >
        打开插件管理
      </button>
    </div>
  )
}
