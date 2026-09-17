/**
 * HeightLab 创作控制台（营销模式试点：视频复刻）。
 * 通用层：模型/画面比例/分辨率/成片秒数；专属层：素材槽（上传走 /hl/upload-*）。
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

  const sourceVideo = slots['source-video']?.[0]?.path ?? ''
  const canGenerate = sourceVideo !== '' && !busy

  const generate = (): void => {
    if (sourceVideo === '') {
      setError('请先上传原视频')
      return
    }
    const markers = [
      `[用户上传了一个视频，本地路径：${sourceVideo}]`,
      ...Object.entries(slots).flatMap(([slotId, entries]) =>
        slotId === 'source-video' ? [] : (entries ?? []).map(e => `[用户上传了一张图片，本地路径：${e.path}]`)),
    ]
    const text = [
      '【视频复刻任务】请按以下参数执行：',
      `- 模型：${model}`,
      `- 清晰度：${resolution}`,
      `- 时长：${seconds} 秒`,
      `- 画幅：${ratio}`,
      ...markers,
    ].join('\n')
    window.dispatchEvent(new CustomEvent('hl:send-template', { detail: { text } }))
  }

  return (
    <div className={css.console}>
      <div className={css.schemaTitle}>{VIDEO_REPLICATION_SCHEMA.title}</div>
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
        <span>成片秒数：{seconds} 秒</span>
        <input type="range" min={VIDEO_REPLICATION_SCHEMA.seconds.min} max={VIDEO_REPLICATION_SCHEMA.seconds.max}
          step={VIDEO_REPLICATION_SCHEMA.seconds.step} value={seconds}
          onChange={e => setSeconds(Number(e.target.value))} />
      </label>
      {(['source-video', 'product-images', 'character-images', 'background-images'] as const).map(slotId => {
        const spec = VIDEO_REPLICATION_SCHEMA.slots.find(s => s.id === slotId)
        if (spec === undefined) return null
        const entries = slots[slotId] ?? []
        return (
          <div key={spec.id} className={css.slot}>
            <div className={css.slotLabel}>{spec.label}{spec.required ? ' · 必选' : ''}</div>
            <input type="file" multiple={spec.max === undefined || spec.max > 1}
              accept={spec.kind === 'video' ? 'video/*' : 'image/*'}
              onChange={e => void setFiles(spec.id, spec.kind, e.target.files)} />
            {entries.length > 0 ? <div className={css.slotCount}>已上传 {entries.length} 个</div> : null}
          </div>
        )
      })}
      {error !== '' ? <div className={css.error}>{error}</div> : null}
      <div className={css.actions}>
        <button type="button" className={css.generate} disabled={busy || !canGenerate}
          onClick={() => generate()}>
          生成视频
        </button>
        <button type="button" className={css.clear} onClick={() => setSlots({})}>清空素材</button>
      </div>
      <div className={css.status}>等待提交：填好参数与素材后点「生成视频」，任务在对话中执行</div>
    </div>
  )
}
