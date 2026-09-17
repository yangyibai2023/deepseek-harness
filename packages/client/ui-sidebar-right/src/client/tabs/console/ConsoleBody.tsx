/**
 * HeightLab 创作控制台（营销模式试点：视频复刻）。
 * 三个编号分区：①素材 ②生成参数 ③改款需求（全部可留空）。
 * 「生成视频」= dispatch hl:send-template（复用输入框自动发送通道，消息入对话
 * 后由 Colin→视频专家执行）；本组件不直接对接生成 API。
 */
import { useState } from 'react'
import type { ReactNode } from 'react'
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { VIDEO_REPLICATION_SCHEMA } from './schema.ts'
import css from './console.module.css'

export interface ConsoleBodyProps extends PropsRuntime<'sidebar.right.pane.tab'> {}

interface SlotEntry {
  name: string
  path: string
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

export function ConsoleBody(_props: ConsoleBodyProps): ReactNode {
  const [model, setModel] = useState(VIDEO_REPLICATION_SCHEMA.models[0]?.value ?? '')
  const [ratio, setRatio] = useState(VIDEO_REPLICATION_SCHEMA.ratios[0]?.value ?? '9:16')
  const [resolution, setResolution] = useState(VIDEO_REPLICATION_SCHEMA.resolutions[0]?.value ?? '768P')
  const [seconds, setSeconds] = useState(VIDEO_REPLICATION_SCHEMA.seconds.defaultValue)
  const [durationMode, setDurationMode] = useState<'same' | 'custom'>('same')
  const [voice, setVoice] = useState<'vo' | 'silent'>('vo')
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

  const setFiles = async (slotId: string, kind: 'video' | 'image', files: FileList | null): Promise<void> => {
    if (files === null || files.length === 0) return
    setBusy(true)
    setError('')
    try {
      const entries: SlotEntry[] = []
      for (const file of Array.from(files)) {
        const path = await uploadAsset(kind, file)
        entries.push({ name: file.name, path })
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
    const markers = [
      `[用户上传了一个视频，本地路径：${sourceVideo.path}]`,
      ...Object.entries(slots).flatMap(([slotId, entries]) =>
        slotId === 'source-video' ? [] : (entries ?? []).map(e => `[用户上传了一张图片，本地路径：${e.path}]`)),
    ]
    const requirementLines = VIDEO_REPLICATION_SCHEMA.fields.flatMap(f => {
      const value = (fields[f.id] ?? '').trim()
      return value === '' ? [] : [`- ${f.label}：${value}`]
    })
    const text = [
      '【视频复刻任务】请按视频复刻工作流执行，以下参数为用户在创作控制台的指定：',
      `- 模型：${model}`,
      `- 清晰度：${resolution}`,
      durationMode === 'same'
        ? '- 时长：同原视频时长（以实测原片时长为准，不要为凑数拉长节奏）'
        : `- 时长：${seconds} 秒（原片不足时按分镜节奏自然展开，不要硬凑）`,
      `- 画幅：${ratio}`,
      `- 生成数量：${count} 条（全部交付并编号，供用户挑选）`,
      voice === 'vo'
        ? '- 语音：有声（忠实原片表演形态：原片是演唱就演唱、是口播就口播，不得改成口播）'
        : '- 语音：静音（绝对不生成任何语音、口播或音效）',
      subtitle === 'burn'
        ? '- 字幕：烧录字幕（口播文案以字幕形式烧进画面）'
        : '- 字幕：无字幕（画面中不得出现任何字幕文字）',
      execution === 'step'
        ? '- 执行方式：逐步确认——完成拆解与分镜方案后必须停下，等用户明确确认（如回复「确认/继续」）后才可进入生成；用户未确认前严禁生成任何镜头'
        : '- 执行方式：一次生成——无需中途确认，但每个阶段完成时必须输出一行进度',
      ...requirementLines,
      ...markers,
    ].join('\n')
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
        <label className={css.slotButton} htmlFor={inputId}>
          {entries.length > 0 ? `已选 ${entries.map(e => e.name).join('、')}` : '点击选择文件'}
        </label>
        <input id={inputId} className={css.fileInput} type="file"
          multiple={spec.max === undefined || spec.max > 1}
          accept={spec.kind === 'video' ? 'video/*' : 'image/*'}
          onChange={e => void setFiles(spec.id, spec.kind, e.target.files)} />
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

  return (
    <div className={css.console}>
      <div className={css.head}>
        <div className={css.schemaTitle}>视频复刻 · 创作控制台</div>
        <div className={css.headHint}>素材和参数都在这里填，点「生成视频」后任务进入左侧对话执行。</div>
      </div>

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
          <label className={`${css.field} ${css.fieldWide}`}>
            <span>成片秒数：{seconds} 秒</span>
            <input type="range" min={VIDEO_REPLICATION_SCHEMA.seconds.min} max={VIDEO_REPLICATION_SCHEMA.seconds.max}
              step={VIDEO_REPLICATION_SCHEMA.seconds.step} value={seconds}
              onChange={e => setSeconds(Number(e.target.value))} />
          </label>
        ) : null}
        <label className={css.field}>
          <span>语音</span>
          <select value={voice} onChange={e => setVoice(e.target.value === 'silent' ? 'silent' : 'vo')}>
            <option value="vo">有声（忠实原片形态：唱则唱、说则说）</option>
            <option value="silent">静音（无任何人声）</option>
          </select>
        </label>
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
      </div>
    </div>
  )
}
