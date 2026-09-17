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

/** 改款需求层：文本/选择字段，随任务文本逐行带给专家（空值不下发）。 */
export interface ConsoleFieldSpec {
  readonly id: string
  readonly label: string
  readonly placeholder: string
  readonly kind: 'text' | 'select'
  readonly options?: readonly ConsoleSelectOption[]
}

export interface ConsoleSchema {
  readonly title: string
  readonly models: readonly ConsoleSelectOption[]
  readonly ratios: readonly ConsoleSelectOption[]
  readonly resolutions: readonly ConsoleSelectOption[]
  readonly seconds: { readonly min: number; readonly max: number; readonly step: number; readonly defaultValue: number }
  readonly fields: readonly ConsoleFieldSpec[]
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
  fields: [
    {
      id: 'product',
      label: '替换产品',
      placeholder: '产品名称/外观/卖点/品牌Logo；不改产品可留空',
      kind: 'text',
    },
    {
      id: 'character',
      label: '人物',
      placeholder: '替换成什么人物；留空=保持原片人物',
      kind: 'text',
    },
    {
      id: 'scene',
      label: '场景',
      placeholder: '替换成什么场景；留空=保留原片场景',
      kind: 'text',
    },
    {
      id: 'copy-mode',
      label: '文案',
      placeholder: '',
      kind: 'select',
      options: [
        { value: '保留原片文案', label: '保留原片文案' },
        { value: '按原片结构重写', label: '按原片结构重写' },
      ],
    },
    {
      id: 'style',
      label: '风格',
      placeholder: '留空=跟随原片风格',
      kind: 'text',
    },
    {
      id: 'notes',
      label: '特别要求',
      placeholder: '其他补充说明；没有可留空',
      kind: 'text',
    },
  ],
  slots: [
    { id: 'source-video', label: '原视频', caption: '要复刻的视频 · 必选', kind: 'video', required: true, max: 1 },
    { id: 'product-images', label: '产品图', caption: '要换成的新产品照片（白底/实拍更准，最多 9 张）', kind: 'image', max: 9 },
    { id: 'character-images', label: '人物图', caption: '新人物的参考照片（可选，最多 3 张）', kind: 'image', max: 3 },
    { id: 'background-images', label: '场景图', caption: '新场景的参考图（可选，最多 3 张）', kind: 'image', max: 3 },
  ],
}
