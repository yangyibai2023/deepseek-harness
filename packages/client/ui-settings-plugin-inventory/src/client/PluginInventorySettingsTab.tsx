import { useEffect, useId, useMemo, useState, type ReactNode } from 'react'
import type { PluginInventorySnapshot } from '@deepseek-ai/dsh-api-remotes/client'
import {
  IconChevronDownOutline14,
  IconSearchOutline16,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { PluginInventoryCopy, PluginInventoryLocaleKey } from './locales.ts'
import css from './PluginInventorySettingsTab.module.css'

/** Registration-side Remote face used by the section. */
export interface PluginInventorySettingsTabInjected {
  /** Read a current Host inventory snapshot. */
  list: () => Promise<PluginInventorySnapshot>
  /** 按标签页覆盖文案（HeightLab：MCP 服务标签页使用自己的空态/搜索文案）。 */
  copy?: Partial<PluginInventoryCopy>
  /** 该条目是否允许用户管理（启用/停用/删除）；默认 false。 */
  canManage?: (entry: PluginInventorySnapshot['entries'][number]) => boolean
  /** 该条目是否允许删除；默认与 canManage 一致。 */
  canDelete?: (entry: PluginInventorySnapshot['entries'][number]) => boolean
}

type PluginInventoryEntry = PluginInventorySnapshot['entries'][number]
type PluginFiberPhase = PluginInventoryEntry['fiberPhase']

/** Full component props assembled by the Settings slot renderer. */
export type PluginInventorySettingsTabProps =
  PropsRuntime<'settings.plugins.tab'>
  & PropsLocale<'settings.pluginInventory'>
  & InjectFace<PluginInventorySettingsTabInjected>

type ViewState =
  | { readonly status: 'loading' }
  | { readonly status: 'error' }
  | { readonly status: 'ready'; readonly snapshot: PluginInventorySnapshot }

const PHASE_KEYS = {
  pending: 'pending',
  loading: 'loadingPhase',
  active: 'active',
  failed: 'failed',
  unloading: 'unloading',
} satisfies Record<Exclude<PluginFiberPhase, null>, PluginInventoryLocaleKey>

/** Localized accessible label for one root Fiber phase. */
function phaseLabel(
  phase: PluginFiberPhase,
  t: PluginInventorySettingsTabProps['t'],
): string {
  return phase === null ? t('unobserved') : t(PHASE_KEYS[phase])
}

/** Compact a module specifier without guessing whether its Loader id was generated. */
function moduleShortName(moduleName: string): string {
  const unscoped = moduleName.startsWith('@') ? moduleName.slice(moduleName.indexOf('/') + 1) : moduleName
  return unscoped
    .replace(/^cordis:/, '')
    .replace(/^cordis-plugin-/, '')
    .replace(/^dsh-(?:host-|client-)?/, '')
}

/** Whether an inventory row matches the local catalog query. */
function matches(entry: PluginInventoryEntry, normalizedQuery: string): boolean {
  if (normalizedQuery.length === 0) return true
  return [entry.moduleName, entry.entryId]
    .some(value => value.toLocaleLowerCase().includes(normalizedQuery))
}

/** Render the read-only current Loader inventory. */
export function PluginInventorySettingsTab({ list, copy, canManage, canDelete, t }: PluginInventorySettingsTabProps): ReactNode {
  const catalogId = useId()
  const [request, setRequest] = useState(0)
  const [query, setQuery] = useState('')
  const [expanded, setExpanded] = useState<PluginInventoryEntry['entryId'] | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [confirmId, setConfirmId] = useState<string | null>(null)
  const [actionNote, setActionNote] = useState<{ entryId: string; text: string } | null>(null)
  const [actionError, setActionError] = useState<{ entryId: string; text: string } | null>(null)
  const [state, setState] = useState<ViewState>({ status: 'loading' })

  useEffect(() => {
    let current = true
    void Promise.resolve().then(() => list()).then(
      (snapshot) => { if (current) setState({ status: 'ready', snapshot }) },
      () => { if (current) setState({ status: 'error' }) },
    )
    return () => { current = false }
  }, [list, request])

  const normalizedQuery = query.trim().toLocaleLowerCase()
  const filteredEntries = useMemo(
    () => state.status === 'ready'
      ? state.snapshot.entries.filter(entry => matches(entry, normalizedQuery))
      : [],
    [normalizedQuery, state],
  )

  useEffect(() => {
    if (expanded !== null && !filteredEntries.some(entry => entry.entryId === expanded)) {
      setExpanded(null)
    }
  }, [expanded, filteredEntries])

  useEffect(() => {
    if (confirmId === null) return
    const timer = setTimeout(() => setConfirmId(null), 4000)
    return () => clearTimeout(timer)
  }, [confirmId])

  const retry = (): void => {
    setState({ status: 'loading' })
    setRequest(value => value + 1)
  }

  async function toggleEntry(entry: PluginInventoryEntry): Promise<void> {
    setBusyId(entry.entryId)
    setActionError(null)
    setActionNote(null)
    try {
      const res = await fetch('/hl/plugin/toggle', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ entryId: entry.entryId, moduleName: entry.moduleName, enabled: !entry.enabled }),
      })
      const data = await res.json().catch(() => ({})) as { ok?: boolean; message?: string }
      if (!res.ok || data.ok !== true) {
        setActionError({ entryId: entry.entryId, text: data.message ?? t('actionError') })
        return
      }
      setRequest(value => value + 1)
    } catch {
      setActionError({ entryId: entry.entryId, text: t('actionError') })
    } finally {
      setBusyId(null)
    }
  }

  async function removeEntry(entry: PluginInventoryEntry): Promise<void> {
    setBusyId(entry.entryId)
    setActionError(null)
    setActionNote(null)
    setConfirmId(null)
    try {
      const res = await fetch('/hl/plugin/remove', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ entryId: entry.entryId, moduleName: entry.moduleName }),
      })
      const data = await res.json().catch(() => ({})) as { ok?: boolean; message?: string }
      if (!res.ok || data.ok !== true) {
        setActionError({ entryId: entry.entryId, text: data.message ?? t('actionError') })
        return
      }
      setActionNote({ entryId: entry.entryId, text: t('removedNote') })
      setRequest(value => value + 1)
    } catch {
      setActionError({ entryId: entry.entryId, text: t('actionError') })
    } finally {
      setBusyId(null)
    }
  }

  function onDeleteClick(entry: PluginInventoryEntry): void {
    if (confirmId === entry.entryId) {
      void removeEntry(entry)
    } else {
      setConfirmId(entry.entryId)
    }
  }

  return (
    <div className={css.section} aria-busy={state.status === 'loading'}>
      {state.status === 'loading' ? <p className={css.status}>{copy?.loading ?? t('loading')}</p> : null}
      {state.status === 'error' ? (
        <div className={css.failure}>
          <p role="alert">{copy?.error ?? t('error')}</p>
          <button type="button" onClick={retry}>{copy?.retry ?? t('retry')}</button>
        </div>
      ) : null}
      {state.status === 'ready' ? (
        <div className={css.catalog}>
          <label className={css.search}>
            <IconSearchOutline16 aria-hidden="true" />
            <span className={css.visuallyHidden}>{copy?.search ?? t('search')}</span>
            <input
              type="search"
              value={query}
              placeholder={copy?.search ?? t('search')}
              aria-label={copy?.search ?? t('search')}
              onChange={(event) => { setQuery(event.currentTarget.value) }}
            />
          </label>
          <div className={css.catalogHeading}>
            <h3>{copy?.catalog ?? t('catalog')}</h3>
            <span data-plugin-count={filteredEntries.length}>{filteredEntries.length}</span>
          </div>
          {state.snapshot.entries.length === 0 ? <p className={css.status}>{copy?.empty ?? t('empty')}</p> : null}
          {state.snapshot.entries.length > 0 && filteredEntries.length === 0
            ? <p className={css.status}>{copy?.emptySearch ?? t('emptySearch')}</p>
            : null}
          {filteredEntries.length > 0 ? (
            <ul className={css.cards}>
              {filteredEntries.map((entry) => {
                const status = phaseLabel(entry.fiberPhase, t)
                const title = moduleShortName(entry.moduleName)
                const configuration = t(entry.enabled ? 'enabledTag' : 'disabledTag')
                const open = expanded === entry.entryId
                const detailId = `${catalogId}-details-${encodeURIComponent(entry.entryId)}`
                return (
                  <li
                    className={css.card}
                    key={entry.entryId}
                    data-plugin-entry={entry.entryId}
                    data-open={open ? 'true' : undefined}
                  >
                    <button
                      className={css.cardContent}
                      type="button"
                      aria-expanded={open}
                      aria-controls={detailId}
                      aria-label={entry.enabled ? `${title}, ${status}, ${configuration}` : `${title}, ${configuration}`}
                      onClick={() => {
                        setExpanded(current => current === entry.entryId ? null : entry.entryId)
                      }}
                    >
                      <strong className={css.cardTitle} title={entry.moduleName}>{title}</strong>
                      <span className={css.cardTrailing}>
                        {entry.enabled ? (
                          <span
                            className={css.statusDot}
                            data-phase={entry.fiberPhase ?? 'unobserved'}
                            role="img"
                            aria-label={status}
                            title={status}
                          />
                        ) : null}
                        <span className={css.configTag} data-enabled={entry.enabled ? 'true' : 'false'}>
                          {configuration}
                        </span>
                        <IconChevronDownOutline14 className={css.chevron} size={12} aria-hidden="true" />
                      </span>
                    </button>
                    {open ? (
                      <div className={css.cardDetails} id={detailId}>
                      <code className={css.entryValue} data-loader-entry>{entry.entryId}</code>
                      <dl className={css.details}>
                        <div>
                          <dt>{t('configuration')}</dt>
                          <dd>{configuration}</dd>
                        </div>
                      </dl>
                    </div>
                  ) : null}
                  {canManage?.(entry) ? (
                    <div className={css.actions}>
                      <button
                        type="button"
                        className={css.actionButton}
                        disabled={busyId === entry.entryId}
                        onClick={() => { void toggleEntry(entry) }}
                      >
                        {entry.enabled ? t('disable') : t('enable')}
                      </button>
                      {canDelete?.(entry) ?? true ? (
                        <button
                          type="button"
                          className={css.deleteButton}
                          disabled={busyId === entry.entryId}
                          onClick={() => onDeleteClick(entry)}
                        >
                          {confirmId === entry.entryId ? t('confirmDelete') : t('delete')}
                        </button>
                      ) : null}
                    </div>
                  ) : null}
                  {canManage?.(entry) && !(canDelete?.(entry) ?? true) ? (
                    <p className={css.actionHint}>{t('systemBuiltinHint')}</p>
                  ) : null}
                  {actionNote?.entryId === entry.entryId ? (
                    <p className={css.actionHint}>{actionNote.text}</p>
                  ) : null}
                  {actionError?.entryId === entry.entryId ? (
                    <p className={css.actionError}>{actionError.text}</p>
                  ) : null}
                </li>
              )
              })}
            </ul>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
