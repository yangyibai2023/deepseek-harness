/**
 * Trigger candidate menu: renders the InputTriggerService menu store into the
 * conversation.input.overlay anchor. Closed state renders null (the overlay
 * slot stays mounted); groups render in roster order under localized title
 * rows. A pending group keeps showing the items it already had (the reducer
 * retains them across a query refinement) and falls back to two skeleton
 * rows only while it has none; pointer picks route back through
 * the service (combobox pattern — focus never leaves the textarea, so rows
 * are mousedown-handled and the highlight is exposed via
 * aria-activedescendant on the listbox). A row reads title, then the
 * command-name alias when the title is not the name in another letter case
 * (a localized title), then the description right-aligned. A source publishing crumbs gets a breadcrumb
 * header pinned above the scrolling list.
 */
import { MenuSurface } from '@deepseek-ai/dsh-client-ui-primitives'
import { Fragment, useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react'
import clsx from 'clsx'
import { IconChevronRightOutlineRegular, ReferenceIconRegular } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import css from './MenuView.module.css'
import type { MenuViewInjected } from './slots.ts'
import { MENU_MAX_HEIGHT, resolveMenuPlacement, type MenuPlacement } from './menuPlacement.ts'
import type { MenuKey } from './locales.ts'

/** Full menu props: injected face + the locale seat. */
export type MenuViewProps = MenuViewInjected & PropsLocale<'slash.menu'>

/** DOM id of one option row (the aria-activedescendant target). */
function optionId(source: string, index: number): string {
  return `dsh-slash-option-${source}-${index}`
}

/**
 * Render the candidate menu overlay entry.
 * @param props - injected face (the menu store and the pick route); `t` rides the standard locale seat.
 * @returns the dropdown while open; null while closed.
 */
export function MenuView({ menu, headers, onPick, onCrumb, onHover, onDismiss, t }: MenuViewProps) {
  const state = useSyncExternalStore(
    fn => menu.subscribe(fn),
    () => menu.getSnapshot(),
  )
  const crumbs = useSyncExternalStore(
    fn => headers.subscribe(fn),
    () => headers.getSnapshot(),
  )
  const listRef = useRef<HTMLDivElement>(null)
  const viewportRef = useRef<HTMLDivElement>(null)
  const [hasOverflowBelow, setHasOverflowBelow] = useState(false)
  /* HeightLab（2026-10-22）：菜单的几何全由锚点决定，一次测量同时出三个量。
   *
   * 为什么不再用 `useAnchoredMaxHeight`：那个 hook 假定浮层**向上**展开
   * （底边固定、向上生长），所以它用「元素自己的 rect.bottom − 顶部边距」
   * 算可用高度。菜单改成向下展开后这个假设失效了 —— 元素底边会随高度
   * 一起增长，形成自反馈，maxHeight 永远等于设计上限 400，于是菜单
   * 从 y=655 一路长到 1055，overlay 327px（实测）。
   *
   * 这里直接按方向取真实可用空间：
   *   向下 → 视口底 − 锚点底边 − 间隙
   *   向上 → 锚点顶边 − 视口顶边距 − 间隙
   *
   * `flipOffset` 只在向上时用：锚点（overlayAnchor）钉在输入框卡片**底边**
   * 且高度为 0，CSS 的 `bottom: calc(100% + 4px)` 只等于「卡片底边再往上
   * 4px」，会盖住输入框 —— 必须再加一个卡片高度把菜单抬到卡片顶边之上。
   * 卡片高度是动态的（多行输入会变高），只能在这里量。 */
  const [placement, setPlacement] = useState<MenuPlacement>({
    flipUp: false, offset: 0, maxHeight: MENU_MAX_HEIGHT,
  })
  const updateOverflowHint = useCallback(() => {
    const viewport = viewportRef.current
    setHasOverflowBelow(viewport !== null
      && viewport.scrollTop + viewport.clientHeight < viewport.scrollHeight - 1)
  }, [])
  useLayoutEffect(() => {
    updateOverflowHint()
  }, [state, placement.maxHeight, updateOverflowHint])
  useLayoutEffect(() => {
    /* 锚点取**最近的带尺寸祖先**，而且必须从菜单的父节点开始找。
     *
     * 实测 DOM：输入框卡片 (bcgota_card, 高 108px)
     *   └ overlayAnchor (inset:auto 0 0, height:0)
     *      └ <div> ← listRef.parentElement，零尺寸
     *         └ 菜单面板 ← listRef
     *
     * 两个必须避开的坑（都实测踩过）：
     *   ① 从 listRef **自己**开始找 → 菜单本身有尺寸，直接返回自己的 rect，
     *      而菜单位置又由这次计算决定 —— 形成自反馈：第一次算出「下方不够、
     *      翻上去」，翻上去后菜单 rect 变了，再算又得出不同结论，菜单被推到
     *      top=-320（完全在视口外）。
     *   ② 用 listRef.parentElement → 零尺寸包装层，rect 全 0，于是「下方
     *      空间」恒等于整个视口高，永远不翻转。
     *
     * 所以从父节点起找「第一个 height>0 且 width>0」的祖先。 */
    const measure = (): DOMRect | undefined => {
      let node: HTMLElement | null = listRef.current?.parentElement ?? null
      while (node !== null) {
        const rect = node.getBoundingClientRect()
        if (rect.height > 0 && rect.width > 0) return rect
        node = node.parentElement
      }
      return undefined
    }
    const place = (): void => {
      const rect = measure()
      if (rect === undefined) return
      /* 具体数值全在纯函数里算（可单测）。这里只负责量 DOM。 */
      const next = resolveMenuPlacement({
        anchor: { top: rect.top, bottom: rect.bottom, height: rect.height },
        viewportHeight: window.innerHeight,
      })
      // 只在真的变了才 setState：place() 挂在 scroll/resize 上，高频触发。
      setPlacement(previous => (
        previous.flipUp === next.flipUp
        && previous.offset === next.offset
        && previous.maxHeight === next.maxHeight
          ? previous
          : next
      ))
    }
    place()
    window.addEventListener('resize', place)
    // 输入框随内容长高/收起、或页面滚动时锚点会移动。
    window.addEventListener('scroll', place, true)
    return () => {
      window.removeEventListener('resize', place)
      window.removeEventListener('scroll', place, true)
    }
  }, [state])
  const maxHeight = placement.maxHeight
  const highlight = state.open ? state.highlight : null
  // Focus stays in the textarea (combobox pattern), so the browser never
  // scrolls the active option into view on keyboard moves — do it here.
  useEffect(() => {
    if (highlight === null) return
    document.getElementById(optionId(highlight.source, highlight.index))
      ?.scrollIntoView({ block: 'nearest' })
  }, [highlight])
  // Dismiss on pointer outside the menu AND outside the composer card
  // (clicking the textarea or bottom bar must not close the menu).
  useEffect(() => {
    if (!state.open) return
    const onPointerDown = (ev: PointerEvent): void => {
      if (!(ev.target instanceof Node)) return
      if (listRef.current?.contains(ev.target)) return
      const composerCard = listRef.current?.closest('[data-composer-card]')
      if (composerCard?.contains(ev.target)) return
      onDismiss()
    }
    document.addEventListener('pointerdown', onPointerDown, true)
    return () => { document.removeEventListener('pointerdown', onPointerDown, true) }
  }, [state.open, onDismiss])
  if (!state.open) return null
  return (
    // The listbox role sits on the scrolling viewport, not this shell: a
    // breadcrumb header is not an option, and a listbox may not carry one.
    <MenuSurface
      ref={listRef}
      className={css.menu}
      style={placement.flipUp && placement.offset > 0
        // 翻上去时用实测的 bottom 距离（锚点在卡片底边，需抬过整张卡片）。
        ? { maxHeight, top: 'auto', bottom: placement.offset }
        : { maxHeight }}
      data-trigger-menu=""
      data-flip-up={placement.flipUp || undefined}
      data-overflow-below={hasOverflowBelow || undefined}
    >
      {state.groups.map((group) => {
        const trail = crumbs.get(group.source)
        return trail === undefined ? null : (
          <nav key={group.source} className={css.crumbs} aria-label={t('crumbs.aria')}>
            {trail.map((crumb, index) => (
              <Fragment key={`${String(index)}-${crumb.value}`}>
                {index > 0 && <span className={css.crumbSeparator} aria-hidden><IconChevronRightOutlineRegular /></span>}
                <button
                  type="button"
                  className={clsx(css.crumb, crumb.current === true && css.crumbCurrent)}
                  aria-current={crumb.current === true ? 'location' : undefined}
                  disabled={crumb.current === true}
                  // mousedown, not click: the composer keeps focus, same as a row.
                  onMouseDown={(ev) => {
                    ev.preventDefault()
                    onCrumb(group.source, index)
                  }}
                >
                  {crumb.label}
                </button>
              </Fragment>
            ))}
          </nav>
        )
      })}
      <div
        ref={viewportRef}
        className={css.viewport}
        role="listbox"
        aria-label={t('suggestions.aria')}
        aria-activedescendant={highlight !== null ? optionId(highlight.source, highlight.index) : undefined}
        onScroll={updateOverflowHint}
      >
        {state.groups.map(group => (group.status === 'ready' && group.items.length === 0)
          ? null
          : (
            <Fragment key={group.source}>
              {/* Source names key the dictionary open-endedly: the lookup chain
                  returns an unknown key verbatim, so an unregistered source
                  shows its raw name — hence the cast past the typed key union. */}
              {group.showGroupTitle === false || group.items.some(item => item.section !== undefined)
                ? null
                : <div className={css.groupTitle} role="presentation" data-source={group.source}>{t(group.source as MenuKey)}</div>}
              {group.status === 'pending' && group.items.length === 0
                ? (
                  <div role="status" aria-label={t('loading')} data-source={group.source}>
                    <div className={css.skeletonRow}><span className={css.skeletonBar} style={{ width: '32%' }} /></div>
                    <div className={css.skeletonRow}><span className={css.skeletonBar} style={{ width: '48%' }} /></div>
                  </div>
                )
                : group.items.map((item, index) => {
                  const active = highlight !== null && highlight.source === group.source && highlight.index === index
                  return (
                    <Fragment key={optionId(group.source, index)}>
                      {item.section !== undefined && item.section !== group.items[index - 1]?.section
                        ? <div className={css.sectionTitle} role="presentation">{item.section}</div>
                        : null}
                      <button
                        id={optionId(group.source, index)}
                        type="button"
                        role="option"
                        aria-selected={active}
                        className={clsx(css.item, active && css.active)}
                        // mousedown, not click: the textarea keeps focus (combobox
                        // pattern) — preventing default stops the focus steal, and the
                        // pick runs before any blur-driven teardown.
                        onMouseDown={(ev) => {
                          ev.preventDefault()
                          onPick(group.source, index)
                        }}
                        // mousemove, not mouseenter: real pointer motion moves the
                        // shared highlight; keyboard scrolling rows under a resting
                        // pointer must not steal it back.
                        onMouseMove={active ? undefined : () => { onHover(group.source, index) }}
                      >
                        {item.icon !== undefined && (
                          <span className={css.itemIcon} aria-hidden>
                            {typeof item.icon === 'string'
                              ? <ReferenceIconRegular kind={item.icon} size={14} />
                              : <item.icon size={14} />}
                          </span>
                        )}
                        <span className={css.itemName}>{item.label ?? item.name}</span>
                        {item.label !== undefined && item.label.toLowerCase() !== item.name.toLowerCase() && (
                          <span className={css.itemAlias}>{item.name}</span>
                        )}
                        {item.description !== undefined && <span className={css.itemDescription}>{item.description}</span>}
                        {item.drill === true && (
                          <span className={css.trailing}>
                            {/* Visual hint only: Tab drills the highlighted row (the
                                keyboard twin of the chevron, which owns the aria label). */}
                            <span className={css.drillHintText} aria-hidden>{t('drill.hint')}</span>
                            <kbd className={css.drillHint} aria-hidden>{t('drill.key')}</kbd>
                            <span
                              role="button"
                              aria-label={t('drill.aria')}
                              className={css.drill}
                              // mousedown so the composer keeps focus, same as the row;
                              // stopPropagation keeps the row's settling pick out of it.
                              onMouseDown={(ev) => {
                                ev.preventDefault()
                                ev.stopPropagation()
                                onPick(group.source, index, 'drill')
                              }}
                            >
                              <IconChevronRightOutlineRegular size={12} />
                            </span>
                          </span>
                        )}
                      </button>
                    </Fragment>
                  )
                })}
            </Fragment>
          ))}
      </div>
    </MenuSurface>
  )
}
