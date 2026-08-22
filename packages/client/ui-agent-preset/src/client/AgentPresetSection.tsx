/**
 * Agent-presets settings section: the roster as cards, a copy dialog as the
 * only way a preset is created, and a read-only viewer over the shipped
 * compositions.
 *
 * The browser edits no composition text — a shipped preset opens read-only to
 * be READ (it is the known-good composition a copy starts from), and a custom
 * preset is edited in its own files, which is what the location action leads
 * to. Deleting a preset leaves running sessions alone: a composition is
 * mounted once at session creation and nothing re-reads the file.
 */

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import {
  Button, IconCopyOutline16, IconFolderOpenOutline16, IconPlusOutline16, IconTrashOutline16, Modal, Tooltip,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { SnapshotStore } from '@deepseek-ai/dsh-client-runtime/client'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { draftBlocker, type AgentPresetSectionState } from './section-store.ts'
import { presetDisplayText, type AgentPresetSettingsKey } from './locales.ts'
import css from './AgentPresetSection.module.css'

/** Registration-side business face for the management section. */
export interface AgentPresetSectionInjected {
  hooks: {
    /** Page snapshot bound by the renderer as useAgentPresetSection. */
    agentPresetSection: SnapshotStore<AgentPresetSectionState>
  }
  /** Read the roster; called once when the section first renders. */
  load: () => Promise<void>
  /** Open one shipped preset's composition in the read-only viewer. */
  view: (id: string) => Promise<void>
  /** Close the read-only viewer. */
  closeView: () => void
  /** Open the copy dialog over one preset. */
  beginCopy: (from: string) => void
  /** Close the copy dialog, discarding the draft. */
  cancelCopy: () => void
  /** Name the preset the copy creates. */
  setCopyId: (id: string) => void
  /** Name the copy's display name. */
  setCopyName: (name: string) => void
  /** Submit the copy. */
  confirmCopy: () => Promise<void>
  /** Open one preset's directory, or reveal its path where there is no desktop. */
  openLocation: (id: string) => Promise<void>
  /**
   * Stage the self-referential preset and start a new session on it — the
   * guided way to author a preset, beside copying. Absent when the surface
   * is composed without the conversation flow to land the session in.
   */
  startCreatorDraft?: () => void
  /** Ask for delete confirmation, or dismiss it with null. */
  confirmDelete: (id: string | null) => void
  /** Delete the preset awaiting confirmation. */
  remove: () => Promise<void>
  /** Make one preset the default for sessions created later. */
  makeDefault: (id: string) => Promise<void>
}

/** HeightLab 官方专家预设：视同内置，只展示介绍，不允许查看/修改/复制/删除。 */
const HEIGHTLAB_OFFICIAL_IDS: ReadonlySet<string> = new Set([
  'content-creator',
  'image-generator',
  'research-analyst',
  'video-producer',
  'general-assistant',
])

/** HeightLab：管理页也隐藏的官方内置模式（PTC/创造模式/自动化执行助手，暂不开放）。 */
const HIDDEN_OFFICIAL_IDS: ReadonlySet<string> = new Set([
  'code',
  'cordis',
  'automation-worker',
])

/** Whether a roster row is presented as official (built-in or HeightLab official). */
function isOfficial(row: { id: string; trust: 'system' | 'user' }): boolean {
  return row.trust === 'system' || HEIGHTLAB_OFFICIAL_IDS.has(row.id)
}

/** Full component props. */
export type AgentPresetSectionProps =
  PropsRuntime<'settings.section'>
  & PropsLocale<'settings.agentPreset'>
  & InjectFace<AgentPresetSectionInjected>

/** Copy-dialog sub-view props: the draft plus the actions that mutate it. */
interface CopyDialogProps {
  state: AgentPresetSectionState
  t: (key: AgentPresetSettingsKey) => string
  actions: Pick<AgentPresetSectionInjected,
    'cancelCopy' | 'confirmCopy' | 'setCopyId' | 'setCopyName'>
}

function CopyDialog({ state, t, actions }: CopyDialogProps): ReactNode {
  const draft = state.copy
  const blocker = draft === null ? undefined : draftBlocker(draft, state.rows)
  const message = draft === null ? null : draft.error ?? (blocker === undefined ? null : t(blocker))
  const source = draft === null ? undefined : state.rows.find(row => row.id === draft.from)
  const sourceTitle = source === undefined ? draft?.fromTitle : presetDisplayText(source, t).name
  return (
    <Modal
      open={draft !== null}
      onClose={() => { actions.cancelCopy() }}
      title={draft === null ? t('copyTitle') : `${t('copyTitle')} · ${t('copyOf')} ${sourceTitle}`}
      closeLabel={t('close')}
      description={t('copyIntro')}
      className={css.dialog as string}
      footer={(
        <>
          <Button
            variant="outline"
            disabled={draft?.saving === true}
            onClick={() => { actions.cancelCopy() }}
          >
            {t('cancel')}
          </Button>
          <Button
            disabled={draft === null || draft.saving || blocker !== undefined}
            onClick={() => { void actions.confirmCopy() }}
          >
            {draft?.saving === true ? t('creating') : t('create')}
          </Button>
        </>
      )}
    >
      {draft === null
        ? null
        : (
          <div className={css.dialogFields}>
            <label className={css.field}>
              <span className={css.fieldLabel}>{t('presetId')}</span>
              <input
                className={css.input}
                value={draft.id}
                autoFocus
                spellCheck={false}
                placeholder={t('presetIdPlaceholder')}
                onChange={(event) => { actions.setCopyId(event.target.value) }}
              />
            </label>
            <label className={css.field}>
              <span className={css.fieldLabel}>{t('displayName')}</span>
              <input
                className={css.input}
                value={draft.name}
                spellCheck={false}
                placeholder={t('displayNamePlaceholder')}
                onChange={(event) => { actions.setCopyName(event.target.value) }}
              />
            </label>
            {message === null ? null : <p className={css.error} role="alert">{message}</p>}
          </div>
        )}
    </Modal>
  )
}

/**
 * HeightLab：表单创建自定义 Agent。生成的是 DSH 原生 preset 目录
 * （preset.yml + agent.cordis.yml），创建后由父级刷新 roster。
 */
function CreateAgentDialog({ t, onClose, onCreated }: {
  t: (key: AgentPresetSettingsKey) => string
  onClose: () => void
  onCreated: () => void
}): ReactNode {
  const [name, setName] = useState('')
  const [id, setId] = useState('')
  const [idManual, setIdManual] = useState(false)
  const [description, setDescription] = useState('')
  const [persona, setPersona] = useState('')
  const [fileShell, setFileShell] = useState(true)
  const [webSearch, setWebSearch] = useState(true)
  const [skills, setSkills] = useState(true)
  const [planMode, setPlanMode] = useState(false)
  const [subagents, setSubagents] = useState(false)
  const [domains, setDomains] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const slug = (value: string): string => value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 63)

  const submit = async (): Promise<void> => {
    setError(null)
    const cleanName = name.trim()
    const cleanId = id.trim()
    const cleanPersona = persona.trim()
    if (!cleanName) { setError('请输入名称。'); return }
    if (!cleanId) { setError('请输入标识符。'); return }
    if (!cleanPersona) { setError('请输入角色设定 / 系统提示词。'); return }
    setBusy(true)
    try {
      const res = await fetch('/hl/agent-presets/create', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          id: cleanId,
          name: cleanName,
          description: description.trim(),
          persona: cleanPersona,
          capabilities: {
            fileShell,
            webSearch,
            skills,
            planMode,
            subagents,
            domains,
          },
        }),
      })
      const data = await res.json().catch(() => ({})) as { ok?: boolean; message?: string }
      if (!res.ok || data.ok !== true) {
        setError(data.message ?? t('createFailed'))
        return
      }
      onCreated()
    } catch {
      setError(t('createFailed'))
    } finally {
      setBusy(false)
    }
  }

  const checkbox = (checked: boolean, onChange: (next: boolean) => void, label: string): ReactNode => (
    <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      <span>{label}</span>
    </label>
  )

  const domainCheckbox = (domain: string, label: string): ReactNode => checkbox(
    domains.includes(domain),
    (next) => setDomains(previous => next
      ? [...new Set([...previous, domain])]
      : previous.filter(item => item !== domain)),
    label,
  )

  return (
    <Modal
      open
      onClose={() => { if (!busy) onClose() }}
      title={t('createMenuTitle')}
      closeLabel={t('close')}
      className={css.dialog as string}
      footer={(
        <>
          <Button variant="outline" disabled={busy} onClick={onClose}>
            {t('cancel')}
          </Button>
          <Button disabled={busy} onClick={() => { void submit() }}>
            {busy ? t('createSaving') : t('create')}
          </Button>
        </>
      )}
    >
      <div className={css.dialogFields}>
        <label className={css.field}>
          <span className={css.fieldLabel}>{t('createFormName')}</span>
          <input
            className={css.input}
            value={name}
            maxLength={64}
            spellCheck={false}
            onChange={(event) => {
              const next = event.target.value
              setName(next)
              if (!idManual) setId(slug(next))
            }}
          />
        </label>
        <label className={css.field}>
          <span className={css.fieldLabel}>{t('createFormId')}</span>
          <input
            className={css.input}
            value={id}
            maxLength={64}
            spellCheck={false}
            placeholder={t('presetIdPlaceholder')}
            onChange={(event) => { setId(event.target.value); setIdManual(true) }}
          />
        </label>
        <label className={css.field}>
          <span className={css.fieldLabel}>{t('createFormDescription')}</span>
          <input
            className={css.input}
            value={description}
            maxLength={200}
            spellCheck={false}
            onChange={(event) => setDescription(event.target.value)}
          />
        </label>
        <label className={css.field}>
          <span className={css.fieldLabel}>{t('createFormPersona')}</span>
          <textarea
            className={css.input}
            value={persona}
            rows={6}
            maxLength={20000}
            spellCheck={false}
            style={{ resize: 'vertical' }}
            onChange={(event) => setPersona(event.target.value)}
          />
        </label>
        <div className={css.field}>
          <span className={css.fieldLabel}>{t('createFormCapabilities')}</span>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 14px', marginTop: 4 }}>
            {checkbox(fileShell, setFileShell, t('createCapFileShell'))}
            {checkbox(webSearch, setWebSearch, t('createCapWebSearch'))}
            {checkbox(skills, setSkills, t('createCapSkills'))}
            {checkbox(planMode, setPlanMode, t('createCapPlanMode'))}
            {checkbox(subagents, setSubagents, t('createCapSubagents'))}
          </div>
        </div>
        <div className={css.field}>
          <span className={css.fieldLabel}>{t('createFormDomains')}</span>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 14px', marginTop: 4 }}>
            {domainCheckbox('content', t('createDomainContent'))}
            {domainCheckbox('image', t('createDomainImage'))}
            {domainCheckbox('video', t('createDomainVideo'))}
            {domainCheckbox('research', t('createDomainResearch'))}
          </div>
        </div>
        {error === null ? null : <p className={css.error} role="alert">{error}</p>}
      </div>
    </Modal>
  )
}

