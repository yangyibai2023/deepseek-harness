/** The default composer body: the 'conversation.composer.bar' slot entry.
 * Machine state arrives through the standard provide channel
 * (useInput + inputActions); the keyboard/DOM command face and stop arrive
 * through this entry's own inject, whose hooks compartment binds
 * useNotices/useLexicon; layout-phase inputs (variant and placeholder) ride
 * the owner props. Session facts
 * (running/removed/promptError) are self-selected via useSession.
 *
 * The text surface is the shell-owned Lexical editor bound here through
 * ComposerContentEditable; chips render as decorator portals, and the
 * keymap registers submit/menu/paste gestures on the editor command layer.
 * The no-session state renders the SAME div inert as the Workspace-picker
 * trigger instead of a parallel tree.
 */

import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { ChangeEvent, KeyboardEvent, MouseEvent } from 'react'
import clsx from 'clsx'
import {
  IconPlusOutlineMedium, IconPaperclipOutlineRegular, IconWarningOutlineRegular, Toast, Tooltip,
} from '@deepseek-ai/dsh-client-ui-primitives'
// Type-only: the `plan` projection key merge (the TodoDock posture — the
// composer reads a host-computed value; the domain owns the key).
import type {} from '@deepseek-ai/dsh-plan-mode/client'
// Type-only: the `goal` projection key merge (hint disambiguation).
import type {} from '@deepseek-ai/dsh-goal/client'
// The `imageLimits` projection key merge (intake pre-check) arrives with the
// wire types: apiproxy's sessions contract declares it, and client-runtime's
// api-remotes import already places it in every client program.
import { $getRoot } from 'lexical'
import type { Translate } from '@deepseek-ai/dsh-client-ui-slots'
import type { ComposerBarProps } from '../contract/slots.ts'
import { DraftEditor } from '../input/editor/DraftEditor.tsx'
import {
  focusDraftEditor, installDraftFilePicker, installDraftKeymap, installDraftWheel,
  keepDraftFocus, revealDraftSelection,
} from '../input/editor/view-binding.ts'
import { resolveSubmitMode } from '../input/submission-policy.ts'
import { attachmentErrorText, imageSizeText } from '../image-labels.ts'
import { isImageMediaType } from '../service.ts'
import { ContextMeter } from './ContextMeter.tsx'
import { observeControlRow } from './control-row-layout.ts'
import css from './InputBar.module.css'

export type InputBarProps = ComposerBarProps

