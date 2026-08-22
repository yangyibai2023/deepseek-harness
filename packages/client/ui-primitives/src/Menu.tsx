// Menu: minimal controlled dropdown (group-by pickers, project selectors).
// Default: pure CSS positioning relative to the anchor wrapper — no popper.
// Opt-in `portal` renders the list into document.body, fixed-positioned from
// the anchor rect, for anchors inside overflow-clipping containers (sidebar).
// The owner controls `open`; outside-click closing uses one document listener
// active only while open. Submenus open on hover/focus inside the same root.
// Entries also cover non-interactive `label` headings and `danger` rows.
// Lists keep 12px clearance to the viewport's top/bottom edges and scroll
// internally past that; submenu-bearing menus are exempt (see .scrollable).

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import { createPortal } from 'react-dom'
import clsx from 'clsx'
import { IconCheckOutline16, IconChevronRightOutline14 } from './icons/index.tsx'
import { usePointerGrace } from './pointer-grace.ts'
import css from './Menu.module.css'

/** Selectable row (optionally with a nested submenu). */
export interface MenuItem {
  id: string
  label: ReactNode
  /** Current value shown after the label (model-selector style cell). */
  value?: ReactNode
  disabled?: boolean
  /** Leading icon (figma .Menu_cell gap 8). */
  icon?: ReactNode
  /** Destructive row: error-colored text/icon and danger hover fill. */
  danger?: boolean
  /** Nested card opened to the right on hover/focus. */
  submenu?: readonly MenuItem[]
}

/** Hairline between item groups (not selectable). */
export interface MenuSeparator {
  type: 'separator'
  id: string
}

/** Non-interactive heading row above a group of items. */
export interface MenuLabel {
  type: 'label'
  id: string
  text: string
}

/** One primary-menu entry: a row, a separator, or a heading label. */
export type MenuEntry = MenuItem | MenuSeparator | MenuLabel

function isSeparator(entry: MenuEntry): entry is MenuSeparator {
  return 'type' in entry && entry.type === 'separator'
}

function isLabel(entry: MenuEntry): entry is MenuLabel {
  return 'type' in entry && entry.type === 'label'
}

/**
 * 递归二级/三级菜单卡片（HeightLab：分类 → 厂商 → 模型）。
 * 规则：一律向左弹出、默认向下展开（不越上边框），仅底部空间不足时向上翻；
 * 关闭交给根菜单的整体 hover 宽限，鼠标可自由跨级滑动。
 */
function SubmenuCard({
  items,
  selectedIds,
  onSelect,
  compact,
  anchorWrap,
  positionKey,
}: {
  items: readonly MenuItem[]
  selectedIds?: readonly string[] | undefined
  onSelect: (id: string) => void
  compact: boolean
  /** 打开本卡片的上一级行（用于上下翻转检测）。 */
  anchorWrap: { readonly current: HTMLDivElement | null }
  /** portal 列表定位变化时重新测量。 */
  positionKey: unknown
}) {
  const [openId, setOpenId] = useState<string | null>(null)
  const [flipUp, setFlipUp] = useState(false)
  const [fitHeight, setFitHeight] = useState<number | undefined>(undefined)
  const cardRef = useRef<HTMLDivElement | null>(null)
  const openRowRef = useRef<HTMLDivElement | null>(null)

  useLayoutEffect(() => {
    const el = cardRef.current
    const wrap = anchorWrap.current
    if (el === null || wrap === null) {
      setFlipUp((prev) => (prev ? false : prev))
      setFitHeight(undefined)
      return
    }
    const wr = wrap.getBoundingClientRect()
    // 固定高度 320px（CSS 已封顶），短列表用实际高度。
    const height = el.offsetHeight
    const M = 12
    const below = window.innerHeight - wr.bottom - M
    const above = wr.top - M
    const up = below < height ? (above >= height ? true : above >= below) : false
    const room = up ? above : below
    const next = height > room ? Math.max(room, 80) : undefined
    setFlipUp((prev) => (prev === up ? prev : up))
    setFitHeight((prev) => (prev === next ? prev : next))
  }, [openId, items, positionKey])

  return (
    <div
      ref={cardRef}
      className={clsx(css.submenu, compact && css.compactList, flipUp && css.submenuUp)}
      style={fitHeight === undefined ? undefined : { maxHeight: fitHeight }}
      role="menu"
    >
      {items.map((item) => {
        const hasSub = item.submenu !== undefined && item.submenu.length > 0
        const subOpen = hasSub && openId === item.id
        const selected = selectedIds?.includes(item.id) === true
        return (
          <div
            key={item.id}
            className={css.itemWrap}
            ref={(node) => {
              if (item.id === openId) openRowRef.current = node
            }}
            onMouseEnter={() => { setOpenId(hasSub ? item.id : null) }}
          >
            <button
              type="button"
              role="menuitem"
              className={clsx(css.item, selected && css.selected)}
              disabled={item.disabled}
              aria-haspopup={hasSub ? 'menu' : undefined}
              aria-expanded={hasSub ? subOpen : undefined}
              onClick={() => {
                if (hasSub) {
                  setOpenId(item.id)
                  return
                }
                onSelect(item.id)
              }}
            >
              {item.icon !== undefined && <span className={css.itemIcon}>{item.icon}</span>}
              <span className={css.itemLabel}>{item.label}</span>
              {hasSub && <IconChevronRightOutline14 className={css.subChevron} />}
              {selected && <IconCheckOutline16 className={css.check} />}
            </button>
            {subOpen && item.submenu !== undefined && (
              <SubmenuCard
                items={item.submenu}
                selectedIds={selectedIds}
                onSelect={onSelect}
                compact={compact}
                anchorWrap={openRowRef}
                positionKey={positionKey}
              />
            )}
          </div>
        )
      })}
    </div>
  )
}