/**
 * Render one card's description, clamped by CSS and offered in full on hover.
 * The tooltip is attached only while the text is actually cut off, so a short
 * description does not answer a hover with a bubble repeating the card.
 * @param props.text - the description as rendered, already localized.
 * @returns the description element, tooltip-anchored while it overflows.
 */
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

/**
 * Render the Agent presets section content column.
 * @param props - composed slot props.
 * @returns the section, or null when the deployment composes no presets.
 */
export function AgentPresetSection(props: AgentPresetSectionProps): ReactNode {
  const { useAgentPresetSection, t, load } = props
  const state = useAgentPresetSection(snapshot => snapshot)
  const [createMenuOpen, setCreateMenuOpen] = useState(false)
  const [createFormOpen, setCreateFormOpen] = useState(false)
  const [customModel, setCustomModel] = useState(() => document.body.dataset.hlCustomModel === '1')
  const [customHint, setCustomHint] = useState<string | null>(null)
  const viewedId = state.view?.id
  const viewedRow = viewedId === undefined ? undefined : state.rows.find(row => row.id === viewedId)
  const viewedTitle = state.view === null
    ? ''
    : viewedRow === undefined ? state.view.title : presetDisplayText(viewedRow, t).name

  useEffect(() => {
    void load()
  }, [load])

  // HeightLab：自定义模型激活时，只能选择/使用「通用助手」。
  useEffect(() => {
    const onModel = (event: Event): void => {
      const detail = (event as CustomEvent<{ custom?: boolean }>).detail
      setCustomModel(detail?.custom === true)
      if (detail?.custom !== true) setCustomHint(null)
    }
    window.addEventListener('hl:model-change', onModel)
    return () => window.removeEventListener('hl:model-change', onModel)
  }, [])

  // A deployment that composes no presets has nothing to manage: every
  // session shares the host composition and the page would be an empty list.
  if (state.status === 'unavailable') return null
  if (state.status === 'error') {
    /* v8 ignore next -- an error status always carries text; the fallback satisfies the nullable type */
    const detail = state.error ?? ''
    return (
      <div className={css.section}>
        <p className={css.error} role="alert">{`${t('error')} ${detail}`}</p>
        <button type="button" className={css.secondaryButton} onClick={() => { void load() }}>
          {t('retry')}
        </button>
      </div>
    )
  }

  /* The guided way to author a new custom preset: the self-referential
     preset reads this very composition and drafts a new one in conversation.
     Offered only where that preset is actually on the roster and a session
     can be landed; without a writable root the draft could never be
     discovered, so the reason rides the disabled button. */
  const creatorButton = props.startCreatorDraft !== undefined && state.rows.some(row => row.id === 'cordis')
    ? (
      <button
        type="button"
        className={css.creatorButton}
        disabled={!state.authorable}
        title={state.authorable ? undefined : t('duplicateUnavailable')}
        onClick={() => { setCreateMenuOpen(true) }}
      >
        <IconPlusOutline16 size={14} />
        {t('creatorDraft')}
      </button>
    )
    : null

  return (
    <div className={css.section}>
      <h2 className={css.title}>{t('nav')}</h2>
      <p className={css.intro}>{t('sectionIntro')}</p>
      {state.error === null ? null : <p className={css.error} role="alert">{state.error}</p>}
      {customHint === null ? null : <p className={css.error} role="alert">{customHint}</p>}
      {/* HeightLab：内置组 = DSH 内置 + HeightLab 官方专家（PTC/创造模式不展示）；
          自定义组 = 用户自建 Agent（含复制创建与创造模式起草入口）。 */}
      {([['system', t('builtInGroup')], ['user', t('customGroup')]] as const).map(([trust, heading]) => {
        // HeightLab：标准模式最前，HeightLab 专家居中，系统操作专家最后。
        const rank = (id: string): number => id === 'standard' ? 0 : id === 'minimal' ? 2 : 1
        const group = state.rows
          .filter(row => !HIDDEN_OFFICIAL_IDS.has(row.id)
            && !(trust === 'user' && HEIGHTLAB_OFFICIAL_IDS.has(row.id))
            && (row.trust === trust || (trust === 'system' && HEIGHTLAB_OFFICIAL_IDS.has(row.id))))
          .sort((left, right) => rank(left.id) - rank(right.id))
          .map(row => ({ row, text: presetDisplayText(row, t) }))
        // The custom group is where a preset of one's own will appear, so it
        // stays on screen even while empty: heading plus the creator entry.
        const tail = trust === 'user' ? creatorButton : null
        if (group.length === 0 && tail === null) return null
        return (
          <section key={trust} className={css.group}>
            <h3 className={css.groupHead}>{heading}</h3>
            {group.length === 0 ? null : (
              <ul className={css.cards}>
                {group.map(({ row, text }) => (
                  <li
                    key={row.id}
                    className={row.broken !== undefined
                      ? `${css.card} ${css.cardBroken}`
                      : row.isDefault ? `${css.card} ${css.cardActive}` : css.card}
                  >
                    {/* The card body IS the control: picking a preset is the
                      common act, so it should not hide behind a small button.
                      The action row sits outside it — nesting buttons is
                      invalid, and these act on the card rather than select it.
                      A broken preset cannot compose a session, so its body is
                      disabled and the card says why instead of offering it. */}
                    <button
                      type="button"
                      className={css.cardMain}
                      aria-pressed={row.isDefault}
                      disabled={row.isDefault || row.broken !== undefined}
                      // Without this the name is the whole card read aloud —
                      // title, badge, description, id.
                      aria-label={`${row.broken !== undefined ? t('brokenBadge') : row.isDefault ? t('inUse') : t('setDefault')}: ${text.name}`}
                      title={row.broken ?? (row.isDefault ? t('inUse') : t('setDefault'))}
                      onClick={() => {
                        if (customModel && row.id !== 'general-assistant') {
                          setCustomHint(t('customModelHint'))
                          return
                        }
                        setCustomHint(null)
                        void props.makeDefault(row.id)
                      }}
                    >
                      <span className={css.cardHead}>
                        <span className={css.cardName}>{text.name}</span>
                        {row.broken !== undefined
                          ? <span className={css.brokenBadge}>{t('brokenBadge')}</span>
                          : null}
                        <span className={css.badge}>
                          {isOfficial(row) ? t('builtIn') : t('userTrust')}
                        </span>
                        {row.isDefault ? <span className={css.inUse}>{t('inUse')}</span> : null}
                      </span>
                      <CardDescription text={text.description ?? t('noDescription')} />
                      {row.broken === undefined
                        ? null
                        : <span className={css.cardBrokenReason} role="alert">{row.broken}</span>}
                      {isOfficial(row) ? null : <code className={css.cardId}>{row.id}</code>}
                    </button>
                    <div className={css.cardFoot}>
                      {/* HeightLab：内置（Colin/系统专家）与官方专家一律只展示
                          介绍；只有用户自建的自定义 Agent 提供打开目录/复制/删除。 */}
                      {row.trust === 'user' && !HEIGHTLAB_OFFICIAL_IDS.has(row.id) && (
                        <button
                          type="button"
                          className={css.iconButton}
                          data-tip={state.hasDocument ? t('openLocation') : t('showLocation')}
                          aria-label={`${state.hasDocument ? t('openLocation') : t('showLocation')}: ${text.name}`}
                          onClick={() => { void props.openLocation(row.id) }}
                        >
                          <IconFolderOpenOutline16 />
                        </button>
                      )}
                      {row.trust === 'user' && !HEIGHTLAB_OFFICIAL_IDS.has(row.id) && (
                        <button
                          type="button"
                          className={css.iconButton}
                          disabled={!state.authorable || row.broken !== undefined}
                          data-tip={row.broken !== undefined
                            ? t('brokenNoCopy')
                            : state.authorable ? t('duplicate') : t('duplicateUnavailable')}
                          aria-label={`${t('duplicate')}: ${text.name}`}
                          onClick={() => { props.beginCopy(row.id) }}
                        >
                          <IconCopyOutline16 />
                        </button>
                      )}
                      {row.trust === 'user' && !HEIGHTLAB_OFFICIAL_IDS.has(row.id) ? (
                        <button
                          type="button"
                          className={`${css.iconButton} ${css.iconDanger}`}
                          data-tip={t('delete')}
                          aria-label={`${t('delete')}: ${text.name}`}
                          onClick={() => { props.confirmDelete(row.id) }}
                        >
                          <IconTrashOutline16 />
                        </button>
                      ) : null}
                    </div>
                    {state.revealedPaths[row.id] === undefined
                      ? null
                      : (
                        <p className={css.revealedPath}>
                          <span className={css.revealedPathLabel}>{t('revealedPathLabel')}</span>
                          <code>{state.revealedPaths[row.id]}</code>
                        </p>
                      )}
                  </li>
                ))}
              </ul>
            )}
            {tail}
          </section>
        )
      })}
      <CopyDialog
        state={state}
        t={t}
        actions={{
          cancelCopy: props.cancelCopy,
          confirmCopy: props.confirmCopy,
          setCopyId: props.setCopyId,
          setCopyName: props.setCopyName,
        }}
      />
      {createMenuOpen && (
        <Modal
          open
          onClose={() => { setCreateMenuOpen(false) }}
          title={t('createMenuTitle')}
          closeLabel={t('close')}
          className={css.dialog as string}
          footer={(
            <Button variant="outline" onClick={() => { setCreateMenuOpen(false) }}>
              {t('cancel')}
            </Button>
          )}
        >
          <div className={css.dialogFields}>
            <Button onClick={() => { setCreateMenuOpen(false); setCreateFormOpen(true) }}>
              {t('createViaForm')}
            </Button>
            <Button
              disabled={customModel}
              onClick={() => {
                setCreateMenuOpen(false)
                props.startCreatorDraft?.()
                props.close()
              }}
            >
              {t('createViaConversation')}
            </Button>
            {customModel && (
              <p className={css.error} role="alert">{t('customModelHint')}</p>
            )}
            <p style={{ margin: 0, fontSize: 12, opacity: 0.65, lineHeight: 1.6 }}>
              {t('sectionIntro')}
            </p>
          </div>
        </Modal>
      )}
      {createFormOpen && (
        <CreateAgentDialog
          t={t}
          onClose={() => { setCreateFormOpen(false) }}
          onCreated={() => {
            setCreateFormOpen(false)
            void load()
          }}
        />
      )}
      <Modal
        open={state.view !== null}
        onClose={() => { props.closeView() }}
        title={state.view === null ? '' : `${t('view')} · ${viewedTitle}`}
        closeLabel={t('close')}
        description={t('composition')}
        className={css.dialog as string}
        footer={(
          <Button variant="outline" autoFocus onClick={() => { props.closeView() }}>
            {t('close')}
          </Button>
        )}
      >
        {state.view === null
          ? null
          : <pre className={css.viewerCode}>{state.view.content}</pre>}
      </Modal>
      <Modal
        open={state.pendingDelete !== null}
        onClose={() => { props.confirmDelete(null) }}
        title={t('deleteTitle')}
        closeLabel={t('close')}
        description={t('deleteDescription')}
        className={css.deleteDialog as string}
        footer={(
          <>
            <Button
              variant="outline"
              autoFocus
              disabled={state.deleting}
              onClick={() => { props.confirmDelete(null) }}
            >
              {t('cancel')}
            </Button>
            <Button
              variant="outline"
              className={css.deleteConfirm}
              disabled={state.deleting}
              onClick={() => { void props.remove() }}
            >
              {state.deleting ? t('deleting') : t('deleteConfirm')}
            </Button>
          </>
        )}
      />
    </div>
  )
}
