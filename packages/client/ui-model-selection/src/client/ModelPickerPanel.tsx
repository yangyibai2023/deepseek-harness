/**
 * 模型选择面板（2026-10-22 用户拍板·照 ZCode 截图）。
 *
 * 结构（一级 → 二级，原地替换，不做侧边子菜单）：
 *
 *   根层                 进入某个供应商后
 *   ┌──────────────┐     ┌────────────────────┐
 *   │ ● BigModel API ›│  │ ‹ ● DeepSeek API   │
 *   │ ● DeepSeek  API ✓│  │ 模型                │
 *   │ ● Kimi      API ›│  │ deepseek-flash 视觉 ✓│
 *   │ …               │  │ deepseek-v4-pro     │
 *   │ ────────────    │  │ 思考强度      最高   │
 *   │ 管理模型         │  │ ●━━━━━━━━━━━━○     │
 *   └──────────────┘     └────────────────────┘
 *
 * 为什么要独立成组件、而不是继续用 `Menu`：
 *   · `Menu` 的数据模型是「扁平行 + 子菜单」，承载不了「原地换 pane」；
 *   · 更重要的是：侧边子菜单必须做横向方向判定（右不够翻左、底部对齐），
 *     那正是用户报的「其他那一项弹到别的地方」的根源。drill-down 原地换
 *     内容，根本没有横向定位，这类 bug 从结构上不可能发生。
 *
 * 但材质、玻璃、圆角、方向判定、限高这些都复用公共件：
 * `MenuSurface` + `useAnchoredPosition`（内部就是统一的 placeOverlay）。
 */
import { useEffect, useRef, useState, type ReactNode } from 'react'
import {
  IconCheckOutlineRegular, IconChevronRightOutlineRegular, MenuSurface,
  useAnchoredPosition, useDismissOnOutsidePointer,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { RefObject } from 'react'
import { EffortSlider } from './EffortSlider.tsx'
import css from './ModelPickerPanel.module.css'

/** 面板首帧先隐藏量尺寸，避免闪到屏幕外（与 Menu portal 同一做法）。 */
const MEASURE_STYLE = { visibility: 'hidden' as const, left: 0, top: 0 }

export interface ProviderEntry {
  readonly id: string
  readonly label: string
  /** 该供应商下的可选型号。 */
  readonly models: readonly ModelRowEntry[]
}

export interface ModelRowEntry {
  readonly id: string
  readonly label: string
  /** 是否为已选中的型号。 */
  readonly selected: boolean
  /** 尾注徽章（如「视觉」）。 */
  readonly badge?: string
}

export interface EffortEntry {
  readonly key: string
  readonly label: string
}

export function ModelPickerPanel({
  anchorRef, rootRef, open, onClose, ariaLabel, providers, currentProviderId,
  emptyLabel, onPickModel, effort, onPickEffort, effortLabel = '返回供应商列表', effortTitle,
  manageLabel, locked = false,
}: {
  readonly anchorRef: RefObject<HTMLElement | null>
  readonly rootRef: RefObject<HTMLElement | null>
  readonly open: boolean
  readonly onClose: () => void
  readonly ariaLabel: string
  readonly providers: readonly ProviderEntry[]
  /** 当前选中型号所属供应商（根层打勾）。 */
  readonly currentProviderId: string | undefined
  readonly emptyLabel: ReactNode
  readonly onPickModel: (providerId: string, modelId: string) => void
  /** 当前型号的思考档位；undefined 表示该型号不支持（不显示滑块）。 */
  readonly effort: { readonly options: readonly EffortEntry[]; readonly value: string | undefined; readonly label: string } | undefined
  readonly onPickEffort: (key: string) => void
  readonly effortTitle: string
  /** drill 头部返回按钮的 aria 文案；省略时用固定中文。 */
  readonly effortLabel?: string
  readonly manageLabel: string
  readonly locked?: boolean
}): ReactNode {
  const panelRef = useRef<HTMLDivElement | null>(null)
  const [drillId, setDrillId] = useState<string | null>(null)

  // 每次关闭都回到根层：下次打开是干净的一级。
  useEffect(() => {
    if (!open) setDrillId(null)
  }, [open])

  const position = useAnchoredPosition({
    open, anchorRef, panelRef, side: 'bottom', align: 'start', gap: 4, margin: 12,
  })
  useDismissOnOutsidePointer(rootRef, open, (next) => { if (!next) onClose() }, panelRef)

  if (!open) return null
  const drilled = drillId === null ? undefined : providers.find(entry => entry.id === drillId)

  return (
    <MenuSurface
      ref={panelRef}
      className={css.panel}
      style={position ?? MEASURE_STYLE}
      role="menu"
      aria-label={ariaLabel}
      onClick={(event) => { event.stopPropagation() }}
    >
      {drilled === undefined ? (
        <>
          {providers.length === 0 && (
            <div className={css.empty} role="presentation">{emptyLabel}</div>
          )}
          {providers.map(provider => (
            <button
              key={provider.id}
              type="button"
              role="menuitem"
              className={css.providerRow}
              onClick={() => { setDrillId(provider.id) }}
            >
              <span className={css.dot} aria-hidden="true" />
              <span className={css.providerName}>{provider.label}</span>
              <span className={css.badge}>API</span>
              {provider.id === currentProviderId
                ? <IconCheckOutlineRegular className={css.check} size={14} />
                : <IconChevronRightOutlineRegular className={css.chevron} size={12} />}
            </button>
          ))}
          <div className={css.footer} role="presentation">{manageLabel}</div>
        </>
      ) : (
        <>
          <button
            type="button"
            className={css.drillHeader}
            aria-label={effortLabel}
            onClick={() => { setDrillId(null) }}
          >
            <span className={css.back} aria-hidden="true">‹</span>
            <span className={css.dot} aria-hidden="true" />
            <span className={css.providerName}>{drilled.label}</span>
            <span className={css.badge}>API</span>
          </button>
          <div className={css.sectionTitle} role="presentation">模型</div>
          {drilled.models.map(model => (
            <button
              key={model.id}
              type="button"
              role="menuitem"
              className={css.modelRow}
              aria-selected={model.selected}
              onClick={() => { onPickModel(drilled.id, model.id) }}
            >
              <span className={css.modelName}>{model.label}</span>
              {model.badge !== undefined && <span className={css.badge}>{model.badge}</span>}
              {model.selected && <IconCheckOutlineRegular className={css.check} size={14} />}
            </button>
          ))}
          {effort !== undefined && effort.options.length > 0 && (
            <>
              <div className={css.sectionTitle} role="presentation">
                <span>{effortTitle}</span>
                <span className={css.effortCurrent}>{effort.label}</span>
              </div>
              <EffortSlider
                options={effort.options}
                value={effort.value}
                onChange={onPickEffort}
                disabled={locked}
                ariaLabel={effortTitle}
              />
            </>
          )}
        </>
      )}
    </MenuSurface>
  )
}
