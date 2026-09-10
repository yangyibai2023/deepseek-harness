/**
 * HeightLab：内容创作助手输入框选项（四个原生胶囊按钮）。
 *
 * 用户选中「内容创作专家」或 Colin 派发内容专家工作时显示：
 *  - 平台：小红书 / 抖音 / 公众号 / 视频号 / 朋友圈 / 官网·落地页 /
 *    邮件 / 办公文档 / 通用
 *  - 形式：笔记 / 口播脚本 / 情景剧脚本 / 教程脚本 / 带货脚本 / 文章 /
 *    广告语 / 标题 / 爆款拆解 / 周报 / 会议纪要 / PPT 大纲 / 邮件 / 通知 / 其他
 *  - 风格：油式文风 / 专业顾问 / 亲切朋友 / 官方正式 / 活泼年轻 /
 *    极简克制 / 故事化 / 不指定
 *  - 要求：长度 / 受众 / 配图 / 对标 / 补充说明（二级菜单）
 *
 * 一级为模块（右侧显示当前值+箭头）、二级为选项（选中带对勾），选择后菜单
 * 保持打开可继续调整，与图片/视频工具栏一致。结果写入用户内容偏好，
 * 由 dispatch 注入为「用户已选择」，模板「从聊天开始」通过
 * hl:set-content-options 同步到这里。
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import {
  IconChecklistOutline14, IconChevronDownOutline14, IconGlobeOutline14,
  IconListPenOutline16, IconSparkle16, Menu,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { MenuEntry } from '@deepseek-ai/dsh-client-ui-primitives'
import css from './ContentToolbar.module.css'

const CONTENT_CREATOR = 'content-creator'

type ContentPreference = {
  platform: string
  type: string
  tone: string
  length: string
  audience: string
  withImage: string
  reference: string
  extra: string
}

const DEFAULT_PREFERENCE: ContentPreference = {
  platform: 'general',
  type: 'other',
  tone: 'default',
  length: 'any',
  audience: 'any',
  withImage: 'text',
  reference: 'none',
  extra: '',
}

const PLATFORM_OPTIONS = [
  { id: 'pf:general', label: '通用' },
  { id: 'pf:xhs', label: '小红书' },
  { id: 'pf:douyin', label: '抖音' },
  { id: 'pf:gzh', label: '公众号' },
  { id: 'pf:shipinhao', label: '视频号' },
  { id: 'pf:moments', label: '朋友圈' },
  { id: 'pf:website', label: '官网·落地页' },
  { id: 'pf:email', label: '邮件' },
  { id: 'pf:office', label: '办公文档' },
] as const
const TYPE_OPTIONS = [
  { id: 'tp:note', label: '笔记' },
  { id: 'tp:talk', label: '口播脚本' },
  { id: 'tp:skit', label: '情景剧脚本' },
  { id: 'tp:tutorial', label: '教程脚本' },
  { id: 'tp:sales', label: '带货脚本' },
  { id: 'tp:article', label: '文章' },
  { id: 'tp:slogan', label: '广告语' },
  { id: 'tp:title', label: '标题' },
  { id: 'tp:deconstruct', label: '爆款拆解' },
  { id: 'tp:weekly', label: '周报' },
  { id: 'tp:minutes', label: '会议纪要' },
  { id: 'tp:ppt', label: 'PPT 大纲' },
  { id: 'tp:email', label: '邮件' },
  { id: 'tp:notice', label: '通知' },
  { id: 'tp:other', label: '其他' },
] as const
const STYLE_OPTIONS = [
  { id: 'st:oil-tone', label: '油式文风' },
  { id: 'st:advisor', label: '专业顾问' },
  { id: 'st:friendly', label: '亲切朋友' },
  { id: 'st:formal', label: '官方正式' },
  { id: 'st:youthful', label: '活泼年轻' },
  { id: 'st:minimal', label: '极简克制' },
  { id: 'st:story', label: '故事化' },
  { id: 'st:default', label: '不指定' },
] as const
const LENGTH_OPTIONS = [
  { id: 'len:any', label: '不指定' },
  { id: 'len:short', label: '短（<300 字）' },
  { id: 'len:medium', label: '中（300-800 字）' },
  { id: 'len:long', label: '长（>800 字）' },
] as const
const AUDIENCE_OPTIONS = [
  { id: 'aud:any', label: '不指定' },
  { id: 'aud:c', label: 'C 端用户' },
  { id: 'aud:b', label: 'B 端企业' },
  { id: 'aud:colleagues', label: '领导同事' },
] as const
const IMAGE_OPTIONS = [
  { id: 'img:text', label: '纯文案' },
  { id: 'img:with_image', label: '附配图建议' },
] as const
const REFERENCE_OPTIONS = [
  { id: 'ref:none', label: '不指定' },
  { id: 'ref:provide', label: '我提供参考链接' },
] as const

const LENGTH_LABELS: Record<string, string> = Object.fromEntries(
  LENGTH_OPTIONS.map(o => [o.id.slice('len:'.length), o.label]),
)
const AUDIENCE_LABELS: Record<string, string> = Object.fromEntries(
  AUDIENCE_OPTIONS.map(o => [o.id.slice('aud:'.length), o.label]),
)
const IMAGE_LABELS: Record<string, string> = Object.fromEntries(
  IMAGE_OPTIONS.map(o => [o.id.slice('img:'.length), o.label]),
)
const REFERENCE_LABELS: Record<string, string> = Object.fromEntries(
  REFERENCE_OPTIONS.map(o => [o.id.slice('ref:'.length), o.label]),
)

const VALID = {
  platform: PLATFORM_OPTIONS.map(o => o.id.slice('pf:'.length)),
  type: TYPE_OPTIONS.map(o => o.id.slice('tp:'.length)),
  tone: STYLE_OPTIONS.map(o => o.id.slice('st:'.length)),
  length: LENGTH_OPTIONS.map(o => o.id.slice('len:'.length)),
  audience: AUDIENCE_OPTIONS.map(o => o.id.slice('aud:'.length)),
  withImage: IMAGE_OPTIONS.map(o => o.id.slice('img:'.length)),
  reference: REFERENCE_OPTIONS.map(o => o.id.slice('ref:'.length)),
} as const

async function getPreference(): Promise<ContentPreference> {
  try {
    const res = await fetch('/hl/content-preference')
    if (!res.ok) return { ...DEFAULT_PREFERENCE }
    const data = await res.json() as Record<string, unknown>
    const pick = (key: keyof typeof VALID, value: unknown, fallback: string): string => {
      return typeof value === 'string' && VALID[key].includes(value) ? value : fallback
    }
    return {
      platform: pick('platform', data.platform, DEFAULT_PREFERENCE.platform),
      type: pick('type', data.type, DEFAULT_PREFERENCE.type),
      tone: pick('tone', data.tone, DEFAULT_PREFERENCE.tone),
      length: pick('length', data.length, DEFAULT_PREFERENCE.length),
      audience: pick('audience', data.audience, DEFAULT_PREFERENCE.audience),
      withImage: pick('withImage', data.withImage, DEFAULT_PREFERENCE.withImage),
      reference: pick('reference', data.reference, DEFAULT_PREFERENCE.reference),
      extra: typeof data.extra === 'string' ? data.extra.slice(0, 500) : '',
    }
  } catch {
    return { ...DEFAULT_PREFERENCE }
  }
}

async function savePreference(patch: Partial<ContentPreference>): Promise<boolean> {
  try {
    const res = await fetch('/hl/content-preference', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(patch),
    })
    return res.ok
  } catch {
    return false
  }
}

export function ContentToolbar() {
  const [visible, setVisible] = useState(false)
  const [pref, setPref] = useState<ContentPreference>({ ...DEFAULT_PREFERENCE })
  const [openMenu, setOpenMenu] = useState<'platform' | 'type' | 'style' | 'requirements' | null>(null)
  const barRef = useRef<HTMLDivElement | null>(null)
  const measureRef = useRef<HTMLDivElement | null>(null)
  const [compact, setCompact] = useState(false)

  // 显示条件：用户手动选中内容创作专家（body dataset）或 Colin 派发中（/hl/current-agent）
  useEffect(() => {
    let cancelled = false
    const tick = (): void => {
      const staged = document.body.dataset.hlAgentPreset
      fetch('/hl/current-agent')
        .then(response => response.json().catch(() => ({})))
        .then((data: { ok?: boolean; id?: string | null }) => {
          if (cancelled) return
          const working = data?.ok === true && typeof data.id === 'string' ? data.id : null
          setVisible(staged === CONTENT_CREATOR || working === CONTENT_CREATOR)
        })
        .catch(() => { if (!cancelled) setVisible(staged === CONTENT_CREATOR) })
    }
    tick()
    const timer = window.setInterval(tick, 1500)
    return () => { cancelled = true; window.clearInterval(timer) }
  }, [])

  // 显示后加载偏好
  useEffect(() => {
    if (!visible) return
    let cancelled = false
    void getPreference().then((next) => {
      if (!cancelled) setPref(next)
    })
    return () => { cancelled = true }
  }, [visible])

  // 空间自适应：与图片/视频工具栏同一套测量逻辑——左右两侧边栏同开且放不下时
  // 才切纯图标，其余场景保持「图标+文字」。
  const recalcCompact = useCallback((): void => {
    const host = barRef.current?.parentElement
    const measure = measureRef.current
    if (!host || !measure) return
    const hostWidth = host.getBoundingClientRect().width
    const measureWidth = measure.getBoundingClientRect().width
    if (hostWidth <= 60) return
    setCompact(measureWidth > hostWidth + 8)
  }, [])
  useEffect(() => {
    const frame = requestAnimationFrame(() => recalcCompact())
    const host = barRef.current?.parentElement
    if (!host || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(() => recalcCompact())
    observer.observe(host)
    const attributeObserver = new MutationObserver(() => recalcCompact())
    attributeObserver.observe(document.body, {
      attributes: true,
      subtree: true,
      attributeFilter: ['data-sidebar-collapsed', 'data-dsh-sidebar-collapsed'],
    })
    const onResize = (): void => recalcCompact()
    window.addEventListener('resize', onResize)
    return () => {
      cancelAnimationFrame(frame)
      observer.disconnect()
      attributeObserver.disconnect()
      window.removeEventListener('resize', onResize)
    }
  }, [recalcCompact, pref, openMenu])

  const updatePreference = useCallback((patch: Partial<ContentPreference>): void => {
    setPref(p => ({ ...p, ...patch }))
    void savePreference(patch)
  }, [])

  const onSelect = (id: string): void => {
    if (id.startsWith('pf:')) {
      updatePreference({ platform: id.slice(3) })
    } else if (id.startsWith('tp:')) {
      updatePreference({ type: id.slice(3) })
    } else if (id.startsWith('st:')) {
      updatePreference({ tone: id.slice(3) })
    } else if (id.startsWith('len:')) {
      updatePreference({ length: id.slice(4) })
    } else if (id.startsWith('aud:')) {
      updatePreference({ audience: id.slice(4) })
    } else if (id.startsWith('img:')) {
      updatePreference({ withImage: id.slice(4) })
    } else if (id.startsWith('ref:')) {
      updatePreference({ reference: id.slice(4) })
    }
    // req:extra 为输入行，onSelect 忽略（输入事件自行保存）。
  }

  // 模板「从聊天开始」激活内容选项：同步选择并保存，不填提示词。
  useEffect(() => {
    const onSetOptions = (event: Event): void => {
      const detail = (event as CustomEvent<Record<string, unknown>>).detail
      if (!detail || typeof detail !== 'object') return
      const patch: Partial<ContentPreference> = {}
      if (typeof detail.platform === 'string' && VALID.platform.includes(detail.platform)) {
        patch.platform = detail.platform
      }
      if (typeof detail.type === 'string' && VALID.type.includes(detail.type)) {
        patch.type = detail.type
      }
      if (typeof detail.style === 'string' && VALID.tone.includes(detail.style)) {
        patch.tone = detail.style
      }
      if (typeof detail.length === 'string' && VALID.length.includes(detail.length)) {
        patch.length = detail.length
      }
      if (typeof detail.audience === 'string' && VALID.audience.includes(detail.audience)) {
        patch.audience = detail.audience
      }
      if (typeof detail.withImage === 'string' && VALID.withImage.includes(detail.withImage)) {
        patch.withImage = detail.withImage
      }
      if (typeof detail.reference === 'string' && VALID.reference.includes(detail.reference)) {
        patch.reference = detail.reference
      }
      if (typeof detail.extra === 'string') {
        patch.extra = detail.extra.slice(0, 500)
      }
      if (Object.keys(patch).length === 0) return
      setPref(p => ({ ...p, ...patch }))
      void savePreference(patch)
    }
    const onSetTone = (event: Event): void => {
      const detail = (event as CustomEvent<{ tone?: unknown }>).detail
      const tone = detail?.tone
      if (tone !== 'oil-tone' && tone !== 'default') return
      setPref(p => ({ ...p, tone }))
      void savePreference({ tone })
    }
    window.addEventListener('hl:set-content-options', onSetOptions)
    window.addEventListener('hl:set-content-tone', onSetTone)
    return () => {
      window.removeEventListener('hl:set-content-options', onSetOptions)
      window.removeEventListener('hl:set-content-tone', onSetTone)
    }
  }, [])

  if (!visible) return null

  const requirementsItems: MenuEntry[] = [
    {
      id: 'r-length',
      label: <>长度 <span style={{ opacity: 0.6 }}>{LENGTH_LABELS[pref.length] ?? pref.length}</span></>,
      submenu: LENGTH_OPTIONS.map(o => ({ id: o.id, label: o.label })),
    },
    {
      id: 'r-audience',
      label: <>受众 <span style={{ opacity: 0.6 }}>{AUDIENCE_LABELS[pref.audience] ?? pref.audience}</span></>,
      submenu: AUDIENCE_OPTIONS.map(o => ({ id: o.id, label: o.label })),
    },
    {
      id: 'r-image',
      label: <>配图 <span style={{ opacity: 0.6 }}>{IMAGE_LABELS[pref.withImage] ?? pref.withImage}</span></>,
      submenu: IMAGE_OPTIONS.map(o => ({ id: o.id, label: o.label })),
    },
    {
      id: 'r-reference',
      label: <>对标 <span style={{ opacity: 0.6 }}>{REFERENCE_LABELS[pref.reference] ?? pref.reference}</span></>,
      submenu: REFERENCE_OPTIONS.map(o => ({ id: o.id, label: o.label })),
    },
    {
      id: 'r-extra',
      label: (
        <span className={css.extraWrap}>
          <input
            className={css.extraInput}
            value={pref.extra}
            placeholder="补充说明（选填）"
            maxLength={500}
            spellCheck={false}
            onClick={e => e.stopPropagation()}
            onMouseDown={e => e.stopPropagation()}
            onChange={(e) => {
              const value = e.target.value
              setPref(p => ({ ...p, extra: value }))
              void savePreference({ extra: value })
            }}
          />
        </span>
      ),
    },
  ]

  const trigger = (label: string, openState: boolean, onToggle: () => void, icon: ReactNode, fullName?: string) => (
    <button
      type="button"
      className={css.trigger}
      aria-expanded={openState}
      aria-haspopup="menu"
      title={fullName ?? label}
      aria-label={fullName ?? label}
      onClick={onToggle}
    >
      <span className={css.triggerIcon}>{icon}</span>
      <span className={css.triggerText}>{label}</span>
      <span className={`${css.chevron} ${openState ? css.chevronOpen : ''}`}>
        <IconChevronDownOutline14 />
      </span>
    </button>
  )

  const platformTrigger = trigger('平台', openMenu === 'platform', () => setOpenMenu(v => v === 'platform' ? null : 'platform'), <IconGlobeOutline14 />, '发布/使用平台')
  const typeTrigger = trigger('形式', openMenu === 'type', () => setOpenMenu(v => v === 'type' ? null : 'type'), <IconListPenOutline16 />, '内容类型')
  const styleTrigger = trigger('风格', openMenu === 'style', () => setOpenMenu(v => v === 'style' ? null : 'style'), <IconSparkle16 />, '写作风格')
  const requirementsTrigger = trigger('要求', openMenu === 'requirements', () => setOpenMenu(v => v === 'requirements' ? null : 'requirements'), <IconChecklistOutline14 />, '附加要求')

  return (
    <>
      <div ref={barRef} className={`${css.toolbar} ${compact ? css.compact : ''}`}>
        <Menu
          open={openMenu === 'platform'}
          onClose={() => setOpenMenu(null)}
          items={PLATFORM_OPTIONS.map(o => ({ id: o.id, label: o.label }))}
          selectedIds={[`pf:${pref.platform}`]}
          onSelect={onSelect}
          anchor={platformTrigger}
          portal
        />
        <Menu
          open={openMenu === 'type'}
          onClose={() => setOpenMenu(null)}
          items={TYPE_OPTIONS.map(o => ({ id: o.id, label: o.label }))}
          selectedIds={[`tp:${pref.type}`]}
          onSelect={onSelect}
          anchor={typeTrigger}
          portal
        />
        <Menu
          open={openMenu === 'style'}
          onClose={() => setOpenMenu(null)}
          items={STYLE_OPTIONS.map(o => ({ id: o.id, label: o.label }))}
          selectedIds={[`st:${pref.tone}`]}
          onSelect={onSelect}
          anchor={styleTrigger}
          portal
        />
        <Menu
          open={openMenu === 'requirements'}
          onClose={() => setOpenMenu(null)}
          items={requirementsItems}
          selectedIds={[
            `len:${pref.length}`,
            `aud:${pref.audience}`,
            `img:${pref.withImage}`,
            `ref:${pref.reference}`,
          ]}
          onSelect={onSelect}
          anchor={requirementsTrigger}
          portal
        />
      </div>
      <div ref={measureRef} className={`${css.toolbar} ${css.measure}`} aria-hidden>
        {platformTrigger}{typeTrigger}{styleTrigger}{requirementsTrigger}
      </div>
    </>
  )
}