export const InputBar = memo(function InputBar({
  useSession, useInput, inputActions, keyboard, addFiles, removeAttachment, resolveDraftAttachments,
  retryFileUpload,
  toggleCommandMenu, stop, t,
  renderSlot, useBusyEnter, useFileUploads, useNotices, useLexicon, useMenuLauncher, useStopShortcut,
  useProjection, sessionId, variant, disabled: inert = false, blocked,
  workspacePickerOpen = false, onRequestWorkspace,
  placeholder, accessory,
}: InputBarProps) {
  const input = useInput(s => s)
  const notice = useNotices(s => s)
  const busyEnter = useBusyEnter(s => s)
  const stopKeys = useStopShortcut(keys => keys)
  void useLexicon // hook seat stays bound by the inject compartment; text-ref decoration rides the shell's editor transforms
  const commandMenuOpen = useMenuLauncher(source => source === 'command')
  const [activity, setActivity] = useState(false)
  useEffect(() => { setActivity(false) }, [sessionId])
  const promptError = useSession(s => s.promptError) ?? null
  const running = useSession(s => s.running) ?? false
  const subagent = useSession(s => s.subagent) ?? null
  const removed = useSession(s => s.removed) ?? false
  // Plan mode swaps the composer placeholder (the projection is the folded
  // host value; owner-prop placeholders — hero, session-unavailable — win).
  const planActive = useProjection('plan', plan => plan !== undefined && (plan.pending ? !plan.active : plan.active))
  // Absent (undefined: no frame yet) and cleared (null) both mean no goal.
  const hasGoal = useProjection('goal', goal => goal != null)
  // Session-maybe: the machine faces are absent together while no session is
  // current; the bar renders the same DOM inert instead of a parallel tree.
  const live = input !== undefined && keyboard !== undefined && inputActions !== undefined
  const draft = input?.draft ?? ''
  const editor = keyboard?.editor ?? null
  const attachments = useMemo(
    () => input === undefined || resolveDraftAttachments === undefined ? [] : resolveDraftAttachments(input.attachmentIds),
    [resolveDraftAttachments, input?.attachmentIds],
  )
  const empty = draft.trim() === '' && attachments.length === 0
  const uploads = useFileUploads(snapshot => snapshot)
  // Send waits for every picked file: uploading and failed drafts both hold
  // the gate (a failed upload is retried or removed, never silently dropped).
  const uploadsPending = attachments.some(
    attachment => attachment.kind === 'file' && uploads[attachment.id]?.status !== 'ready',
  )
  // Transient error banner (machine notices, image-intake rejections, and
  // prompt failures): the seq keys the Toast so an identical repeated message
  // restarts the hold-then-fade cycle instead of reusing the faded one.
  const [toast, setToast] = useState<{ seq: number; text: string } | null>(null)
  const toastSeq = useRef(0)
  const showToast = useCallback((text: string) => {
    toastSeq.current += 1
    setToast({ seq: toastSeq.current, text })
  }, [])
  const dismissToast = useCallback(() => { setToast(null) }, [])
  // The deployment's image-intake limits (absent while no attachment service
  // is composed — the pre-check below then defers entirely to the host).
  const imageLimits = useProjection('imageLimits')
  // Prompt failures are ordinary failures (no create/attach transaction exists
  // anymore): the toast announces promptError, the draft stays in the machine,
  // and the user resubmits. A remount over a session whose machine still holds
  // an unresolved promptError deliberately re-announces it once — the failure
  // is still pending, and a transient banner is its only surface. Attachment
  // rejections show product copy keyed by the wire reason — whichever domain
  // refused them. Writer contention has localized recovery guidance; other
  // failures retain the diagnostic message and code.
  useEffect(() => {
    if (promptError === null) return
    const { error } = promptError
    if (error.code === 'session/writer-held') {
      showToast(t('error.sessionInUse'))
      return
    }
    showToast(error.code === 'session/attachment-invalid' || error.code === 'subagent/attachment-invalid'
      ? attachmentErrorText(t, error.details.reason, imageLimits)
      : `${error.message} (${error.code})`)
  }, [promptError, showToast, t, imageLimits])
  useEffect(() => {
    if (notice?.level === 'error') showToast(notice.text)
  }, [notice, showToast])
  const rowRef = useRef<HTMLDivElement | null>(null)
  useLayoutEffect(() => {
    const row = rowRef.current
    if (row === null) return
    return observeControlRow(row)
  }, [])
  const cardRef = useRef<HTMLDivElement | null>(null)
  const scrollRef = useRef<HTMLDivElement | null>(null)

  // A continuable child without its live parent cannot accept human input,
  // but its independent Stop below stays available while it runs.
  const continuable = subagent?.address.mode === 'continuable'
  const parentOffline = continuable && subagent.parentAvailable !== true
  // Running input stays free; locked = session removed, the
  // inert no-workspace state, the machine faces absent (no session), or a
  // parent-offline continuable child. An owner block also disables input;
  // adjudicating and submitting render read-only so the draft stays visible.
  const disabled = removed || inert || !live || blocked !== undefined || parentOffline
  const locked = disabled
  // The model seat is the ONE control a block leaves live: every block this
  // contract has is cleared by choosing a model, so locking it too would leave
  // the composer asking for the only thing it prevents. The other reasons to
  // be disabled do lock it — there is no session to choose a model for.
  const modelSeatLocked = removed || inert || !live
  const machineBusy = input?.phase === 'adjudicating' || input?.phase === 'submitting'
  // The no-workspace surface remains the resident DOM node but acts as the
  // existing picker trigger. Message controls stay locked until a Session
  // exists; the trigger itself is read-only rather than disabled so pointer
  // and keyboard users can reach the recovery action.
  const workspaceTrigger = inert && !removed && onRequestWorkspace !== undefined
  const editorDisabled = removed || (locked && !workspaceTrigger)
  const editable = live && !locked && !machineBusy
  const steeringAvailable = subagent === null || subagent.address.mode === 'continuable'
  const canSteerQueue = !locked && !machineBusy && !commandMenuOpen && empty && running && steeringAvailable
    && input.queue.length > 0

  useEffect(() => {
    if (input === undefined || inputActions === undefined) return
    if (attachments.length !== input.attachmentIds.length) {
      inputActions.pruneAttachments(attachments.map(attachment => attachment.id))
    }
  }, [attachments, input?.attachmentIds, inputActions])

  // Scroll the draft scrollport the minimum that brings the selection focus
  // into view — the browser's own behavior for typing, performed for the
  // paths where it does not act (programmatic focus with preventScroll, and
  // session switches that land the caret off screen). The live DOM selection
  // is the ruler; no mirror layer exists to consult.
  const revealSelection = (): void => {
    revealDraftSelection(scrollRef)
  }

  // Unlock (mount / session switch) returns focus to the box, and owns the
  // reveal that comes with it. Lexical's focus() suppresses the browser's
  // scroll walk (preventScroll inside), so the reveal in our own scrollport
  // is ours to perform — switching to a longer draft otherwise leaves the
  // caret (restored at the draft's end) off screen.
  useEffect(() => {
    if (locked || editor === null) return
    focusDraftEditor(editor, revealSelection)
  }, [locked, sessionId, editor])

  // HeightLab（2026-10-20 回归修复）：模板「做同款」、技能中心「使用」、
  // 视频控制台 prefill 都靠这三个窗口事件往输入框里写内容。0.2.1 合并时
  // 监听端丢失（派发还在，监听为 0），三处功能都在静默失效。
  //
  // 这里补回监听，并新增 `hl:insert-reference` 供「剪辑台」把影片里选中的
  // 片段作为引用塞进草稿 —— 走的是 setDraft 的 DraftSnapshot 形态
  // （text + references），与用户手动 @ 文件产生的引用是同一种数据结构。
  useEffect(() => {
    if (inputActions === undefined) return
    // 焦点必须在草稿写入、React 提交之后再给，否则会被推荐区收起的时序覆盖。
    const focusLater = (): void => {
      window.setTimeout(() => {
        if (editor !== null) focusDraftEditor(editor, revealSelection)
      }, 50)
    }
    const fill = (event: Event): void => {
      const text = (event as CustomEvent<{ text?: unknown }>).detail.text
      if (typeof text !== 'string' || text === '') return
      inputActions.setDraft(text)
      focusLater()
    }
    const send = (event: Event): void => {
      const text = (event as CustomEvent<{ text?: unknown }>).detail.text
      if (typeof text !== 'string' || text === '') return
      inputActions.setDraft(text)
      window.setTimeout(() => { inputActions.submit() }, 80)
    }
    // ref: { label, marker } —— 把「剪辑台」选中的片段追加到草稿末尾。
    //
    // 为什么不用引用芯片：公共契约 `InputActions.setDraft` 只接受纯文本，
    // 芯片要的是 span（`insertReference(ref, span)`），跨插件拿不到。这里用
    // **可读标记**（如「【片段：开场 · 00:12.4–00:18.0】」）追加进正文——
    // 对 Agent 来说它和芯片一样是明确指代，而且会作为消息正文长期留存，
    // 反而更稳（芯片在消息里会退化成文本）。
    const insertReference = (event: Event): void => {
      const detail = (event as CustomEvent<{ marker?: unknown }>).detail
      const marker = typeof detail.marker === 'string' ? detail.marker.trim() : ''
      if (marker === '') return
      const current = draft
      const space = current === '' || current.endsWith(' ') ? '' : ' '
      const insertion = `${space}${marker} `
      const span = inputActions.captureInsertion()
      // insertText 是 revision 守卫的：草稿在这期间被改过就放弃，不覆盖用户输入。
      if (inputActions.insertText(insertion, span)) focusLater()
    }
    /**
     * HeightLab 2026-10-21：模板芯片——「聊天」按钮把模板作为**已选中的对象**
     * 放进输入框，而不是把内部指令原文灌进草稿。
     *
     * 用户只看到模板名（如「中文爽剧带货」）；发送时序列化为 detail.prompt
     * （完整执行指令，含 skill 路径）。这样商业版界面上不会出现
     * `heightlab-studio-router` / `~/.heightlab/yunj-skills/...` 这类内部细节。
     *
     * 为什么走芯片而不是 setDraft：芯片是整体不可分割的实体（删除即整块删），
     * 用户可以接着在后面补充需求，两者一起发送。这正是「选中一个东西」的语义。
     */
    const insertTemplateChip = (event: Event): void => {
      const detail = (event as CustomEvent<{ label?: unknown; prompt?: unknown; skill?: unknown }>).detail
      const label = typeof detail.label === 'string' ? detail.label.trim() : ''
      const prompt = typeof detail.prompt === 'string' ? detail.prompt : ''
      if (label === '' || prompt === '') return
      const skill = typeof detail.skill === 'string' ? detail.skill : label
      // 草稿清空后插入芯片，保证「刚点模板」时输入框里只有这一个胶囊。
      inputActions.setDraft('')
      inputActions.insertChip({
        source: 'heightlab-template',
        ref: skill,
        label,
        appearance: 'file',
        clipboardText: prompt,
      })
      /* 光标必须落在芯片**右侧**（用户要在后面打字补充需求）。
       *
       * 只靠 insertChip 不够：setDraft('') 是离散提交，紧跟的 insertChip 在
       * 同一次 update 批次里可能拿不到刚重建的 selection，实测光标停在芯片
       * 左侧。这里在 focus 之后再显式 selectEnd 一次（下一帧），确保落点稳定。 */
      focusLater()
      window.setTimeout(() => {
        if (editor === null) return
        editor.update(() => {
          const root = $getRoot()
          root.selectEnd()
        }, { discrete: true })
        focusDraftEditor(editor, revealSelection)
      }, 80)
    }
    window.addEventListener('hl:fill-draft', fill)
    window.addEventListener('hl:send-template', send)
    window.addEventListener('hl:insert-template-chip', insertTemplateChip)
    window.addEventListener('hl:insert-reference', insertReference)
    return () => {
      window.removeEventListener('hl:fill-draft', fill)
      window.removeEventListener('hl:send-template', send)
      window.removeEventListener('hl:insert-template-chip', insertTemplateChip)
      window.removeEventListener('hl:insert-reference', insertReference)
    }
  }, [inputActions, draft, editor])

  // A persisted draft arrives AFTER the unlock effect: DefaultConversationViews
  // adopts it in its own mount effect, and a parent's mount effect runs after
  // its children's. Reveal when the draft becomes non-empty so a restored long
  // draft does not stay at its head with the caret at its end. This effect does
  // not focus: send-clear, failed-send restore, and first-character transitions
  // must not steal focus from another control the user moved to.
  useEffect(() => {
    if (locked || draft === '') return
    revealSelection()
  }, [draft !== ''])

  // Wheel chaining on the draft scrollport, one lifetime (it is never
  // unmounted — the inert state renders the same element disabled). While the
  // capped box can still move in this direction, keep the native scroll; only
  // at its own edge forward the delta to the active conversation scrollport, so
  // a short draft never traps the gesture and a long draft stays scrollable.
  // Hero mounts have no host and keep native wheel scrolling.
  useEffect(() => {
    return installDraftWheel(scrollRef)
  }, [])

  // Intake pre-check: an addition that would break a projected image limit is
  // refused as a whole batch, announced immediately, and never enters the
  // rail. Only the image subset is limit-checked: generic files carry no
  // client-side size or count limit and upload as soon as they are picked.
  // The host enforces the same image limits at submit for callers that bypass
  // this composer.
  const intakeFiles = useCallback((files: readonly File[], directories?: ReadonlySet<File>): void => {
    if (locked || machineBusy || (subagent !== null && !continuable) || addFiles === undefined || files.length === 0) return
    const rejected = ((): string | null => {
      // Child prompts support images, but not generic file receipts or the
      // Desktop path-reference fallback. Refuse mixed batches before intake.
      if (continuable && files.some(file => directories?.has(file) || !isImageMediaType(file.type))) {
        return t('image.unsupportedType')
      }
      if (imageLimits !== undefined) {
        const mediaTypes = imageLimits.mediaTypes as readonly string[]
        const images = files.filter(file => mediaTypes.includes(file.type))
        const imageAttachments = attachments.filter(attachment => attachment.kind === 'image')
        if (imageAttachments.length + images.length > imageLimits.maxImagesPerMessage) {
          return t('image.tooMany', { count: imageLimits.maxImagesPerMessage })
        }
        if (images.some(file => file.size > imageLimits.maxImageBytes)) {
          return t('image.fileTooLarge', { size: imageSizeText(imageLimits.maxImageBytes) })
        }
        const total = imageAttachments.reduce((sum, attachment) => sum + attachment.file.size, 0)
          + images.reduce((sum, file) => sum + file.size, 0)
        if (total > imageLimits.maxMessageImageBytes) {
          return t('image.totalTooLarge', { size: imageSizeText(imageLimits.maxMessageImageBytes) })
        }
      }
      return addFiles(files, directories)
    })()
    if (rejected !== null) showToast(rejected)
  }, [locked, machineBusy, subagent, continuable, addFiles, attachments, imageLimits, showToast, t])

  const canAcceptDrop = (subagent === null || continuable) && !locked && !machineBusy && addFiles !== undefined

  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const onPickFiles = (e: ChangeEvent<HTMLInputElement>): void => {
    const picked = e.target.files === null ? [] : [...e.target.files]
    // Reset so picking the same file again re-fires the change event.
    e.target.value = ''
    if (picked.length > 0) intakeFiles(picked)
  }

  // The keymap handlers read live bar state through this ref so the editor
  // registration survives re-renders without re-arming per keystroke.
  const gate = useRef({
    locked, machineBusy, canSteerQueue, running, steeringAvailable, busyEnter,
    intakeFiles, uploadsPending, showToast, t, canAcceptDrop,
  })
  gate.current = {
    locked, machineBusy, canSteerQueue, running, steeringAvailable, busyEnter,
    intakeFiles, uploadsPending, showToast, t, canAcceptDrop,
  }

  useEffect(() => {
    if (keyboard === undefined) return
    return installDraftFilePicker(keyboard, gate, fileInputRef)
  }, [keyboard])

  useEffect(() => {
    if (editor === null || keyboard === undefined) return
    return installDraftKeymap(editor, keyboard, gate)
  }, [editor, keyboard])

  // Button presses steal focus from the editor; suppress at mousedown so
  // typing continues seamlessly. Lexical's focus() carries preventScroll and
  // restores the previous selection, so no reveal is needed: the caret has
  // not moved, and the next keystroke gets the browser's native one.
  const keepFocus = (e: MouseEvent<HTMLButtonElement>): void => {
    keepDraftFocus(e, editor)
  }

  const onCardMouseDown = (e: MouseEvent<HTMLDivElement>): void => {
    if (!editable || editor === null || e.button !== 0 || e.defaultPrevented) return
    const target = e.target
    if (!(target instanceof Element) || !e.currentTarget.contains(target)) return
    if (target.closest('[data-composer-overlay]') !== null) return
    if (scrollRef.current?.contains(target)) return
    const control = target.closest('button, a, input, select, textarea, [role="button"], [contenteditable], [tabindex]')
    if (control !== null && e.currentTarget.contains(control)) return
    e.preventDefault()
    // Lexical's stored selection can lag behind native caret moves, so calling
    // editor.focus() on a focused editor can restore an older caret.
    if (document.activeElement !== editor.getRootElement()) focusDraftEditor(editor, revealSelection)
  }

  const onToggleCommandMenu = (): void => {
    if (keyboard === undefined) return
    // The menu is a combobox over the editor, so the keyboard has to be there
    // before the launcher opens it: activating the button from the keyboard
    // leaves focus on the button, and restoring it afterwards would re-track an
    // empty draft and close the menu again.
    if (editor !== null) focusDraftEditor(editor, revealSelection)
    toggleCommandMenu?.(keyboard.caretSpan())
  }

  // The no-session Workspace trigger: the resident editable div acts as the
  // picker trigger for keyboard users (no editor is bound in this state).
  const onWorkspaceKeyDown = (e: KeyboardEvent<HTMLDivElement>): void => {
    if (!workspaceTrigger) return
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      onRequestWorkspace()
    }
  }

  // An ordinary running session keeps Stop while the composer is empty or
  // owner-blocked; an actionable draft gets the busy Send action, delivered
  // through the same mode plain Enter resolves to. The label names that mode
  // only when the click would deliver a plain message right now — an enabled
  // button (no pending upload) over a non-empty draft that is neither a
  // claimed command nor a `/` line headed for adjudication — so it never
  // describes a delivery the click cannot or does not perform; every other
  // state keeps plain Send. A continuable child keeps Send primary and
  // exposes Stop independently.
  const primaryStops = running && subagent === null && (empty || blocked !== undefined)
  // Disabled native buttons may omit mouseleave; their tooltip must close from state.
  const primaryDisabled = primaryStops ? stop === undefined : empty || disabled || machineBusy || uploadsPending
  const interruptible = running && continuable
  const primarySubmitMode = resolveSubmitMode(busyEnter, running, 'enter', steeringAvailable)
  const plainMessageDraft = !empty && input?.phase === 'plain' && !draft.trimStart().startsWith('/')
  const primaryLabel = primaryStops
    ? t('input.stop')
    : running && steeringAvailable && !disabled && !uploadsPending && plainMessageDraft
      ? t(primarySubmitMode === 'steer' ? 'input.send.steer' : 'input.send.queue')
      : t('input.send')
  const onPrimary = (): void => {
    if (primaryStops) {
      stop?.()
      return
    }
    if (keyboard === undefined) return // absent machine: the button is disabled
    /* v8 ignore next -- defensive: the primary button is disabled for empty, disabled, and pending-upload states. */
    if (!empty && !disabled && !machineBusy && !uploadsPending) keyboard.submit(primarySubmitMode, 'click')
  }

  // Claim ghost hint: rendered by CSS as generated content after the last
  // paragraph while the claim's args are blank (a hint implies a single-line
  // token draft). The translated per-command hint wins over the claim's own.
  const claimActive = (input?.phase === 'claimed' || input?.phase === 'submitting')
    && input.claim !== undefined && draft.startsWith(input.claim.token)
  const rawHint = claimActive && input.claim.hint !== undefined
    && draft.slice(input.claim.token.length).trim() === ''
    ? input.claim.hint
    : null
  const hint = ((): string | null => {
    if (rawHint === null) return null
    const commandName = input?.claim?.name ?? ''
    const hintKey = `hint.${commandName === 'goal' && hasGoal ? 'goal.active' : commandName}`
    // Dynamic lookup by claimed command name: unknown commands miss the
    // dictionary and keep the machine's own hint, so the call is wide.
    const translated = (t as Translate)(hintKey)
    return translated !== hintKey ? translated : rawHint
  })()

  const placeholderText = placeholder ?? (parentOffline
    ? t('placeholder.parentOffline')
    : disabled
      ? t('placeholder.unavailable')
      // The steer hint deliberately outranks the plan placeholder:
      // while it shows, the whole-queue gesture is genuinely available
      // (the gate never consults plan mode), so the actionable hint wins.
      : canSteerQueue
        ? t('placeholder.steerQueue')
        : planActive ? t('placeholder.plan') : t('placeholder.default'))

  return (
    <div className={clsx(css.root, variant === 'hero' && css.hero)}>
      {toast !== null && (
        <Toast
          key={toast.seq}
          text={toast.text}
          icon={<IconWarningOutlineRegular />}
          anchor={cardRef.current}
          onDone={dismissToast}
        />
      )}
      {notice?.level === 'info' && (
        <div className={css.notice} role="status">
          {notice.text}
        </div>
      )}
      {/* Trigger clicks land on the card, not the editor: the toolbar row's
          disabled controls swallow clicks otherwise (the CSS state disarms
          their pointer events), so the WHOLE capsule is the pick target.
          pointerdown stops here so the Menu's outside-close cannot race the
          click's reopen (close-then-open flickers the chip's open echo). */}
      <div
        ref={cardRef}
        className={clsx(css.card, workspaceTrigger && css.cardWorkspaceTrigger)}
        data-composer-card
        onClick={workspaceTrigger ? onRequestWorkspace : undefined}
        onPointerDown={workspaceTrigger ? (e) => { e.stopPropagation() } : undefined}
        onMouseDown={onCardMouseDown}
      >
        {sessionId !== undefined && (
          <div className={css.overlayAnchor} data-composer-overlay>{renderSlot('conversation.input.overlay', {})}</div>
        )}
        {accessory !== undefined && <div className={css.accessory}>{accessory}</div>}
        {renderSlot('conversation.input.attachments', {
          attachments,
          canAcceptDrop,
          onAddFiles: intakeFiles,
          onRemoveAttachment: (id) => { removeAttachment?.(id) },
          uploads,
          onRetryFile: (id) => { retryFileUpload?.(id) },
          dropLimits: imageLimits === undefined ? undefined : {
            count: imageLimits.maxImagesPerMessage,
            size: imageSizeText(imageLimits.maxImageBytes),
          },
        })}
        {/* One scrollport, one text surface: the contenteditable grows with
            its content and .scroll — capped at 14 lines in CSS — is the only
            thing that scrolls. Chips are decorator portals inside the same
            surface, so wrapping, caret geometry, and scrolling are the
            browser's own. */}
        <DraftEditor
          classNames={css}
          editor={editor}
          scrollRef={scrollRef}
          editable={editable}
          editorDisabled={editorDisabled}
          phase={input?.phase ?? 'inert'}
          placeholderText={placeholderText}
          ariaLabel={workspaceTrigger ? t('hero.chooseWorkspace') : placeholderText}
          workspaceTrigger={workspaceTrigger}
          workspacePickerOpen={workspacePickerOpen}
          onWorkspaceKeyDown={onWorkspaceKeyDown}
          hint={hint}
          showPlaceholder={draft === '' && attachments.length === 0 && !claimActive}
        />
        <div ref={rowRef} className={css.row}>
          <div className={css.tools} hidden={activity}>
            <Tooltip label={t('input.commands')} side="top" delayMs={500}>
              <button
                type="button"
                className={css.add}
                aria-label={t('input.commands')}
                aria-haspopup="listbox"
                aria-expanded={commandMenuOpen}
                disabled={locked || toggleCommandMenu === undefined}
                onMouseDown={keepFocus}
                onClick={onToggleCommandMenu}
              >
                <IconPlusOutlineMedium size={14} />
              </button>
            </Tooltip>
            {/* HeightLab：附件纸夹按钮（0.4.1 布局；上游 0.2.1 收进了命令菜单）。 */}
            <Tooltip label={t('file.attach')} side="top" delayMs={500}>
              <button
                type="button"
                className={css.add}
                aria-label={t('file.attach')}
                disabled={subagent !== null || locked || machineBusy || addFiles === undefined}
                onMouseDown={keepFocus}
                onClick={() => { fileInputRef.current?.click() }}
              >
                <IconPaperclipOutlineRegular size={14} />
              </button>
            </Tooltip>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              disabled={subagent !== null}
              hidden
              onChange={onPickFiles}
            />
            <div className={css.modes}>
              {sessionId === undefined ? null : renderSlot('conversation.input.permission', { locked })}
              {sessionId === undefined ? null : renderSlot('conversation.input.plan', { locked })}
            </div>
            {input === undefined || sessionId === undefined
              ? null
              : renderSlot('conversation.input.left', {})}
          </div>
          <div className={clsx(css.trailing, activity && css.trailingActive)}>
            <div className={css.standardControls} hidden={activity}>
              {input === undefined || sessionId === undefined
                ? null
                : renderSlot('conversation.input.right', {})}
              {/* HeightLab（2026-10-17 用户拍板）：输入框不再显示智能体选择器。
                  理由：用户始终通过 Colin 对话、由 Colin 派工，自己选专家没有意义，
                  选错反而出问题；设置→Agent 管理里仍可查看（槽位注册保留）。
                  恢复 = 将 HIDE_INPUT_AGENT_PRESET 改为 false。 */}
              {/* 常量写死为 true，条件在类型层恒真——oxlint 会报
                  no-unnecessary-condition。改成读运行时全局开关，既能真恢复
                  （控制台设 __HL_SHOW_AGENT_PRESET__ = true 再刷新），
                  又不会被静态推断成恒真（同 index.ts 的文件入口开关手法）。 */}
              {(globalThis as { __HL_SHOW_AGENT_PRESET__?: boolean }).__HL_SHOW_AGENT_PRESET__ !== true
                || sessionId === undefined
                ? null
                : renderSlot('conversation.input.agentPreset', {})}
              {/* HeightLab（2026-10-18 用户拍板）：ContextMeter 圆环挪到模型
                  按钮左侧——模型/思考程度整体右移靠发送按钮，圆环居左。 */}
              {activity ? null : <ContextMeter useProjection={useProjection} t={t} />}
              {sessionId === undefined ? null : renderSlot('conversation.input.model', { locked: modelSeatLocked })}
            </div>
            {input === undefined || sessionId === undefined ? null : <div className={activity ? css.activityExpanded : css.activity}>
              {renderSlot('conversation.input.activity', { locked, onActiveChange: setActivity })}
            </div>}
            {interruptible && (
              <Tooltip label={t('input.stop')} shortcutKeys={stopKeys} side="top" delayMs={500} disabled={stop === undefined}>
                <button
                  type="button"
                  className={css.primary}
                  aria-label={t('input.stop')}
                  disabled={stop === undefined}
                  onMouseDown={keepFocus}
                  onClick={stop}
                >
                  <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden>
                    <rect x="3" y="3" width="10" height="10" rx="3" fill="currentColor" />
                  </svg>
                </button>
              </Tooltip>
            )}
            <Tooltip label={primaryStops ? t('input.stop') : primaryLabel} shortcutKeys={primaryStops ? stopKeys : undefined} side="top" delayMs={500} disabled={primaryDisabled}>
              <button
                type="button"
                className={css.primary}
                aria-label={primaryLabel}
                disabled={primaryDisabled}
                onMouseDown={keepFocus}
                onClick={onPrimary}
              >
                {primaryStops ? (
                  <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden>
                    <rect x="3" y="3" width="10" height="10" rx="3" fill="currentColor" />
                  </svg>
                ) : (
                  <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden>
                    <path d="M8.3125 0.980183C8.66767 1.0531 8.97902 1.20418 9.2627 1.43233C9.48724 1.61297 9.73029 1.85793 9.97949 2.10714L14.707 6.83468L13.293 8.24874L9 3.95577V15.0417H7V3.95577L2.70703 8.24874L1.29297 6.83468L6.02051 2.10714C6.26971 1.85793 6.51277 1.61297 6.7373 1.43233C6.97662 1.23986 7.28445 1.04402 7.6875 0.980183C7.8973 0.947006 8.1031 0.95516 8.3125 0.980183Z" fill="currentColor" />
                  </svg>
                )}
              </button>
            </Tooltip>
          </div>
        </div>
      </div>
      <div className={css.dock} data-composer-dock>
        {variant === 'composer' && input !== undefined && sessionId !== undefined
          ? renderSlot('conversation.composer.dock', {})
          : null}
      </div>
    </div>
  )
})