/** Unplaced portal list: hidden but laid out at a fixed origin so offsetWidth/offsetHeight are real. */
const MEASURE_STYLE: CSSProperties = { visibility: 'hidden', left: 0, top: 0 }

/**
 * Render an anchored dropdown menu.
 * @param props.open - whether the list is showing (owner-controlled).
 * @param props.anchor - the trigger element (rendered in place).
 * @param props.items - selectable rows and optional separators.
 * @param props.selectedId - row shown as selected.
 * @param props.selectedIds - rows shown as selected when a menu contains independent option groups.
 * @param props.onSelect - row click callback (not called for disabled rows or submenu parents that only open children).
 * @param props.onClose - invoked on outside click or Escape.
 * @param props.align - list alignment against the anchor (default 'start').
 * @param props.side - open below (`bottom`, default) or above (`top`) the anchor.
 * @param props.portal - render the list into document.body, fixed-positioned
 * from the anchor rect (repositions on scroll/resize while open). Use when an
 * ancestor's overflow clipping would crop the in-place list; default false
 * keeps the pure-CSS in-place behavior.
 * @param props.closeOnPointerLeave - close the list once the pointer has left
 * both trigger and list for the pointer grace (default false keeps it open
 * until outside click/Escape/selection). The grace makes the 4px trigger->list
 * gap and a brief overshoot survivable; coming back cancels the close.
 * @param props.dense - reduce vertical row spacing without changing the standard typography or card width.
 * @param props.compact - use reduced menu typography and spacing.
 * @param props.getAnchorRect - portal mode only: supply the anchor rect
 * directly (e.g. from a host-owned trigger button) instead of measuring the
 * Menu's own wrapper span. Required when the wrapper isn't itself laid out at
 * the trigger (render-prop anchors, effect-positioned proxies — measuring the
 * wrapper there races the host's layout effects). Called on open and on every
 * scroll/resize; return null to skip placement for that frame.
 * @param props.footer - rows pinned below the scrolling items area, separated
 * by a hairline; they stay visible while the items above scroll.
 * @returns anchor wrapper with the conditional list.
 */
