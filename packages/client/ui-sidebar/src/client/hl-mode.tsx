/**
 * HeightLab 2026-08-29（企业版 M3）：左侧边栏「个人 | 企业」模式切换。
 *
 * 交互（用户 2026-08-29 拍板）：
 * - 所有登录用户可见切换项（云端组织能力降级时隐藏）。
 * - 已属于组织的用户点击「企业」直接进入企业模式。
 * - 不属于组织的用户点击「企业」弹出邀请码输入，加入成功后切企业模式；
 *   失败留在个人版，可随时切回。
 *
 * 数据边界：组织归属权威在云端 Logto Organizations，经
 * GET /hl/org-context 与 POST /hl/org-join 访问；本组件只消费结果。
 * 选择持久化 localStorage（hl.mode / hl.mode.orgId）并广播
 * `hl:mode-changed`，品牌槽位插件与模板/专家数据层据此合并企业定制。
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
  const [loaded, setLoaded] = useState(false)
  const [degraded, setDegraded] = useState(false)
  const [joinOpen, setJoinOpen] = useState(false)
  const [code, setCode] = useState('')
  const [joining, setJoining] = useState(false)
  const [joinError, setJoinError] = useState('')

  useEffect(() => {
    let alive = true
    fetch('/hl/org-context', { signal: AbortSignal.timeout(8000) })
      .then(res => (res.ok ? res.json() : null))
      .then((data: { organizations?: HlOrgEntry[]; degraded?: boolean } | null) => {
        if (!alive) return
        if (data === null || !Array.isArray(data.organizations)) {
          setLoaded(true)
          return
        }
        setOrgs(data.organizations.filter(o => typeof o?.id === 'string' && o.id !== ''))
        setDegraded(data.degraded === true)
        setLoaded(true)
      })
      .catch(() => { if (alive) setLoaded(true) })
    return () => { alive = false }
  }, [])

  if (!loaded || degraded) return null

  const effectiveOrgId = orgs.some(o => o.id === sel.orgId) ? sel.orgId : (orgs[0]?.id ?? '')
  const enterpriseName = orgs.find(o => o.id === effectiveOrgId)?.name ?? ''

  const choose = (mode: HlMode) => {
    if (mode === 'enterprise' && orgs.length === 0) {
      setJoinOpen(true)
      setJoinError('')
      return
    }
    const orgId = mode === 'enterprise' ? effectiveOrgId : ''
    setSel({ mode, orgId })
    try {
      window.localStorage.setItem(LS_MODE, mode)
      window.localStorage.setItem(LS_ORG, orgId)
    } catch { /* 隐私模式等：仅内存态 */ }
    window.dispatchEvent(new CustomEvent('hl:mode-changed', { detail: { mode, orgId } }))
  }

  const join = async () => {
    if (code.trim() === '') {
      setJoinError('请输入企业邀请码')
      return
    }
    setJoining(true)
    setJoinError('')
    try {
      const res = await fetch('/hl/org-join', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ code: code.trim() }),
        signal: AbortSignal.timeout(10000),
      })
      const data = await res.json().catch(() => null) as {
        ok?: boolean
        org?: HlOrgEntry
        message?: string
      } | null
      if (!res.ok || data === null || data.ok !== true || !data.org?.id) {
        setJoinError(data?.message ?? '企业加入失败，请检查邀请码后重试。')
        return
      }
      const org = data.org
      setOrgs((prev) => {
        const next = prev.filter(o => o.id !== org.id)
        return [org, ...next]
      })
      setSel({ mode: 'enterprise', orgId: org.id })
      try {
        window.localStorage.setItem(LS_MODE, 'enterprise')
        window.localStorage.setItem(LS_ORG, org.id)
      } catch { /* ignore */ }
      setJoinOpen(false)
      setCode('')
      window.dispatchEvent(new CustomEvent('hl:mode-changed', { detail: { mode: 'enterprise', orgId: org.id } }))
    } catch {
      setJoinError('企业加入服务暂时不可用，请稍后重试。')
    } finally {
      setJoining(false)
    }
  }

  return (
    <div>
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
      {joinOpen && (
        <form
          className={css.hlJoinPanel}
          onSubmit={(e) => { e.preventDefault(); void join() }}
        >
          <label className={css.hlJoinLabel} htmlFor="hl-org-join-code">企业邀请码</label>
          <input
            id="hl-org-join-code"
            className={css.hlJoinInput}
            value={code}
            onChange={(e) => { setCode(e.target.value); setJoinError('') }}
            placeholder="输入邀请码"
            autoFocus
          />
          {joinError !== '' && <div className={css.hlJoinError}>{joinError}</div>}
          <div className={css.hlJoinActions}>
            <button
              type="button"
              className={css.hlJoinCancel}
              onClick={() => { setJoinOpen(false); setJoinError('') }}
            >
              取消
            </button>
            <button type="submit" className={css.hlJoinSubmit} disabled={joining}>
              {joining ? '加入中…' : '加入'}
            </button>
          </div>
        </form>
      )}
    </div>
  )
}
