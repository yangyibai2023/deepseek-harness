/** Preset selection settings: the roster, its default, mode help, a read-only view of each composition, and the Creator-mode entry. */
import type { ReactNode } from 'react'
import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import {
  Button, IconBrowseOutlineRegular, IconPlusOutlineRegular, Modal, Tag, Tooltip,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { ObservableSnapshot, SnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { AgentPresetSectionState } from './section-store.ts'
import { isBuiltInPreset, presetDisplayText } from './locales.ts'
import { requiresCodingTools } from './settings-store.ts'
import { PresetGuideDialog, presetGuide, trapPresetReaderTab, type PresetGuidePage } from './PresetGuideDialog.tsx'
import css from './AgentPresetSection.module.css'

/** HeightLab（2026-10-17 用户拍板）：Agent 管理卡片底部三控件隐藏开关——
   商业封装版不展示「模式说明 / 如何使用 / 查看」；恢复 = 改为 false。 */
// HeightLab 功能开关：boolean 标注宽化字面量（lint 两配置皆过），改 false 即恢复。
const HIDE_PRESET_CARD_TOOLS: boolean = true

/* ── O44（2026-11-08 用户拍板「智能体页 UI 与插件页一模一样」）：预设卡
 * 彩色渐变图标——与 ui-plugin-manager ITEM_ARTWORK / ui-conversation 创作中心
 * 同一套渐变语言（36×36 viewBox 固定调色板）。按 preset id 映射；未知预设
 * 走默认青蓝螺旋（ArtDefault 同款）。 */
const ART_SVG = { viewBox: '0 0 36 36', width: 36, height: 36, fill: 'none', xmlns: 'http://www.w3.org/2000/svg' } as const

/** 渐变 id 的 per-instance 前缀（多实例渲染防 url(#) 串扰）。 */
const useArtworkId = (): string => `hlap_${useId().replaceAll(':', '')}`

function ArtPresetDefault(): ReactNode {
  const uid = useId().replaceAll(':', '')
  return (
    <svg {...ART_SVG} aria-hidden="true">
      <circle cx="18" cy="15" r="8" stroke={`url(#hlap${uid}a)`} strokeWidth="2.6" />
      <path d="M13 26l10 6-4.5-6" fill={`url(#hlap${uid}b)`} />
      <defs>
        <linearGradient id={`hlap${uid}a`} x1="10" y1="7" x2="26" y2="23" gradientUnits="userSpaceOnUse">
          <stop stopColor="#41E1AC" /><stop offset="1" stopColor="#658EFF" />
        </linearGradient>
        <linearGradient id={`hlap${uid}b`} x1="13" y1="26" x2="23" y2="32" gradientUnits="userSpaceOnUse">
          <stop stopColor="#FF8FC7" /><stop offset="1" stopColor="#B14BD8" />
        </linearGradient>
      </defs>
    </svg>
  )
}

function ArtPresetChat(): ReactNode {
  const uid = useArtworkId()
  return (
    <svg {...ART_SVG} aria-hidden="true">
      <path d="M7.5 9.5h12a3.6 3.6 0 0 1 3.6 3.6v6.4a3.6 3.6 0 0 1-3.6 3.6H12l-4.5 3.6V23a3.6 3.6 0 0 1-3.6-3.6v-6.4A3.6 3.6 0 0 1 7.5 9.5Z" fill={`url(#hlap${uid}a)`} fillOpacity="0.92" />
      <path d="M25 13.5h3.2a3.6 3.6 0 0 1 3.6 3.6v5.2a3.6 3.6 0 0 1-3.6 3.6h-.6v2.8l-3.6-2.8h-1.4" fill={`url(#hlap${uid}b)`} fillOpacity="0.75" />
      <defs>
        <linearGradient id={`hlap${uid}a`} x1="7.5" y1="9.5" x2="23.1" y2="23.1" gradientUnits="userSpaceOnUse">
          <stop stopColor="#A797FC" /><stop offset="1" stopColor="#4561EE" />
        </linearGradient>
        <linearGradient id={`hlap${uid}b`} x1="25" y1="13.5" x2="33" y2="24" gradientUnits="userSpaceOnUse">
          <stop stopColor="#FF8FC7" /><stop offset="1" stopColor="#A23AE7" />
        </linearGradient>
      </defs>
    </svg>
  )
}

function ArtPresetCode(): ReactNode {
  const uid = useArtworkId()
  return (
    <svg {...ART_SVG} aria-hidden="true">
      <rect x="4.5" y="8" width="27" height="20" rx="3.4" fill={`url(#hlap${uid}a)`} fillOpacity="0.9" />
      <path d="M14 14.5 10.5 18l3.5 3.5M22 14.5l3.5 3.5L22 21.5" stroke="#FFFFFF" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      <defs>
        <linearGradient id={`hlap${uid}a`} x1="4.5" y1="8" x2="31.5" y2="28" gradientUnits="userSpaceOnUse">
          <stop stopColor="#679EFE" /><stop offset="1" stopColor="#3B5BE8" />
        </linearGradient>
      </defs>
    </svg>
  )
}

function ArtPresetSystem(): ReactNode {
  const uid = useArtworkId()
  return (
    <svg {...ART_SVG} aria-hidden="true">
      <rect x="6" y="6" width="24" height="24" rx="3.4" fill={`url(#hlap${uid}a)`} fillOpacity="0.9" />
      <path d="M12 12l4 4-4 4M18 20h6" stroke="#FFFFFF" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      <defs>
        <linearGradient id={`hlap${uid}a`} x1="6" y1="6" x2="30" y2="30" gradientUnits="userSpaceOnUse">
          <stop stopColor="#54ECE7" /><stop offset="1" stopColor="#2C7BD8" />
        </linearGradient>
      </defs>
    </svg>
  )
}

function ArtPresetVideo(): ReactNode {
  const uid = useArtworkId()
  return (
    <svg {...ART_SVG} aria-hidden="true">
      <rect x="5.5" y="10" width="25" height="17" rx="4" fill={`url(#hlap${uid}a)`} fillOpacity="0.9" />
      <path d="M15.5 16.4 22 18.5l-6.5 2.1v-4.2Z" fill="#FFFFFF" />
      <defs>
        <linearGradient id={`hlap${uid}a`} x1="5.5" y1="10" x2="30.5" y2="27" gradientUnits="userSpaceOnUse">
          <stop stopColor="#FF8FC7" /><stop offset="1" stopColor="#E23AA0" />
        </linearGradient>
      </defs>
    </svg>
  )
}

function ArtPresetContent(): ReactNode {
  const uid = useArtworkId()
  return (
    <svg {...ART_SVG} aria-hidden="true">
      <rect x="6" y="7" width="24" height="22" rx="3" fill={`url(#hlap${uid}a)`} fillOpacity="0.9" />
      <path d="M10 13h10M10 18h16M10 23h13" stroke="#FFFFFF" strokeOpacity="0.85" strokeWidth="2" strokeLinecap="round" />
      <defs>
        <linearGradient id={`hlap${uid}a`} x1="6" y1="7" x2="30" y2="29" gradientUnits="userSpaceOnUse">
          <stop stopColor="#45E7A4" /><stop offset="1" stopColor="#0E9888" />
        </linearGradient>
      </defs>
    </svg>
  )
}

function ArtPresetCreator(): ReactNode {
  const uid = useArtworkId()
  return (
    <svg {...ART_SVG} aria-hidden="true">
      <path d="M18 4.5a9.5 9.5 0 0 1 6 16.9c-1.2 1-2 2.2-2 3.6h-8c0-1.4-.8-2.6-2-3.6A9.5 9.5 0 0 1 18 4.5Z" fill={`url(#hlap${uid}a)`} fillOpacity="0.9" />
      <path d="M14.5 28h7M15.5 31h5" stroke="#B14BD8" strokeWidth="2.2" strokeLinecap="round" />
      <defs>
        <linearGradient id={`hlap${uid}a`} x1="8.5" y1="4.5" x2="24" y2="25" gradientUnits="userSpaceOnUse">
          <stop stopColor="#FFC24A" /><stop offset="1" stopColor="#F0503C" />
        </linearGradient>
      </defs>
    </svg>
  )
}

/** preset id → 渐变图标（内置六款逐一映射；未知/custom 走默认）。 */
const PRESET_ARTWORK: Record<string, () => ReactNode> = {
  cordis: ArtPresetCreator,
  ptc: ArtPresetCode,
  minimal: ArtPresetSystem,
  'video-producer': ArtPresetVideo,
  'content-creator': ArtPresetContent,
  'general-assistant': ArtPresetChat,
}

function presetArtwork(id: string): ReactNode {
  const Art = PRESET_ARTWORK[id] ?? ArtPresetDefault
  return <Art />
}

/** Settings actions and their shared controller state. */
export interface AgentPresetSectionInjected {
  hooks: {
    agentPresetSection: SnapshotStore<AgentPresetSectionState>
    /** Shared Coding Tools preference; off hides the built-in PTC and Minimal cards. */
    developerTools: ObservableSnapshot<boolean>
  }
  /** Stage the `cordis` preset and start a Creator-mode task; absent without a conversation flow. */
  startCreatorDraft?: () => void
  load: () => Promise<void>
  /** Open one preset's declared composition in the read-only viewer. */
  view: (id: string) => Promise<void>
  /** Close the read-only viewer. */
  closeView: () => void
  makeDefault: (id: string) => Promise<void>
}
/** Props assembled by the settings renderer. */
export type AgentPresetSectionProps = PropsRuntime<'settings.section'> & PropsLocale<'settings.agentPreset'> & InjectFace<AgentPresetSectionInjected>

function CardDescription({ text }: { text: string }): ReactNode {
  const ref = useRef<HTMLSpanElement | null>(null)
  const [truncated, setTruncated] = useState(false)
  useLayoutEffect(() => {
    const el = ref.current
    /* v8 ignore next -- the ref is attached before layout effects run. */
    if (el === null) return
    const measure = () => { setTruncated(el.scrollHeight > el.clientHeight) }
    measure()
    // Card width follows the settings pane, which resizes with the window.
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => { observer.disconnect() }
  }, [text])
  return (
    // Capped near the card's own width: the default half-viewport bubble would
    // spill a description out of the settings dialog and across the app behind it.
    <Tooltip label={text} side="bottom" delayMs={400} disabled={!truncated} maxWidth={360}>
      {/* The empty title stops the card body's native tooltip from climbing to
        this span: a cut-off description answers with one bubble, not two. */}
      <span ref={ref} className={css.cardDesc} title="">{text}</span>
    </Tooltip>
  )
}

/** Render the roster with its default, mode help, composition viewer, and the guidance to Creator mode.
 * @param props Settings actions, snapshot hooks and localized text.
 * @returns The preset settings section.
 */
export function AgentPresetSection({
  useAgentPresetSection, load, view, closeView, makeDefault, startCreatorDraft,
  close: closeSettings, useDeveloperTools, t,
}: AgentPresetSectionProps) {
  const state = useAgentPresetSection(value => value)
  const developerTools = useDeveloperTools(enabled => enabled)
  const [guide, setGuide] = useState<{
    content: NonNullable<ReturnType<typeof presetGuide>>
    page: PresetGuidePage
  } | null>(null)
  const viewTrigger = useRef<HTMLButtonElement | null>(null)
  const closeViewOnUnmount = useRef(closeView)
  useEffect(() => { void load() }, [load])
  useLayoutEffect(() => { closeViewOnUnmount.current = closeView }, [closeView])
  useEffect(() => () => { closeViewOnUnmount.current() }, [])
  const closeViewer = () => { closeView(); viewTrigger.current?.focus() }
  const viewed = state.view
  const viewedRow = viewed === null ? undefined : state.rows.find(row => row.id === viewed.id)
  const viewedTitle = viewed === null ? '' : viewedRow === undefined ? viewed.title : presetDisplayText(viewedRow, t).name
  // Creator mode authors presets in conversation; it needs the flow to land a
  // session in and the self-referential preset on the roster.
  const creator = startCreatorDraft !== undefined && state.rows.some(row => row.id === 'cordis') ? startCreatorDraft : undefined
  /* The custom group is where a preset of one's own appears, so its entry
     stays on screen even while the group is empty. */
  const creatorButton = creator === undefined
    ? null
    : (
      <button
        type="button"
        className={css.creatorButton}
        disabled={state.saving}
        onClick={() => { creator(); closeSettings() }}
      >
        <IconPlusOutlineRegular size={14} />
        {t('creatorDraft')}
      </button>
    )
  return <section className={css.section}>
    <h2 className={css.title}>{t('nav')}</h2>
    <p className={css.intro}>{t('sectionIntro')}</p>
    {state.error === null ? null : <p className={css.error} role="alert">{state.error}</p>}
    {([true, false] as const).map((builtIn) => {
      const rows = state.rows.filter(row => isBuiltInPreset(row) === builtIn
        && (developerTools || !requiresCodingTools(row)))
      const entry = builtIn ? null : creatorButton
      if (rows.length === 0 && entry === null) return null
      return <section key={String(builtIn)} className={css.group}>
        <h3 className={css.groupHead}>{t(builtIn ? 'builtInGroup' : 'customGroup')}</h3>
        {rows.length === 0 ? null : <ul className={css.cards}>
          {rows.map((row) => {
            const display = presetDisplayText(row, t)
            const help = presetGuide(row.id, builtIn ? 'system' : 'user')
            const selectionAction = row.broken !== undefined ? t('brokenBadge')
              : t(row.isDefault ? 'inUse' : 'setDefault')
            return <li key={row.id} data-agent-preset-id={row.id} className={[
              css.card, row.broken === undefined ? undefined : css.cardBroken,
              row.isDefault ? css.cardActive : undefined,
            ].filter(Boolean).join(' ')}>
              <button type="button" className={css.cardMain} aria-pressed={row.isDefault}
                disabled={row.isDefault || (row.broken === undefined && state.saving)}
                aria-disabled={row.broken !== undefined} aria-label={`${selectionAction}: ${display.name}`} title={selectionAction}
                onClick={() => { if (row.broken === undefined) void makeDefault(row.id) }}>
                {/* O44（用户拍板「彩色 logo」）：预设卡左侧彩色渐变图标列。 */}
                <span className={css.cardIcon} aria-hidden="true">{presetArtwork(row.id)}</span>
                <span className={css.cardHead}>
                  <span className={css.cardIdentity}>
                    <span className={css.cardName} title={display.name}>{display.name}</span>
                    {row.broken === undefined ? null : <span className={css.brokenBadge}>
                      {t('brokenBadge')}<span className={css.brokenTip} aria-hidden="true">{row.broken}</span>
                    </span>}
                    <Tag tone={row.isDefault ? 'solid' : 'outline'}>
                      {row.isDefault ? t('inUse') : t(builtIn ? 'builtInGroup' : 'customGroup')}
                    </Tag>
                  </span>
                  <code className={css.cardId} title={row.id}>{row.id}</code>
                </span>
                <CardDescription text={display.description ?? t('noDescription')} />
                {row.broken === undefined ? null : <span className={css.cardBrokenReason} role="alert">{row.broken}</span>}
              </button>
              {/* HeightLab 2026-10-17（0.4.1 定制回植）：卡片底部三控件
                  （模式说明 / 如何使用 / 查看）整体隐藏——商业封装版不给用户
                  暴露预设内部构成；代码保留（改为 false 短路即恢复）。
                  被 hidePresetCardTools 覆盖的变量：help/setGuide/view/viewTrigger。 */}
              {HIDE_PRESET_CARD_TOOLS ? null : (
                <div className={css.cardFoot}>
                  {help === undefined ? null : <div className={css.cardHelp}>
                    <Button variant="ghost" className={css.helpButton} aria-label={`${t('modeExplanation')}: ${display.name}`}
                      onClick={() => { setGuide({ content: help, page: 'explanation' }) }}>{t('modeExplanation')}</Button>
                    <Button variant="ghost" className={css.helpButton} aria-label={`${t('howToUse')}: ${display.name}`}
                      onClick={() => { setGuide({ content: help, page: 'usage' }) }}>{t('howToUse')}</Button>
                  </div>}
                  <button type="button" className={css.iconButton} data-tip={t('view')} aria-label={`${t('view')}: ${display.name}`}
                    onClick={(event) => { viewTrigger.current = event.currentTarget; void view(row.id) }}>
                    <IconBrowseOutlineRegular />
                  </button>
                </div>
              )}
            </li>
          })}
        </ul>}
        {entry}
      </section>
    })}
    {guide === null ? null : <PresetGuideDialog guide={guide.content} initialPage={guide.page} t={t} onClose={() => { setGuide(null) }} />}
    <Modal open={viewed !== null} onClose={closeViewer} closeLabel={t('close')}
      onKeyDownCapture={(event) => {
        if (event.key === 'Escape') {
          event.preventDefault()
          event.stopPropagation()
          closeViewer()
        } else trapPresetReaderTab(event)
      }}
      title={viewed === null ? '' : `${t('view')} · ${viewedTitle}`} className={css.dialog as string}
      footer={<Button variant="outline" autoFocus onClick={closeViewer}>{t('close')}</Button>}>
      {viewed === null ? null : <pre className={css.viewerCode}>{viewed.content}</pre>}
    </Modal>
  </section>
}
