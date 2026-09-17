/** 视频复刻（试点）控制台 schema：通用层 + 素材槽层。后续 skill 各自一份 schema。 */
export interface ConsoleSelectOption {
  readonly value: string
  readonly label: string
}

export interface ConsoleUploadSlotSpec {
  readonly id: string
  readonly label: string
  readonly caption: string
  readonly kind: 'video' | 'image'
  readonly required?: boolean
  readonly max?: number
}

export interface ConsoleSchema {
  readonly title: string
  readonly models: readonly ConsoleSelectOption[]
  readonly ratios: readonly ConsoleSelectOption[]
  readonly resolutions: readonly ConsoleSelectOption[]
  readonly seconds: { readonly min: number; readonly max: number; readonly step: number; readonly defaultValue: number }
  readonly slots: readonly ConsoleUploadSlotSpec[]
}

export const VIDEO_REPLICATION_SCHEMA: ConsoleSchema = {
  title: '视频复刻 · 创作控制台',
  models: [
    { value: 'MiniMax-H3', label: 'MiniMax-H3' },
  ],
  ratios: [
    { value: '9:16', label: '9:16 竖屏' },
    { value: '16:9', label: '16:9 横屏' },
    { value: '1:1', label: '1:1 方图' },
  ],
  resolutions: [
    { value: '768P', label: '768P 标准' },
    { value: '2K', label: '2K 高清' },
  ],
  seconds: { min: 5, max: 60, step: 5, defaultValue: 15 },
  slots: [
    { id: 'source-video', label: '原视频', caption: '要复刻的视频 · 必选', kind: 'video', required: true, max: 1 },
    { id: 'product-images', label: '产品图', caption: '替换商品实值 · 最多 9 张', kind: 'image', max: 9 },
    { id: 'character-images', label: '人物图', caption: '可选 · 替换成固定人物', kind: 'image', max: 3 },
    { id: 'background-images', label: '背景图', caption: '可选 · 替换场景', kind: 'image', max: 3 },
  ],
}
