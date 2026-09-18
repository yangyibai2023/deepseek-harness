/**
 * HeightLab 创作控制台（营销模式试点：视频复刻）。
 * 三个编号分区：①复刻基准 ②生成参数 ③改什么（图+文字配对，上下排列）。
 * 上方进度条经 /hl/workflow-state 轮询真实工作流状态（FY1-M2）；
 * 素材槽双入口：上传（自动登记资产中心）/ 从资产库选择；
 * 「生成视频」= dispatch hl:send-template（复用输入框自动发送通道）。
 */
import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
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

export function ConsoleBody(_props: ConsoleBodyProps): ReactNode {
  const [model, setModel] = useState(VIDEO_REPLICATION_SCHEMA.models[0]?.value ?? '')
  const [ratio, setRatio] = useState(VIDEO_REPLICATION_SCHEMA.ratios[0]?.value ?? '9:16')
  const [resolution, setResolution] = useState(VIDEO_REPLICATION_SCHEMA.resolutions[0]?.value ?? '768P')
  const [seconds, setSeconds] = useState(VIDEO_REPLICATION_SCHEMA.seconds.defaultValue)
  const [durationMode, setDurationMode] = useState<'same' | 'custom'>('same')
  const [voice, setVoice] = useState<'vo' | 'silent' | 'asset'>('vo')
  const [subtitle, setSubtitle] = useState<'burn' | 'none'>('burn')
  const [execution, setExecution] = useState<'step' | 'once'>('step')
  const [count, setCount] = useState(1)
  const [fields, setFields] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {}
    for (const f of VIDEO_REPLICATION_SCHEMA.fields) {
      if (f.kind === 'select') init[f.id] = f.options?.[0]?.value ?? ''
    }
    return init
  })
  const [slots, setSlots] = useState<Record<string, SlotEntry[]>>({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [progress, setProgress] = useState<WorkflowProgress | null>(null)
  const [picker, setPicker] = useState<{ slotId: string; kind: string } | null>(null)
  const [assetList, setAssetList] = useState<AssetEntry[]>([])
  const [voiceAsset, setVoiceAsset] = useState<AssetEntry | null>(null)

  // 真实进度轮询（FY1-M2）：专家经 workflow_stage 工具落盘，控制台只读渲染。
  useEffect(() => {
    let alive = true
    const poll = async (): Promise<void> => {
      try {
        const res = await fetch('/hl/workflow-state')
        const json = (await res.json()) as Partial<WorkflowProgress> & { template?: string }
        if (alive && json.template === '视频复刻') {
          setProgress({ stage: json.stage ?? '', status: json.status ?? '', detail: json.detail ?? '' })
        }
      } catch { /* 宿主未就绪时静默 */ }
    }
    void poll()
    const timer = window.setInterval(poll, 2500)
    return () => {
      alive = false
      window.clearInterval(timer)
    }
  }, [])

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
          merged.push({
            id: `set-voice-${ref}`, kind: '声音', name,
            url: ref, refLines: [`- 音色：用户资产声音「${name}」（${ref}）`],
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

  const setFiles = async (slotId: string, kind: 'video' | 'image', files: FileList | null): Promise<void> => {
    if (files === null || files.length === 0) return
    setBusy(true)
    setError('')
    try {
      const entries: SlotEntry[] = []
      for (const file of Array.from(files)) {
        const path = await uploadAsset(kind, file)
        entries.push({ name: file.name, path })
        void registerAsset(SLOT_KIND[slotId] ?? '其他', file.name, path)
      }
      setSlots(prev => ({ ...prev, [slotId]: entries }))
    } catch (err) {
      setError(err instanceof Error ? err.message : '上传失败')
    } finally {
      setBusy(false)
    }
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
      setError('请先在 ① 上传素材里选择原视频')
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
    const voiceLine = voice === 'silent'
      ? '- 语音：静音（绝对不生成任何语音、口播或音效）'
      : voice === 'asset' && voiceAsset !== null
        ? `- 语音：有声（忠实原片表演形态）· 音色使用用户资产声音「${voiceAsset.name}」（${voiceAsset.path}），显式指定，非自动附加`
        : '- 语音：有声（忠实原片表演形态：原片是演唱就演唱、是口播就口播，不得改成口播）'
    const text = [
      '【视频复刻任务】请按视频复刻工作流执行，以下参数为用户在创作控制台的指定：',
      `- 模型：${model}`,
      `- 清晰度：${resolution}`,
      durationMode === 'same'
        ? '- 时长：同原视频时长（以实测原片时长为准，不要为凑数拉长节奏）'
        : `- 时长：${seconds} 秒（原片不足时按分镜节奏自然展开，不要硬凑）`,
      `- 画幅：${ratio}`,
      `- 生成数量：${count} 条（全部交付并编号，供用户挑选）`,
      voiceLine,
      subtitle === 'burn'
        ? '- 字幕：烧录字幕（口播文案以字幕形式烧进画面）'
        : '- 字幕：无字幕（画面中不得出现任何字幕文字）',
      execution === 'step'
        ? '- 执行方式：逐步确认——完成拆解与分镜方案后必须停下，等用户明确确认（如回复「确认/继续」）后才可进入生成；用户未确认前严禁生成任何镜头'
        : '- 执行方式：一次生成——无需中途确认，但每个阶段完成时必须调用 workflow_stage 输出进度',
      ...requirementLines,
      ...markers,
    ].join('\n')
    setProgress(null)
    window.dispatchEvent(new CustomEvent('hl:send-template', { detail: { text } }))
  }

  const renderSlot = (slotId: string): ReactNode => {
    const spec = VIDEO_REPLICATION_SCHEMA.slots.find(s => s.id === slotId)
    if (spec === undefined) return null
    const entries = slots[slotId] ?? []
    const inputId = `console-file-${slotId}`
    return (
      <div key={spec.id} className={spec.required ? `${css.slot} ${css.slotRequired}` : css.slot}>
        <div className={css.slotLabel}>
          {spec.label}
          {spec.required ? <span className={css.badge}>必选</span> : null}
        </div>
        <div className={css.slotCaption}>{spec.caption}</div>
        <div className={css.slotActions}>
          <label className={css.slotButton} htmlFor={inputId}>
            {entries.length > 0 ? `已选 ${entries.map(e => e.name).join('、')}` : '点击选择文件'}
          </label>
          <button type="button" className={css.slotLibrary}
            onClick={() => void openPicker(slotId, SLOT_KIND[slotId] ?? '其他')}>
            资产库
          </button>
        </div>
        <input id={inputId} className={css.fileInput} type="file"
          multiple={spec.max === undefined || spec.max > 1}
          accept={spec.kind === 'video' ? 'video/*' : 'image/*'}
          onChange={e => void setFiles(spec.id, spec.kind, e.target.files)} />
        {picker !== null && picker.slotId === slotId ? (
          <div className={css.assetPanel}>
            {assetList.length === 0 ? <div className={css.assetEmpty}>暂无{picker.kind}素材（上传过的素材会自动归档到这里；设置里的人物/场景/声音也会出现在此）</div>
              : assetList.map(a => (
                <button key={a.id} type="button" className={css.assetItem} onClick={() => pickAsset(a)}>
                  <span className={css.assetName}>{a.name}</span>
                  <span className={css.assetMeta}>{a.kind} · {a.origin ?? '资产库'}{typeof a.use_count === 'number' && a.use_count > 1 ? ` · 用过 ${a.use_count} 次` : ''}</span>
                </button>
              ))}
          </div>
        ) : null}
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

  return (
    <div className={css.console}>
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
      {renderSlot('source-video')}
      <div className={css.hint}>视频在这里上传即可，不需要再通过聊天输入框添加。</div>

      <div className={css.sectionTitle}>② 生成参数</div>
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
          <span>语音</span>
          <select value={voice} onChange={e => {
            const v = e.target.value
            setVoice(v === 'silent' ? 'silent' : v === 'asset' ? 'asset' : 'vo')
            if (v === 'asset') void openVoicePicker()
          }}>
            <option value="vo">有声（忠实原片形态：唱则唱、说则说）</option>
            <option value="asset">我的资产声音</option>
            <option value="silent">静音（无任何人声）</option>
          </select>
        </label>
        {voice === 'asset' ? (
          <>
            <label className={css.field}>
              <span>音色来源</span>
              <button type="button" className={css.slotButton} onClick={() => void openVoicePicker()}>
                {voiceAsset !== null ? `${voiceAsset.name}（点击更换）` : '从资产库选择声音'}
              </button>
            </label>
            {picker !== null && picker.slotId === 'voice' ? (
              <div className={css.assetPanel}>
                {assetList.filter(a => a.kind === '声音').length === 0
                  ? <div className={css.assetEmpty}>暂无声音资产：可在「设置 → 形象与声音」创建后在此选择</div>
                  : assetList.filter(a => a.kind === '声音').map(a => (
                    <button key={a.id} type="button" className={css.assetItem} onClick={() => pickAsset(a)}>
                      <span className={css.assetName}>{a.name}</span>
                      <span className={css.assetMeta}>{a.origin ?? '资产库'}{typeof a.use_count === 'number' && a.use_count > 1 ? ` · 用过 ${a.use_count} 次` : ''}</span>
                    </button>
                  ))}
              </div>
            ) : null}
          </>
        ) : null}
        <label className={css.field}>
          <span>字幕</span>
          <select value={subtitle} onChange={e => setSubtitle(e.target.value === 'none' ? 'none' : 'burn')}>
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

      <div className={css.sectionTitle}>
        ③ 改什么
        <span className={css.sectionHint}>不想改的就留空 = 保持原片；图 + 文字一起给最准</span>
      </div>
      <div className={css.pairRow}>
        {renderSlot('product-images')}
        {renderField(findField('product'))}
      </div>
      <div className={css.pairRow}>
        {renderSlot('character-images')}
        {renderField(findField('character'))}
      </div>
      <div className={css.pairRow}>
        {renderSlot('background-images')}
        {renderField(findField('scene'))}
      </div>
      <div className={css.grid2}>
        {renderField(findField('copy-mode'))}
        {renderField(findField('style'))}
      </div>
      {renderField(findField('notes'))}

      {error !== '' ? <div className={css.error}>{error}</div> : null}
      <div className={css.actions}>
        <button type="button" className={css.generate} disabled={busy || !canGenerate}
          onClick={() => generate()}>
          生成视频
        </button>
        <button type="button" className={css.clear} onClick={() => { setSlots({}); setError('') }}>清空</button>
      </div>
      <div className={css.status}>
        {canGenerate ? '已就绪：点「生成视频」提交，任务在左侧对话中执行' : '等待提交：先上传原视频（①），其余按需填写'}
        <span className={css.credits}>{creditsText}</span>
      </div>
    </div>
  )
}