export function Menu({ open, anchor, items, selectedId, selectedIds, onSelect, onClose, align = 'start', side = 'bottom', portal = false, closeOnPointerLeave = false, dense = false, compact = false, getAnchorRect, footer, className }: {
  open: boolean
  anchor: ReactNode
  items: readonly MenuEntry[]
  footer?: readonly MenuEntry[]
  selectedId?: string | undefined
  selectedIds?: readonly string[] | undefined
  onSelect: (id: string) => void
  onClose: () => void
  align?: 'start' | 'end'
  side?: 'bottom' | 'top' | 'right'
  portal?: boolean
  closeOnPointerLeave?: boolean
  dense?: boolean
  compact?: boolean
  getAnchorRect?: () => DOMRect | null
  className?: string
}) {
  const rootRef = useRef<HTMLSpanElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const [openSubmenuId, setOpenSubmenuId] = useState<string | null>(null)
  const [fixedPos, setFixedPos] = useState<CSSProperties | null>(null)
  const topRowRef = useRef<HTMLDivElement | null>(null)
  const menuGraceRef = useRef<number | null>(null)
  const { arm: armClose, cancel: cancelClose } = usePointerGrace(onClose)

  /** 离开整个菜单后给一小段宽限，跨级/跨间隙滑动不会丢菜单。 */
  const scheduleMenuClose = (): void => {
    if (menuGraceRef.current !== null) window.clearTimeout(menuGraceRef.current)
    menuGraceRef.current = window.setTimeout(() => {
      setOpenSubmenuId(null)
      menuGraceRef.current = null
    }, 220)
  }

  const cancelMenuClose = (): void => {
    if (menuGraceRef.current !== null) {
      window.clearTimeout(menuGraceRef.current)
      menuGraceRef.current = null
    }
  }

  // Portal mode: fixed-position the list from the anchor rect before paint;
  // track the anchor while open (capture-phase scroll catches nested panes).
  // getAnchorRect trumps measuring the wrapper span: a child layout effect
  // runs before the parent's, so a wrapper the host positions in its own
  // effect measures stale here — the host callback owns the truth instead.
  useLayoutEffect(() => {
    if (!open || !portal) { setFixedPos(null); return }
    const place = () => {
      let r: DOMRect | null
      if (getAnchorRect !== undefined) {
        r = getAnchorRect()
      } else {
        /* v8 ignore next 2 -- the ref is attached before the layout effect runs and the listeners die with it. */
        r = rootRef.current?.getBoundingClientRect() ?? null
      }
      if (r === null) return
      const MARGIN = 12
      const vw = window.innerWidth
      const vh = window.innerHeight
      const listEl = listRef.current
      const lw = listEl?.offsetWidth ?? 0
      const lh = listEl?.offsetHeight ?? 0

      let x: number
      let y: number
      // HeightLab：底部空间不足时整张菜单向上弹出（输入框在窗口最下方时
      // 不再被底边裁掉）；上方也不足时才回到下方，交给滚动/夹紧处理。
      const belowRoom = r.bottom + 4 + lh <= vh - MARGIN
      const aboveRoom = r.top - lh - 4 >= MARGIN
      if (side === 'right') {
        x = r.right + 4
        y = r.top
      } else {
        x = align === 'start' ? r.left : r.right - lw
        y = side === 'bottom'
          ? (belowRoom || !aboveRoom ? r.bottom + 4 : r.top - lh - 4)
          : (aboveRoom || !belowRoom ? r.top - lh - 4 : r.bottom + 4)
      }

      if (lw > 0) x = Math.min(Math.max(x, MARGIN), vw - lw - MARGIN)
      if (lh > 0) y = Math.min(Math.max(y, MARGIN), vh - lh - MARGIN)

      setFixedPos({ left: x, top: y })
    }
    // First run measures the hidden pre-render (same commit as `open`), so
    // end/top alignment and clamping use real dimensions before anything
    // paints — no visible jump from a zero-size first guess.
    place()
    window.addEventListener('scroll', place, true)
    window.addEventListener('resize', place)
    return () => {
      window.removeEventListener('scroll', place, true)
      window.removeEventListener('resize', place)
    }
  }, [open, portal, align, side, getAnchorRect])

  useEffect(() => {
    if (!open) {
      setOpenSubmenuId(null)
      return
    }
    const onPointerDown = (e: PointerEvent) => {
      if (!(e.target instanceof Node)) return
      // The portaled list is outside the anchor subtree; check both.
      if (rootRef.current?.contains(e.target) === true) return
      if (listRef.current?.contains(e.target) === true) return
      onClose()
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open, onClose])

  // A close from selection/Escape/outside click outruns a pending grace close;
  // left armed it would shut a list reopened inside the grace window. Its own
  // effect, not the listener effect above: that one re-runs on every `onClose`
  // identity change and would cancel the grace mid-transit.
  useEffect(() => {
    if (!open) cancelClose()
  }, [open, cancelClose])

  useEffect(() => () => {
    if (menuGraceRef.current !== null) window.clearTimeout(menuGraceRef.current)
  }, [])

  // The submenu card is absolutely positioned outside the list box; the
  // scroll clip would crop it, so only submenu-free menus get the height cap.
  // （0.3.10 回归修复：二级/三级菜单改回就地绝对定位，避免 portal 在真实
  //   运行时无法弹出的问题；一级菜单的向上翻转/边界夹紧逻辑保留。）
  const scrollable = !items.some(entry => !isSeparator(entry) && !isLabel(entry) && entry.submenu !== undefined && entry.submenu.length > 0)

  const renderEntry = (entry: MenuEntry) => {
    if (isSeparator(entry)) {
      return <div key={entry.id} className={css.separator} role="separator" />
    }
    if (isLabel(entry)) {
      return <div key={entry.id} className={css.label} role="presentation">{entry.text}</div>
    }
    const hasSub = entry.submenu !== undefined && entry.submenu.length > 0
    const subOpen = hasSub && openSubmenuId === entry.id
    const selected = entry.id === selectedId || selectedIds?.includes(entry.id) === true
    return (
      <div
        key={entry.id}
        className={css.itemWrap}
        ref={(node) => {
          if (entry.id === openSubmenuId) topRowRef.current = node
        }}
        onMouseEnter={() => { setOpenSubmenuId(hasSub ? entry.id : null) }}
      >
        <button
          type="button"
          role="menuitem"
          className={clsx(css.item, selected && css.selected, entry.danger === true && css.danger)}
          disabled={entry.disabled}
          aria-haspopup={hasSub ? 'menu' : undefined}
          aria-expanded={hasSub ? subOpen : undefined}
          onFocus={() => { setOpenSubmenuId(hasSub ? entry.id : null) }}
          onClick={() => {
            if (hasSub) {
              setOpenSubmenuId(entry.id)
              return
            }
            onSelect(entry.id)
          }}
        >
          {entry.icon !== undefined && <span className={css.itemIcon}>{entry.icon}</span>}
          <span className={css.itemLabel}>{entry.label}</span>
          {entry.value !== undefined && <span className={css.itemValue}>{entry.value}</span>}
          {hasSub && <IconChevronRightOutline14 className={css.subChevron} />}
          {/* Selection marker is a trailing check (figma .Menu_cell), not a fill. */}
          {selected && <IconCheckOutline16 className={css.check} />}
        </button>
        {subOpen && entry.submenu !== undefined && (
          <SubmenuCard
            items={entry.submenu}
            selectedIds={selectedIds}
            onSelect={onSelect}
            compact={compact}
            anchorWrap={topRowRef}
            positionKey={fixedPos}
          />
        )}
      </div>
    )
  }

  // Portal lists render hidden until placed: the placement effect measures
  // this pre-render in the same commit, so the first painted frame is
  // already at the final position (with getAnchorRect returning null the
  // list simply stays hidden).
  const list = open && (
    <div
      ref={listRef}
      className={clsx(css.list, dense && css.denseList, compact && css.compactList, scrollable && css.scrollable, portal && css.portal, side === 'top' && !portal && css.sideTop, align === 'end' && !portal && css.alignEnd, className)}
      style={portal ? fixedPos ?? MEASURE_STYLE : undefined}
      role="menu"
      onMouseEnter={cancelMenuClose}
      onMouseLeave={scheduleMenuClose}
      // React portals bubble synthetic events through the REACT tree: without
      // this stop, an item click re-fires the anchor row's own onClick
      // (open/toggle) after onSelect.
      onClick={(e) => { e.stopPropagation() }}
    >
      <div className={css.viewport} role="presentation">
        {items.map(renderEntry)}
      </div>
      {footer !== undefined && footer.length > 0 && (
        <div className={css.footer} role="presentation">
          {footer.map(renderEntry)}
        </div>
      )}
    </div>
  )

  // Pointer-leave dismissal watches the WRAPPER, not the list: React's
  // enter/leave traversal runs over the React tree, so trigger and portaled
  // list are one region here. Aiming back at the trigger, or crossing the 4px
  // gap between them, therefore never counts as leaving.
  return (
    <span
      ref={rootRef}
      className={clsx(css.root, className)}
      onPointerEnter={closeOnPointerLeave ? cancelClose : undefined}
      onPointerLeave={closeOnPointerLeave ? () => { if (open) armClose() } : undefined}
    >
      {anchor}
      {portal ? (list !== false && createPortal(list, document.body)) : list}
    </span>
  )
}
