/**
 * HeightLab 2026-08-28（企业版 M3）：左侧边栏「个人 | 企业」模式切换。
 *
 * 设计边界：
 * - 组织归属权威在云端 Logto Organizations，经桌面桥 GET /hl/org-context
 *   下发；本组件只消费，不做任何权限判断。
 * - 仅当调用者属于至少一个组织时渲染（个人账号/云端降级 = 个人版体验
 *   零变化，不渲染任何元素）。
 * - 选择持久化 localStorage（hl.mode / hl.mode.orgId）并广播
 *   `hl:mode-changed`，品牌槽位插件与模板/专家数据层据此合并企业定制。
 * - 折叠 rail 态不渲染（随宽态内容一起卸载）；多组织 M3 取第一组织，
 *   组织选择器随 M4 管理台落地。
 */
import { useEffect, useState } from 'react'
import clsx from 'clsx'
import css from './SidebarRoot.module.css'

export interface HlOrgEntry {
  id: string
  name: string
}

export type HlMode = 'personal' | 'enterprise'

const LS_MODE = 'hl.mode'
const LS_ORG = 'hl.mode.orgId'

export function readHlMode(): { mode: HlMode; orgId: string } {
  try {
    const mode = window.localStorage.getItem(LS_MODE)
    const orgId = window.localStorage.getItem(LS_ORG) ?? ''
    return { mode: mode === 'enterprise' ? 'enterprise' : 'personal', orgId }
  } catch {
    return { mode: 'personal', orgId: '' }
  }
}

export function HlModeSwitcher() {
  const [orgs, setOrgs] = useState<HlOrgEntry[]>([])
  const [sel, setSel] = useState(readHlMode)

  useEffect(() => {
    let alive = true
    fetch('/hl/org-context', { signal: AbortSignal.timeout(8000) })
      .then(res => (res.ok ? res.json() : null))
      .then((data: { organizations?: HlOrgEntry[] } | null) => {
        if (!alive || data === null || !Array.isArray(data.organizations)) return
        setOrgs(data.organizations.filter(o => typeof o?.id === 'string' && o.id !== ''))
      })
      .catch(() => { /* 云端不可用：保持个人版 */ })
    return () => { alive = false }
  }, [])

  if (orgs.length === 0) return null

  const effectiveOrgId = orgs.some(o => o.id === sel.orgId) ? sel.orgId : (orgs[0]?.id ?? '')
  const enterpriseName = orgs.find(o => o.id === effectiveOrgId)?.name ?? ''

  const choose = (mode: HlMode) => {
    const orgId = mode === 'enterprise' ? effectiveOrgId : ''
    setSel({ mode, orgId })
    try {
      window.localStorage.setItem(LS_MODE, mode)
      window.localStorage.setItem(LS_ORG, orgId)
    } catch { /* 隐私模式等：仅内存态 */ }
    window.dispatchEvent(new CustomEvent('hl:mode-changed', { detail: { mode, orgId } }))
  }

  return (
    <div className={css.hlModeRow} role="group" aria-label="模式切换">
      <button
        type="button"
        className={clsx(css.hlModeSeg, sel.mode === 'personal' && css.hlModeSegActive)}
        aria-pressed={sel.mode === 'personal'}
        onClick={() => { choose('personal') }}
      >
        个人
      </button>
      <button
        type="button"
        className={clsx(css.hlModeSeg, sel.mode === 'enterprise' && css.hlModeSegActive)}
        aria-pressed={sel.mode === 'enterprise'}
        title={enterpriseName}
        onClick={() => { choose('enterprise') }}
      >
        企业
      </button>
    </div>
  )
}
