/**
 * HeightLab 创作控制台（营销模式试点：视频复刻）。
 * 分区：①复刻基准（虚线大上传框+缩略图） ②修改元素（图+文字配对）
 * ③生成参数（默认折叠+当前值摘要行）。
 * 会话语义（2026-09-19 用户拍板）：切到老会话=恢复该会话自己的工作流与
 * 草稿；切到新会话/无状态会话=全部清空（进度归零、素材清空、参数回默认）。
 * 草稿只在用户真实交互后落盘（dirtyRef 脏标记），杜绝跨会话残留被固化。
 * 语音/字幕默认「智能识别（跟随原片）」：按阶段1/2 对原片的真实分析判定，
 * 判定规则写进任务文本由模型执行，禁止猜测。
 * 上方进度条经 /hl/workflow-state 轮询真实工作流状态（FY1-M2）；
 * 「生成视频」= dispatch hl:send-template（复用输入框自动发送通道）。
 */
import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { schemaForSkill, type TemplateSchema } from './templateSchemas.ts'
import { VIDEO_REPLICATION_SCHEMA } from './schema.ts'
import css from './console.module.css'

export interface ConsoleBodyProps extends PropsRuntime<'sidebar.right.pane.tab'> {}

interface SlotEntry {
  name: string
  path?: string | undefined
  refLines?: string[] | undefined
}

interface AssetEntry {
  id: string
  kind: string
  name: string
  path?: string | undefined
  url?: string | undefined
  refLines?: string[] | undefined
  origin?: string | undefined
  use_count?: number | undefined
  last_used_at?: string | undefined
}

interface WorkflowProgress {
  stage: string
  status: string
  detail: string
}

type VoiceChoice = 'auto' | 'vo' | 'asset' | 'silent' | 'original' | 'origclone'
type SubtitleChoice = 'auto' | 'burn' | 'none'

/** 预估积分折算表（每秒积分，按清晰度；数值可在常数处统一调整）。 */
const CREDITS_PER_SECOND: Record<string, number> = { '768P': 1, '2K': 2 }
const STAGES = ['拆解', '方案确认', '生成', '质检', '交付'] as const
const SLOT_KIND: Record<string, string> = {
  'source-video': '视频',
  'product-images': '产品',
  'character-images': '人物',
  'background-images': '场景',
}

async function uploadAsset(kind: 'video' | 'image', file: File): Promise<string> {
  const endpoint = kind === 'video' ? '/hl/upload-video' : '/hl/upload-image'
  const data = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '')
    reader.onerror = () => reject(new Error('读取文件失败'))
    reader.readAsDataURL(file)
  })
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ data, mimeType: file.type || (kind === 'video' ? 'video/mp4' : 'image/png'), name: file.name }),
  })
  const json = (await res.json()) as { ok?: boolean; path?: string }
  if (!json.ok || typeof json.path !== 'string') throw new Error('上传失败')
  return json.path
}

async function registerAsset(kind: string, name: string, path: string): Promise<void> {
  try {
    await fetch('/hl/assets', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ kind, name, path, source: 'upload' }),
    })
  } catch { /* 归档失败不影响主流程 */ }
}

/** 本地媒体经 local-media 通道回放（Range 206），裸本地路径在聊天里渲染为问号。 */
function mediaUrl(path: string): string {
  const isVideo = /\.(mp4|mov|m4v|webm|avi|mkv)$/i.test(path)
  return `/hl/local-media/${isVideo ? 'video.mp4' : 'image.jpg'}?path=${encodeURIComponent(path)}`
}

export function ConsoleBody(props: ConsoleBodyProps): ReactNode {
  // HeightLab V27：slot runtime 注入的当前会话身份（UI 切换会话即实时变化）——
  // 替代此前的 /hl/current-session 轮询（该文件只在消息 turn 开始时写盘，
  // 切会话不发消息则永不更新 = 「所有会话共享最后一次状态」串扰的根因）。
  const { sessionId: runtimeSessionId } = props
  const defaultFields = (): Record<string, string> => {
    const init: Record<string, string> = {}
    for (const f of VIDEO_REPLICATION_SCHEMA.fields) {
      if (f.kind === 'select') init[f.id] = f.options?.[0]?.value ?? ''
    }
    return init
  }
  const [model, setModel] = useState(VIDEO_REPLICATION_SCHEMA.models[0]?.value ?? '')
  const [ratio, setRatio] = useState(VIDEO_REPLICATION_SCHEMA.ratios[0]?.value ?? '9:16')
  const [resolution, setResolution] = useState(VIDEO_REPLICATION_SCHEMA.resolutions[0]?.value ?? '768P')
  const [seconds, setSeconds] = useState(VIDEO_REPLICATION_SCHEMA.seconds.defaultValue)
  const [durationMode, setDurationMode] = useState<'same' | 'custom'>('same')
  const [voice, setVoice] = useState<VoiceChoice>('auto')
  const [subtitle, setSubtitle] = useState<SubtitleChoice>('auto')
  // V40：模板工作台模式——首页模板卡点击进入（hl:open-template-console），
  // 右侧面板按该模板 skill 的参数 schema 渲染；普通控制台入口（hl:open-console
  // /hl:start-replication）清除本模式。sessionStorage 持久化以扛 tab 重挂载。
  const [templateSchema, setTemplateSchema] = useState<TemplateSchema | null>(null)
  const [templateName, setTemplateName] = useState('')
  const [templateValues, setTemplateValues] = useState<Record<string, string>>({})
  useEffect(() => {
    try {
      const saved = sessionStorage.getItem('hl-template-console')
      if (saved !== null) {
        const parsed = JSON.parse(saved) as { template?: string; skill?: string }
        if (parsed.skill !== undefined) {
          setTemplateSchema(schemaForSkill(parsed.skill))
          setTemplateName(parsed.template ?? '')
        }
      }
    } catch { /* 非致命 */ }
    const onOpen = (e: Event): void => {
      const detail = (e as CustomEvent<{ template?: string; skill?: string }>).detail ?? {}
      setTemplateSchema(schemaForSkill(detail.skill ?? ''))
      setTemplateName(detail.template ?? '')
      setTemplateValues({})
      try { sessionStorage.setItem('hl-template-console', JSON.stringify({ template: detail.template ?? '', skill: detail.skill ?? '' })) } catch { /* 非致命 */ }
      dirtyRef.current = true
    }
    const onClear = (): void => {
      setTemplateSchema(null)
      try { sessionStorage.removeItem('hl-template-console') } catch { /* 非致命 */ }
    }
    window.addEventListener('hl:open-template-console', onOpen)
    window.addEventListener('hl:open-console', onClear)
    return () => {
      window.removeEventListener('hl:open-template-console', onOpen)
      window.removeEventListener('hl:open-console', onClear)
    }
  }, [])
  const [execution, setExecution] = useState<'step' | 'once'>('step')
  const [count, setCount] = useState(1)
  // 拆解抽帧密度（interval 秒/帧，云镜 extract_frames 参数）：1=标准（每秒1帧）、
  // 0.5=精细、2=快速。35s 视频默认出 35 帧。
  const [frameInterval, setFrameInterval] = useState<'0.5' | '1' | '2'>('1')
  // 复刻方式（2026-09-19 用户拍板）：storyboard=分镜驱动（云镜原版，默认）；
  // pixel=像素复刻（逐段带原片分段 video_paths 视频参考）。
  const [repMode, setRepMode] = useState<'storyboard' | 'pixel'>('storyboard')
  const [fields, setFields] = useState<Record<string, string>>(defaultFields)
  const [slots, setSlots] = useState<Record<string, SlotEntry[]>>({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [progress, setProgress] = useState<WorkflowProgress | null>(null)
  const [picker, setPicker] = useState<{ slotId: string; kind: string } | null>(null)
  const [assetList, setAssetList] = useState<AssetEntry[]>([])
  const [voiceAsset, setVoiceAsset] = useState<AssetEntry | null>(null)
  // 会话感知（V27 修正）：sessionId 来自 slot runtime 的实时注入（UI 切换
  // 会话即变化），语义（2026-09-19 拍板）：老会话有复刻状态/草稿 → 恢复；
  // 新会话/无关会话 → 全部清空（进度归零）。
  const sessionId = typeof runtimeSessionId === 'string' ? runtimeSessionId : ''
  // 脏标记：只有用户真实交互过的表单才允许落盘草稿——会话切换时的
  // 重置/恢复动作不算交互，防止上个会话的残留被固化成新会话的草稿。
  const dirtyRef = useRef(false)

  const resetAll = (): void => {
    setModel(VIDEO_REPLICATION_SCHEMA.models[0]?.value ?? '')
    setRatio(VIDEO_REPLICATION_SCHEMA.ratios[0]?.value ?? '9:16')
    setResolution(VIDEO_REPLICATION_SCHEMA.resolutions[0]?.value ?? '768P')
    setSeconds(VIDEO_REPLICATION_SCHEMA.seconds.defaultValue)
    setDurationMode('same')
    setVoice('auto')
    setSubtitle('auto')
    setExecution('step')
    setCount(1)
    setFrameInterval('1')
    setRepMode('storyboard')
    setFields(defaultFields())
    setSlots({})
    setVoiceAsset(null)
    setError('')
    setPicker(null)
  }

  // 会话切换驱动（V27 修正）：sessionId 变化（含首挂）即拉取该会话的
  // 工作流与草稿——有则恢复、无则全清。同步清 dirtyRef 防止「A 的内容经
  // 保存 effect 串写进 B 的草稿」。
  useEffect(() => {
    if (sessionId === '') return
    let alive = true
    dirtyRef.current = false
    const load = async (): Promise<void> => {
      try {
        const res = await fetch(`/hl/console-state?session=${encodeURIComponent(sessionId)}`)
        const state = (await res.json()) as {
          workflow?: { template?: string; stage?: string; status?: string; detail?: string } | null
          draft?: Record<string, unknown> | null
        }
        if (!alive) return
        if (state.workflow?.template === '视频复刻') {
          setProgress({
            stage: state.workflow.stage ?? '',
            status: state.workflow.status ?? '',
            detail: state.workflow.detail ?? '',
          })
          window.dispatchEvent(new CustomEvent('hl:open-console'))
        } else {
          // 新会话/无关会话：进度归零——绝不显示上一个会话的完成态。
          setProgress(null)
        }
        if (state.draft !== null && state.draft !== undefined) restoreDraft(state.draft)
        else resetAll()
      } catch { /* 静默：宿主未就绪 */ }
    }
    void load()
    return () => { alive = false }
  }, [sessionId])

  // Dock 快捷标签同步（2026-09-19）：复刻模式下输入框上方的快捷标签
  // 远程切换控制台的复刻方式/语音/字幕（外部用户意图，计入脏标记落盘）。
  useEffect(() => {
    const onMode = (e: Event): void => {
      const v = (e as CustomEvent<{ value?: unknown }>).detail?.value
      if (v === 'storyboard' || v === 'pixel') { dirtyRef.current = true; setRepMode(v) }
    }
    const onVoice = (e: Event): void => {
      const v = (e as CustomEvent<{ value?: unknown }>).detail?.value
      if (v === 'auto' || v === 'vo' || v === 'asset' || v === 'silent' || v === 'original' || v === 'origclone') { dirtyRef.current = true; setVoice(v) }
    }
    const onSubtitle = (e: Event): void => {
      const v = (e as CustomEvent<{ value?: unknown }>).detail?.value
      if (v === 'auto' || v === 'burn' || v === 'none') { dirtyRef.current = true; setSubtitle(v) }
    }
    window.addEventListener('hl:rep-mode', onMode)
    window.addEventListener('hl:rep-voice', onVoice)
    window.addEventListener('hl:rep-subtitle', onSubtitle)
    return () => {
      window.removeEventListener('hl:rep-mode', onMode)
      window.removeEventListener('hl:rep-voice', onVoice)
      window.removeEventListener('hl:rep-subtitle', onSubtitle)
    }
  }, [])

  const restoreDraft = (draft: Record<string, unknown>): void => {
    if (typeof draft.model === 'string') setModel(draft.model)
    if (typeof draft.ratio === 'string') setRatio(draft.ratio)
    if (typeof draft.resolution === 'string') setResolution(draft.resolution)
    if (typeof draft.seconds === 'number') setSeconds(draft.seconds)
    if (draft.durationMode === 'custom' || draft.durationMode === 'same') setDurationMode(draft.durationMode)
    if (draft.voice === 'auto' || draft.voice === 'vo' || draft.voice === 'silent' || draft.voice === 'asset' || draft.voice === 'original' || draft.voice === 'origclone') setVoice(draft.voice)
    if (draft.subtitle === 'auto' || draft.subtitle === 'burn' || draft.subtitle === 'none') setSubtitle(draft.subtitle)
    if (draft.execution === 'step' || draft.execution === 'once') setExecution(draft.execution)
    if (draft.repMode === 'storyboard' || draft.repMode === 'pixel') setRepMode(draft.repMode)
    if (typeof draft.count === 'number') setCount(draft.count)
    if (draft.frameInterval === '0.5' || draft.frameInterval === '1' || draft.frameInterval === '2') setFrameInterval(draft.frameInterval)
    if (draft.fields !== null && typeof draft.fields === 'object') {
      setFields(draft.fields as Record<string, string>)
    }
    if (draft.slots !== null && typeof draft.slots === 'object') {
      setSlots(draft.slots as Record<string, SlotEntry[]>)
    }
  }

  const buildDraft = (): Record<string, unknown> => ({
    model, ratio, resolution, seconds, durationMode, voice, subtitle, execution, count, repMode, frameInterval,
    fields, slots,
    voiceAssetName: voiceAsset?.name ?? null,
    updatedAt: new Date().toISOString(),
  })

  // 复刻会话登记（V28 提前到挂载即登记；V27 时挂在草稿保存成功之后，零
  // 交互的会话切走再切回会漏登记，导致切入时不自动带回工作台）。
  useEffect(() => {
    if (sessionId === '') return
    try {
      const list = JSON.parse(localStorage.getItem('hl-replication-sessions') ?? '[]')
      if (Array.isArray(list) && !list.includes(sessionId)) {
        list.push(sessionId)
        localStorage.setItem('hl-replication-sessions', JSON.stringify(list.slice(-50)))
      }
    } catch { /* 非致命 */ }
  }, [sessionId])

  // 草稿保存：参数/素材变化后 2 秒去抖落盘（按当前会话隔离），且仅在用户
  // 真实交互后（dirtyRef）——重置/恢复引起的 state 变化不落盘。
  useEffect(() => {
    if (sessionId === '' || !dirtyRef.current) return
    const timer = window.setTimeout(() => {
      void fetch('/hl/console-draft', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ session: sessionId, draft: buildDraft() }),
      }).catch(() => undefined)
    }, 2000)
    return () => window.clearTimeout(timer)
  }, [sessionId, model, ratio, resolution, seconds, durationMode, voice, subtitle, execution, count, repMode, frameInterval, fields, slots, voiceAsset])

  const openPicker = async (slotId: string, kind: string): Promise<void> => {
    setPicker({ slotId, kind })
    const all = await fetchMergedAssets()
    // 槽位分类过滤（用户拍板）：人物槽只列人物、场景槽只列场景……
    // 「其他」（历史上传的未分类素材）在所有槽可见，避免资产被藏住。
    const slotKinds: Record<string, readonly string[]> = {
      'source-video': ['视频'],
      'product-images': ['产品', '其他'],
      'character-images': ['人物', '其他'],
      'background-images': ['场景', '其他'],
    }
    const allowed = slotKinds[slotId] ?? [kind]
    setAssetList(all.filter(a => allowed.includes(a.kind)))
  }

  /**
   * 合并四个来源：本地资产登记表（/hl/assets，含历史上传与自动归档）、
   * 设置→人物（characters）、设置→场景（scenes）、设置→声音克隆（/hl/voices）。
   * 全部以统一条目呈现，kind 标注来源，任一来源失败不影响其他。
   */
  const fetchMergedAssets = async (): Promise<AssetEntry[]> => {
    const merged: AssetEntry[] = []
    const local: Array<Promise<void>> = []
    local.push((async () => {
      try {
        const res = await fetch('/hl/assets')
        const json = (await res.json()) as { assets?: Array<Record<string, unknown>> }
        for (const a of json.assets ?? []) {
          merged.push({
            id: String(a.id ?? ''), kind: String(a.kind ?? '其他'), name: String(a.name ?? ''),
            path: typeof a.path === 'string' ? a.path : undefined,
            origin: String(a.source ?? '资产库'), use_count: typeof a.use_count === 'number' ? a.use_count : 0,
            last_used_at: typeof a.last_used_at === 'string' ? a.last_used_at : undefined,
          })
        }
      } catch { /* 本地源失败忽略 */ }
    })())
    local.push((async () => {
      try {
        const res = await fetch('/api/content-tools/video-assets/characters')
        const json = (await res.json()) as { data?: { items?: Array<Record<string, unknown>> } }
        for (const it of json.data?.items ?? []) {
          const name = String(it.name ?? '人物资产')
          const videoUrl = typeof it.video_url === 'string' ? it.video_url : ''
          const audioUrl = typeof it.audio_url === 'string' && it.audio_url !== '' ? it.audio_url : null
          const refLines = [`- 人物资产：已选择（${name}）`, `  人物视频参考 URL：${videoUrl}`]
          if (audioUrl !== null) refLines.push(`  人物声音参考 URL：${audioUrl}`)
          merged.push({
            id: `set-char-${String(it.character_reference ?? name)}`,
            kind: '人物', name, url: videoUrl, refLines, origin: '设置资产',
            use_count: 0, last_used_at: undefined,
          })
        }
      } catch { /* 设置人物源失败忽略 */ }
    })())
    local.push((async () => {
      try {
        const res = await fetch('/api/content-tools/video-assets/scenes')
        const json = (await res.json()) as { data?: { items?: Array<Record<string, unknown>> } }
        for (const it of json.data?.items ?? []) {
          const name = String(it.name ?? '场景资产')
          const imageUrl = typeof it.image_url === 'string' ? it.image_url : ''
          merged.push({
            id: `set-scene-${String(it.scene_reference ?? name)}`,
            kind: '场景', name, url: imageUrl,
            refLines: [`- 场景：已选择（${name}）`, `  场景图片参考 URL：${imageUrl}`],
            origin: '设置资产', use_count: 0, last_used_at: undefined,
          })
        }
      } catch { /* 设置场景源失败忽略 */ }
    })())
    local.push((async () => {
      try {
        const res = await fetch('/hl/voices')
        const json = (await res.json()) as { data?: { items?: Array<Record<string, unknown>> }; items?: Array<Record<string, unknown>> }
        for (const it of json.data?.items ?? json.items ?? []) {
          const ref = String(it.voice_reference ?? it.id ?? '')
          if (ref === '') continue
          const name = String(it.title ?? it.name ?? ref)
          // 公网参考 URL 优先（生成侧 audio_urls 需要 http(s)，云端可达）
          const publicUrl = typeof it.url === 'string' && it.url !== '' ? it.url : ''
          merged.push({
            id: `set-voice-${ref}`, kind: '声音', name,
            url: publicUrl !== '' ? publicUrl : ref,
            refLines: publicUrl !== ''
              ? [`- 音色：用户资产声音「${name}」，声音参考 URL：${publicUrl}（显式指定，非自动附加）`]
              : [`- 音色：用户资产声音「${name}」（${ref}），生成时经 video_assets 查询参考 URL`],
            origin: '设置·声音克隆', use_count: 0, last_used_at: undefined,
          })
        }
      } catch { /* 声音源失败忽略 */ }
    })())
    await Promise.all(local)
    return merged
  }

  const openVoicePicker = async (): Promise<void> => {
    setPicker({ slotId: 'voice', kind: '声音' })
    setAssetList(await fetchMergedAssets())
  }

  const pickAsset = (a: AssetEntry): void => {
    if (picker === null) return
    dirtyRef.current = true
    if (picker.slotId === 'voice') {
      setVoiceAsset(a)
      setVoice('asset')
    } else {
      setSlots(prev => ({
        ...prev,
        [picker.slotId]: [{
          name: a.name,
          ...(a.path !== undefined ? { path: a.path } : {}),
          ...(a.refLines !== undefined ? { refLines: a.refLines } : {}),
        }],
      }))
    }
    void fetch('/hl/assets', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ use_id: a.id }),
    }).catch(() => undefined)
    setPicker(null)
  }

  const setFiles = async (slotId: string, kind: 'video' | 'image', fileList: FileList | null, inputEl?: HTMLInputElement): Promise<void> => {
    if (fileList === null || fileList.length === 0) return
    setBusy(true)
    setError('')
    try {
      // V27 修复：先快照 FileList 再立即清空 input value——否则删除素材后
      // 重新选择同一文件时 value 未变、onChange 不触发（浏览器经典陷阱），
      // 表现为「删除后传不了了」。
      const files = Array.from(fileList)
      if (inputEl !== undefined) inputEl.value = ''
      const incoming: SlotEntry[] = []
      for (const file of files) {
        const path = await uploadAsset(kind, file)
        incoming.push({ name: file.name, path })
        void registerAsset(SLOT_KIND[slotId] ?? '其他', file.name, path)
      }
      dirtyRef.current = true
      setSlots(prev => {
        // 追加语义：图片槽多次上传累加（不超过 max）；原视频槽 max=1 即替换。
        const spec = VIDEO_REPLICATION_SCHEMA.slots.find(s => s.id === slotId)
        const merged = [...(prev[slotId] ?? []), ...incoming]
        return { ...prev, [slotId]: spec?.max === undefined ? merged : merged.slice(0, spec.max) }
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : '上传失败')
    } finally {
      setBusy(false)
    }
  }

  const removeSlotEntry = (slotId: string, index: number): void => {
    dirtyRef.current = true
    setSlots(prev => ({ ...prev, [slotId]: (prev[slotId] ?? []).filter((_, n) => n !== index) }))
  }

  const sourceVideo = slots['source-video']?.[0]
  const canGenerate = sourceVideo !== undefined && !busy

  const findField = (id: string): (typeof VIDEO_REPLICATION_SCHEMA.fields)[number] => {
    const f = VIDEO_REPLICATION_SCHEMA.fields.find(x => x.id === id)
    if (f === undefined) throw new Error(`console schema missing field: ${id}`)
    return f
  }

  const generate = (): void => {
    if (sourceVideo === undefined) {
      setError('请先在 ① 复刻基准里上传原视频')
      return
    }
    const markers: string[] = []
    if (sourceVideo !== undefined && sourceVideo.path !== undefined) {
      markers.push(`[用户上传了一个视频，本地路径：${sourceVideo.path}]`)
    }
    for (const [slotId, entries] of Object.entries(slots)) {
      if (slotId === 'source-video') continue
      for (const e of entries ?? []) {
        if (e.refLines !== undefined && e.refLines.length > 0) markers.push(...e.refLines)
        else if (e.path !== undefined) markers.push(`[用户上传了一张图片，本地路径：${e.path}]`)
      }
    }
    const requirementLines = VIDEO_REPLICATION_SCHEMA.fields.flatMap(f => {
      const value = (fields[f.id] ?? '').trim()
      return value === '' ? [] : [`- ${f.label}：${value}`]
    })
    const voiceLine = voice === 'auto'
      ? '- 语音：智能识别（跟随原片）——以阶段1/2 对原片的真实分析为准：原片有人声 → 按原片形态生成人声（唱则唱、说则说，不得改成口播）；原片无人声（仅背景音/环境音）→ 不生成任何人声。判定依据须在方案确认里说明，禁止猜测。'
      : voice === 'silent'
        ? '- 语音：静音（绝对不生成任何语音、口播或音效）'
        : voice === 'original'
          ? '- 语音：原片声音（2026-09-22 用户拍板模式）——原片音轨整体作为成片音轨与主时间轴：旁白/BGM/环境音全部来自原片，禁止任何 TTS、重配音或旁白重排；分镜切点必须落在原片语音停顿处（silencedetect 实测边界）；每段生成时长 ≥ 对应原片段时长，生成后逐段裁切到原段精确时长（ffprobe 实测误差 ≤1 帧）再拼接，语音/口型/节奏与原片逐帧对齐；字幕直接用阶段2 原片 SRT（原片真实时间码），禁止按生成节拍重算；改款改动了口播文案时必须 ask_user：①保留原声原词（如实提示措辞与新画面矛盾）或 ②仅改动句 TTS 重配（TTS 优先用原片声线克隆，见 persona c4；如实说明残余差异），禁止默认替用户决定。'
          : voice === 'origclone'
            ? '- 语音：原片音色克隆（2026-09-22 用户拍板模式，用于按原片结构重写文案）——用原片旁白的声线念全部（重写后）文案：①阶段2 用 ffmpeg silencedetect 取原片最长连续旁白段（≥10s 最佳）去噪裁纯人声做样本；②talking_head_production {action:"create_voice", audio_source:<样本>} 提交克隆（免费），克隆训练与其它工作并行、TTS 前 voice_clone_status 轮询到 ready；③节奏=原句时间窗网格：每句 TTS 后用 atempo 精确适配原句时长窗（0.8-1.3 倍以内，超限如实告知），按原句起始时间放置、保留原片句间停顿——全片韵律与原片一致；④逐句响度对齐原句实测 mean_volume；⑤样本 <10s 或 BGM 压制严重时事先告知克隆相似度可能受限；克隆失败/超时回退通用 TTS 并如实说明。字幕与文案以用户重写稿为准。'
            : voice === 'asset' && voiceAsset !== null
            ? `- 语音：有声（忠实原片表演形态）· 音色使用用户资产声音「${voiceAsset.name}」（${voiceAsset.path}），显式指定，非自动附加`
            : '- 语音：有声（忠实原片表演形态：原片是演唱就演唱、是口播就口播，不得改成口播）'
    const subtitleLine = subtitle === 'auto'
      ? '- 字幕：智能识别（跟随原片）——以真实抽帧网格图判断原片画面是否带烧录字幕：有 → 同样烧录字幕；无 → 画面不得出现任何字幕文字。'
      : subtitle === 'burn'
        ? '- 字幕：烧录字幕（口播文案以字幕形式烧进画面）'
        : '- 字幕：无字幕（画面中不得出现任何字幕文字）'
    const text = [
      '【视频复刻任务】请按视频复刻工作流执行，以下参数为用户在创作控制台的指定：',
      `- 模型：${model}`,
      `- 拆解抽帧密度：每 ${frameInterval} 秒一帧（分镜网格图用；35s 片子默认约 35 帧）`,
      `- 清晰度：${resolution}`,
      durationMode === 'same'
        ? '- 时长：同原视频时长（以实测原片时长为准，不要为凑数拉长节奏）'
        : `- 时长：${seconds} 秒（原片不足时按分镜节奏自然展开，不要硬凑）`,
      `- 画幅：${ratio}`,
      `- 生成数量：${count} 条（全部交付并编号，供用户挑选）`,
      voiceLine,
      subtitleLine,
      repMode === 'pixel'
        ? '- 复刻方式：像素复刻——先用 ffmpeg 按分镜切点把原片分段（落盘工作区），逐段调 heightlab_video_generate 时必须传 video_paths=[该段原片分段]（视频参考生视频），prompt 只描述「保持该段原片画面构图节奏 + 替换控制台指定元素」，上一段末帧作为下一段 image_paths 首图压跳变'
        : '- 复刻方式：分镜驱动（原版）——按分镜方案逐段生成新画面，携带产品/人物/场景参考图（image_paths），以分镜提示词驱动，不要求也不得伪造原片分段视频参考',
      execution === 'step'
        ? '- 执行方式：逐步确认——完成拆解与分镜方案后必须停下，等用户明确确认（如回复「确认/继续」）后才可进入生成；用户未确认前严禁生成任何镜头'
        : '- 执行方式：一次生成——无需中途确认，但每个阶段完成时必须调用 workflow_stage 输出进度',
      ...requirementLines,
      ...markers,
    ].join('\n')
    setProgress(null)
    window.dispatchEvent(new CustomEvent('hl:send-template', { detail: { text } }))
  }

  // 资产库弹窗（2026-09-19 用户拍板）：点「资产库」弹框，选中即入并自动
  // 关闭；点遮罩/右上角 × 也可关闭。条目 = 缩略图卡片（不再文字列表）。
  const assetCard = (a: AssetEntry): ReactNode => (
    <button key={a.id} type="button" className={css.modalCell} onClick={() => pickAsset(a)}>
      {a.kind === '声音'
        ? <span className={css.modalVoiceTile}>♪</span>
        : a.path !== undefined
          ? <img className={css.modalCellImg} src={mediaUrl(a.path)} alt={a.name} />
          : a.url !== undefined && a.url !== ''
            ? <img className={css.modalCellImg} src={a.url} alt={a.name} />
            : <span className={css.modalVoiceTile}>？</span>}
      <span className={css.modalCellName}>{a.name}</span>
      <span className={css.modalCellMeta}>{a.kind} · {a.origin ?? '资产库'}{typeof a.use_count === 'number' && a.use_count > 1 ? ` · 用过 ${a.use_count} 次` : ''}</span>
    </button>
  )

  const renderAssetModal = (): ReactNode => {
    if (picker === null) return null
    const items = picker.slotId === 'voice' ? assetList.filter(a => a.kind === '声音') : assetList
    return (
      <div className={css.maskLayer} onClick={() => setPicker(null)}>
        <div className={css.assetModal} onClick={e => e.stopPropagation()}>
          <div className={css.modalHead}>
            <span className={css.modalTitle}>选择{picker.kind}素材</span>
            <button type="button" className={css.modalClose} title="关闭" onClick={() => setPicker(null)}>×</button>
          </div>
          <div className={css.modalGrid}>
            {items.length === 0
              ? <div className={css.modalEmpty}>暂无{picker.kind}素材（上传过的素材会自动归档到这里；设置里的人物/场景/声音也会出现在此）</div>
              : items.map(assetCard)}
          </div>
        </div>
      </div>
    )
  }

  // ① 复刻基准：虚线大上传框（点击/拖入）；已有文件 = 缩略图 + 悬浮右上角叉号。
  const renderSourceUpload = (): ReactNode => {
    const entries = slots['source-video'] ?? []
    const entry = entries[0]
    return (
      <div className={css.slot}>
        <div className={css.slotLabel}>
          原视频
          <span className={css.badge}>必选</span>
          <span className={css.slotSpacer} />
          {entry === undefined ? (
            <button type="button" className={css.libLink} onClick={() => void openPicker('source-video', '视频')}>从资产库选择</button>
          ) : null}
        </div>
        {entry === undefined ? (
          <label
            className={css.uploadBox}
            htmlFor="console-file-source-video"
            onDragOver={e => e.preventDefault()}
            onDrop={e => {
              e.preventDefault()
              void setFiles('source-video', 'video', e.dataTransfer.files)
            }}>
            <span className={css.uploadPlus}>+</span>
            <span className={css.uploadText}>点击或拖入要复刻的原视频</span>
            <span className={css.uploadHint}>MP4 / MOV 等常见格式；抽帧与分镜的唯一依据</span>
          </label>
        ) : (
          <div className={css.thumbBox}>
            {entry.path !== undefined ? (
              <video className={css.thumbVideo} src={`${mediaUrl(entry.path)}#t=0.001`} muted preload="metadata" playsInline />
            ) : null}
            <button type="button" className={css.thumbDelete} title="移除"
              onClick={() => removeSlotEntry('source-video', 0)}>×</button>
            <span className={css.thumbName}>{entry.name}</span>
          </div>
        )}
        <input id="console-file-source-video" className={css.fileInput} type="file" accept="video/*"
          onChange={e => void setFiles('source-video', 'video', e.target.files, e.currentTarget)} />
      </div>
    )
  }

  // ② 修改元素：图片槽 = 缩略图网格 + 未满加号块 + 悬浮叉号删除 + 计数。
  const renderImageSlot = (slotId: string): ReactNode => {
    const spec = VIDEO_REPLICATION_SCHEMA.slots.find(s => s.id === slotId)
    if (spec === undefined) return null
    const entries = slots[slotId] ?? []
    const max = spec.max ?? 9
    const inputId = `console-file-${slotId}`
    return (
      <div className={css.slot}>
        <div className={css.slotLabel}>
          {spec.label}
          <span className={css.counter}>{entries.length}/{max}</span>
          <span className={css.slotSpacer} />
          <button type="button" className={css.libLink} onClick={() => void openPicker(slotId, SLOT_KIND[slotId] ?? '其他')}>资产库</button>
        </div>
        <div className={css.slotCaption}>{spec.caption}</div>
        <div className={css.imgGrid}>
          {entries.map((e, i) => (
            <div key={`${e.name}-${i}`} className={css.imgCell}>
              {e.path !== undefined ? <img className={css.imgCellImg} src={mediaUrl(e.path)} alt={e.name} /> : <span className={css.imgNameFallback}>{e.name}</span>}
              <button type="button" className={css.imgDelete} title="移除" onClick={() => removeSlotEntry(slotId, i)}>×</button>
            </div>
          ))}
          {entries.length < max ? (
            <label className={css.addTile} htmlFor={inputId} title={`添加${spec.label}（最多 ${max} 张）`}>
              <span className={css.addTilePlus}>+</span>
            </label>
          ) : null}
        </div>
        <input id={inputId} className={css.fileInput} type="file" multiple={max > 1} accept="image/*"
          onChange={e => void setFiles(slotId, spec.kind, e.target.files, e.currentTarget)} />
      </div>
    )
  }

  const renderField = (f: (typeof VIDEO_REPLICATION_SCHEMA.fields)[number]): ReactNode => (
    <label key={f.id} className={f.id === 'product' || f.id === 'notes' ? `${css.field} ${css.fieldWide}` : css.field}>
      <span>{f.label}</span>
      {f.kind === 'select' ? (
        <select value={fields[f.id] ?? ''}
          onChange={e => setFields(prev => ({ ...prev, [f.id]: e.target.value }))}>
          {(f.options ?? []).map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      ) : (
        <input type="text" value={fields[f.id] ?? ''} placeholder={f.placeholder}
          onChange={e => setFields(prev => ({ ...prev, [f.id]: e.target.value }))} />
      )}
    </label>
  )

  const currentStageIndex = progress === null ? -1 : STAGES.indexOf(progress.stage as never)
  const stageState = (idx: number): string | undefined => {
    if (progress === null || currentStageIndex < 0) return css.stageTodo
    if (idx < currentStageIndex) return css.stageDone
    if (idx > currentStageIndex) return css.stageTodo
    return progress.status === 'done' ? css.stageDone : `${css.stageActive}`
  }
  const perSecond = CREDITS_PER_SECOND[resolution] ?? 1
  const creditsText = durationMode === 'same'
    ? `预估积分：≈ 原片时长 × ${count} 条 × ${perSecond}/秒（${resolution} · 折算表估算）`
    : `预估积分：≈ ${seconds * count * perSecond}（${seconds}s × ${count} 条 × ${perSecond}/秒 · 折算表估算）`

  const labelOf = (arr: ReadonlyArray<{ value: string; label: string }>, value: string): string =>
    arr.find(o => o.value === value)?.label ?? value
  const voiceSummary = voice === 'auto'
    ? '声音跟随原片'
    : voice === 'silent'
      ? '静音'
      : voice === 'original'
        ? '原片声音'
        : voice === 'origclone'
          ? '原片音色克隆'
          : voice === 'asset'
            ? `音色:${voiceAsset?.name ?? '待选'}`
            : '有声'
  const subtitleSummary = subtitle === 'auto' ? '字幕跟随原片' : subtitle === 'burn' ? '烧录字幕' : '无字幕'
  const paramSummary = [
    labelOf(VIDEO_REPLICATION_SCHEMA.models, model),
    labelOf(VIDEO_REPLICATION_SCHEMA.ratios, ratio),
    labelOf(VIDEO_REPLICATION_SCHEMA.resolutions, resolution),
    durationMode === 'same' ? '同原片时长' : `${seconds}秒`,
    voiceSummary,
    subtitleSummary,
  ].join(' · ')

  // V40：模板工作台——按 skill schema 渲染的模板专属面板（替代复刻控制台）。
  if (templateSchema !== null) {
    const taskText = [
      `【模板创作任务】模板：${templateName || templateSchema.title}（skill: ${templateSchema.skill}）`,
      ...templateSchema.sections.flatMap(sec => sec.fields.map(f => {
        const v = (templateValues[f.id] ?? '').trim()
        if (f.type === 'images') return v === '' ? `- ${f.label}：进入对话后按提示上传` : `- ${f.label}：${v}`
        if (f.type === 'video') return v === '' ? `- ${f.label}：进入对话后按提示上传` : `- ${f.label}：${v}`
        return v === '' ? null : `- ${f.label}：${v}`
      }).filter((x): x is string => x !== null)),
      `- 官方 skill 全文：~/.heightlab/yunj-skills/${templateSchema.skill}/SKILL.md——必须先读取该文件并严格按其工作流与产出规范执行；本任务参数与其冲突时以 skill 为准。`,
    ].join('\n')
    return (
      <div
        className={css.console}
        onChangeCapture={() => { dirtyRef.current = true }}
        onClickCapture={() => { dirtyRef.current = true }}>
        <div className={css.head}>
          <div className={css.schemaTitle}>{templateSchema.title}</div>
          <div className={css.headHint}>{templateSchema.intro}</div>
        </div>
        {templateSchema.sections.map(sec => (
          <div key={sec.title}>
            <div className={css.sectionTitle}>{sec.title}</div>
            <div className={css.grid2}>
              {sec.fields.map(f => {
                const wide = f.wide === true || f.type === 'textarea'
                const value = templateValues[f.id] ?? ''
                if (f.type === 'images' || f.type === 'video') {
                  return (
                    <label key={f.id} className={`${css.field} ${css.fieldWide}`}>
                      <span>{f.label}</span>
                      <input type="text" placeholder="进入对话后按提示上传素材" value={value}
                        onChange={e => setTemplateValues(v => ({ ...v, [f.id]: e.target.value }))} />
                    </label>
                  )
                }
                if (f.type === 'select') {
                  return (
                    <label key={f.id} className={wide ? `${css.field} ${css.fieldWide}` : css.field}>
                      <span>{f.label}</span>
                      <select value={value} onChange={e => setTemplateValues(v => ({ ...v, [f.id]: e.target.value }))}>
                        {(f.options ?? []).map(o => <option key={o} value={o}>{o}</option>)}
                      </select>
                    </label>
                  )
                }
                return (
                  <label key={f.id} className={wide ? `${css.field} ${css.fieldWide}` : css.field}>
                    <span>{f.label}</span>
                    {f.type === 'textarea'
                      ? <textarea rows={3} placeholder={f.placeholder ?? ''} value={value}
                          onChange={e => setTemplateValues(v => ({ ...v, [f.id]: e.target.value }))} />
                      : <input type={f.type === 'number' ? 'number' : 'text'} placeholder={f.placeholder ?? ''} value={value}
                          onChange={e => setTemplateValues(v => ({ ...v, [f.id]: e.target.value }))} />}
                  </label>
                )
              })}
            </div>
          </div>
        ))}
        <button type="button" className={css.paramsSummary} onClick={() => {
          window.dispatchEvent(new CustomEvent('hl:send-template', { detail: { text: taskText } }))
        }}>
          <span className={css.paramsTitle}>{templateSchema.actionLabel} ↗</span>
          <span className={css.paramsMeta}>任务进入左侧对话执行</span>
        </button>
      </div>
    )
  }
  return (
    <div
      className={css.console}
      onChangeCapture={() => { dirtyRef.current = true }}
      onClickCapture={() => { dirtyRef.current = true }}>
      <div className={css.head}>
        <div className={css.schemaTitle}>视频复刻 · 创作控制台</div>
        <div className={css.headHint}>素材和参数都在这里填，点「生成视频」后任务进入左侧对话执行。</div>
      </div>

      {progress !== null ? (
        <div className={css.progress}>
          <div className={css.progressStages}>
            {STAGES.map((s, idx) => (
              <div key={s} className={`${css.stage} ${stageState(idx)}`}>
                <span className={css.stageDot}>{idx < currentStageIndex || (idx === currentStageIndex && progress.status === 'done') ? '✓' : idx + 1}</span>
                <span className={css.stageName}>{s}</span>
              </div>
            ))}
          </div>
          {progress.detail !== '' ? <div className={css.progressDetail}>{progress.detail}</div> : null}
        </div>
      ) : null}

      <div className={css.sectionTitle}>① 复刻基准</div>
      <div className={css.modeRow}>
        <button type="button" className={repMode === 'storyboard' ? `${css.modeBtn} ${css.modeBtnActive}` : css.modeBtn}
          onClick={() => setRepMode('storyboard')}>
          <span className={css.modeName}>分镜驱动</span>
          <span className={css.modeDesc}>官方原版 · 按分镜重新演绎</span>
        </button>
        <button type="button" className={repMode === 'pixel' ? `${css.modeBtn} ${css.modeBtnActive}` : css.modeBtn}
          onClick={() => setRepMode('pixel')}>
          <span className={css.modeName}>像素复刻</span>
          <span className={css.modeDesc}>逐段贴原片 · 更像原片</span>
        </button>
      </div>
      {renderSourceUpload()}

      <div className={css.sectionTitle}>
        ② 修改元素
        <span className={css.sectionHint}>不想改的就留空 = 保持原片；图 + 文字一起给最准</span>
      </div>
      <div className={css.pairRow}>
        {renderImageSlot('product-images')}
        {renderField(findField('product'))}
      </div>
      <div className={css.pairRow}>
        {renderImageSlot('character-images')}
        {renderField(findField('character'))}
      </div>
      <div className={css.pairRow}>
        {renderImageSlot('background-images')}
        {renderField(findField('scene'))}
      </div>
      <div className={css.grid2}>
        {renderField(findField('copy-mode'))}
        {renderField(findField('style'))}
      </div>
      {/* 声音（2026-09-23 用户拍板）：与文案同为复刻核心要素，从折叠的
          生成参数区上移到文案下方常驻展示，不再折叠。 */}
      <label className={`${css.field} ${css.fieldWide}`}>
        <span>声音</span>
        <select value={voice} onChange={e => {
          const v = e.target.value as VoiceChoice
          setVoice(v)
          if (v === 'asset') void openVoicePicker()
        }}>
          <option value="auto">智能识别（跟随原片：有人声则有声，无人声则静音）</option>
          <option value="original">原片声音（直接用原片音轨：旁白/BGM/节奏与原片完全一致，推荐复刻自己的视频）</option>
          <option value="origclone">原片音色克隆（克隆原片旁白声线念全部文案，节奏按原片对齐；适合按原片结构重写）</option>
          <option value="vo">有声（忠实原片形态：唱则唱、说则说）</option>
          <option value="asset">我的资产声音</option>
          <option value="silent">静音（无任何人声）</option>
        </select>
      </label>
      {renderField(findField('notes'))}

      <details className={css.paramsDetails}>
        <summary className={css.paramsSummary}>
          <span className={css.paramsTitle}>③ 生成参数</span>
          <span className={css.paramsMeta}>{paramSummary}</span>
          <span className={css.paramsChevron}>▾</span>
        </summary>
        <div className={css.paramsBody}>
          <div className={css.grid2}>
            <label className={css.field}>
              <span>模型</span>
              <select value={model} onChange={e => setModel(e.target.value)}>
                {VIDEO_REPLICATION_SCHEMA.models.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </label>
            <label className={css.field}>
              <span>画面比例</span>
              <select value={ratio} onChange={e => setRatio(e.target.value)}>
                {VIDEO_REPLICATION_SCHEMA.ratios.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </label>
            <label className={css.field}>
              <span>分辨率</span>
              <select value={resolution} onChange={e => setResolution(e.target.value)}>
                {VIDEO_REPLICATION_SCHEMA.resolutions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </label>
            <label className={css.field}>
              <span>拆解抽帧密度</span>
              <select value={frameInterval} onChange={e => setFrameInterval(e.target.value as '0.5' | '1' | '2')}>
                <option value="1">每秒 1 帧（标准，推荐）</option>
                <option value="0.5">每 0.5 秒 1 帧（精细，图更大）</option>
                <option value="2">每 2 秒 1 帧（快速，图更小）</option>
              </select>
            </label>
            <label className={css.field}>
              <span>生成数量</span>
              <select value={count} onChange={e => setCount(Number(e.target.value))}>
                {[1, 2, 3, 4].map(n => <option key={n} value={n}>{n} 条{n > 1 ? '（按倍数计费）' : ''}</option>)}
              </select>
            </label>
            <label className={css.field}>
              <span>时长</span>
              <select value={durationMode} onChange={e => setDurationMode(e.target.value === 'custom' ? 'custom' : 'same')}>
                <option value="same">同原视频时长（推荐）</option>
                <option value="custom">自定义秒数</option>
              </select>
            </label>
            {durationMode === 'custom' ? (
              <label className={css.field}>
                <span>成片秒数：{seconds} 秒</span>
                <input type="range" min={VIDEO_REPLICATION_SCHEMA.seconds.min} max={VIDEO_REPLICATION_SCHEMA.seconds.max}
                  step={VIDEO_REPLICATION_SCHEMA.seconds.step} value={seconds}
                  onChange={e => setSeconds(Number(e.target.value))} />
              </label>
            ) : null}
            <label className={css.field}>
              <span>字幕</span>
              <select value={subtitle} onChange={e => setSubtitle(e.target.value as SubtitleChoice)}>
                <option value="auto">智能识别（跟随原片：原片有字幕则烧录，无则不加）</option>
                <option value="burn">烧录字幕</option>
                <option value="none">无字幕</option>
              </select>
            </label>
            <label className={`${css.field} ${css.fieldWide}`}>
              <span>执行方式</span>
              <select value={execution} onChange={e => setExecution(e.target.value === 'once' ? 'once' : 'step')}>
                <option value="step">逐步确认（推荐）：先出拆解方案，你确认后再生成</option>
                <option value="once">一次生成：拆解后直接生成成片</option>
              </select>
            </label>
          </div>
          {voice === 'asset' ? (
            <>
              <label className={css.field}>
                <span>音色来源</span>
                <button type="button" className={css.slotButton} onClick={() => void openVoicePicker()}>
                  {voiceAsset !== null ? `${voiceAsset.name}（点击更换）` : '从资产库选择声音'}
                </button>
              </label>
              {voiceAsset !== null ? (
                <div className={css.hint}>已选声音：{voiceAsset.name}（点上方按钮可更换）</div>
              ) : null}
            </>
          ) : null}
        </div>
      </details>

      {error !== '' ? <div className={css.error}>{error}</div> : null}
      <div className={css.actions}>
        <button type="button" className={css.generate} disabled={busy || !canGenerate}
          onClick={() => generate()}>
          {busy ? '上传中…' : '生成视频'}
        </button>
      </div>
      <div className={css.status}>
        {canGenerate ? '已就绪：点「生成视频」提交，任务在左侧对话中执行' : '等待提交：先在 ① 上传原视频，其余按需填写'}
        <span className={css.credits}>{creditsText}</span>
      </div>
      {renderAssetModal()}
    </div>
  )
}
