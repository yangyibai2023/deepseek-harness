/**
 * HeightLab V43：模板工作台参数 schema——13 个官方 skill 族全量展开
 * （字段源自各 SKILL.md 实际定义的输入与选择项）+ 模板级专属字段扩展
 * （TEMPLATE_FIELD_EXTENSIONS，key=目录项 id）。
 * 图片/视频字段在模块加载时统一动态注册为控制台上传槽位（文件尾部）。
 */
import { VIDEO_REPLICATION_SCHEMA } from './schema.ts'
import type { ConsoleUploadSlotSpec } from './schema.ts'

export interface TemplateField {
  id: string
  label: string
  type: 'text' | 'textarea' | 'select' | 'number' | 'images' | 'video'
  options?: string[]
  placeholder?: string
  required?: boolean
  wide?: boolean
}

export interface TemplateSection {
  title: string
  fields: TemplateField[]
}

export interface TemplateSchema {
  skill: string
  title: string
  intro: string
  actionLabel: string
  sections: TemplateSection[]
}

const NOTES: TemplateField = { id: 'notes', label: '特别要求（未尽事项写这里）', type: 'text', wide: true }
const COMMON_OUTPUT: TemplateSection = {
  title: '输出要求',
  fields: [
    { id: 'ratio', label: '画面比例', type: 'select', options: ['9:16（竖屏，推荐）', '16:9（横屏）', '1:1', '3:4'] },
    { id: 'quality', label: '清晰度', type: 'select', options: ['768P（标准）', '2K（高清）'] },
    { id: 'duration', label: '时长', type: 'select', options: ['同脚本/原片节奏（推荐）', '5 秒', '10 秒', '15 秒'] },
    NOTES,
  ],
}

export const TEMPLATE_SCHEMAS: Record<string, TemplateSchema> = {
  'yunjing-studio-original-ugc': {
    skill: 'yunjing-studio-original-ugc',
    title: '原创 UGC 1.0 · 经典广告',
    intro: '经典精简 UGC：填写产品名称、用途与真实卖点，输出脚本、口播、6 个 B-roll 与剪辑顺序。',
    actionLabel: '开始创作',
    sections: [
      { title: '产品与卖点', fields: [
        { id: 'product', label: '产品名称/用途', type: 'text', required: true },
        { id: 'selling_points', label: '真实卖点（每行一条）', type: 'textarea', required: true, wide: true },
        { id: 'audience', label: '目标人群', type: 'text' },
        { id: 'product_images', label: '产品图（≤9 张，白底/实拍最佳）', type: 'images' },
      ]},
      { title: '创意方向', fields: [
        { id: 'ugc_type', label: 'UGC 类型', type: 'select', options: ['口播推荐', '产品测评', '开箱', '痛点解决', 'B-roll 展示'] },
        { id: 'voice_form', label: '声音形态', type: 'select', options: ['口播', '旁白', '纯画面+音乐', 'ASMR'] },
        { id: 'shoot_style', label: '拍摄风格', type: 'select', options: ['手持自拍', '固定机位', '桌面俯拍', '户外漫步', '风格库推荐'] },
        { id: 'platform', label: '投放平台', type: 'select', options: ['抖音', 'TikTok', 'Reels', '视频号', '小红书'] },
        { id: 'language', label: '口播语言', type: 'select', options: ['中文', '英语', '日语'] },
      ]},
      COMMON_OUTPUT,
    ],
  },
  'yunjing-studio-ugc-2': {
    skill: 'yunjing-studio-ugc-2',
    title: '原创 UGC 2.0 · 多镜头智能分镜',
    intro: '多镜头连续叙事：智能分镜、连续对白，锁定人物/背景/产品/声音连续性。',
    actionLabel: '开始创作',
    sections: [
      { title: '产品与素材', fields: [
        { id: 'product', label: '产品名称与品类', type: 'text', required: true },
        { id: 'selling_points', label: '卖点与可用证据（每行一条）', type: 'textarea', required: true, wide: true },
        { id: 'product_images', label: '产品图（≤9 张）', type: 'images' },
        { id: 'reference_video', label: '参考视频（可选，模仿其节奏）', type: 'video' },
      ]},
      { title: '叙事与连续性', fields: [
        { id: 'narrative', label: '叙事类型', type: 'select', options: ['真人测评', '开箱', '手持展示', '生活方式', '痛点解决', '前后对比'] },
        { id: 'host_setting', label: '达人设定', type: 'text', placeholder: '例：30 岁居家妈妈，亲和口语' },
        { id: 'reference_strategy', label: '参考素材策略', type: 'select', options: ['required（必须上传参考，推荐）', '可选'] },
        { id: 'platform', label: '投放平台', type: 'select', options: ['抖音', 'TikTok', 'Reels', 'Meta 短视频'] },
      ]},
      COMMON_OUTPUT,
    ],
  },
  'yunjing-studio-video-replication-v2': {
    skill: 'yunjing-studio-video-replication-v2',
    title: '视频复刻 V2 · 精细复刻',
    intro: '拆解原片分镜/字幕/节奏后逐段复刻；素材/模型/时长/比例确认后冻结。',
    actionLabel: '开始复刻',
    sections: [
      { title: '原片与拆解', fields: [
        { id: 'source_video', label: '原视频', type: 'video', required: true },
        { id: 'frame_interval', label: '拆解抽帧密度', type: 'select', options: ['每秒 1 帧（标准）', '每 0.5 秒 1 帧（精细）', '每 2 秒 1 帧（快速）'] },
        { id: 'enhanced', label: '分析版本', type: 'select', options: ['标准分析', '增强版（参考视频分析后选择）'] },
      ]},
      { title: '复刻口径（确认后冻结）', fields: [
        { id: 'rep_mode', label: '复刻方式', type: 'select', options: ['分镜驱动（原版，默认）', '像素复刻（贴原片）'] },
        { id: 'voice', label: '声音', type: 'select', options: ['原片声音（推荐）', '原片音色克隆', '智能识别', '我的资产声音', '静音'] },
        { id: 'subtitle', label: '字幕', type: 'select', options: ['智能识别（跟随原片）', '烧录字幕', '无字幕'] },
        { id: 'replace_product', label: '替换产品（名称/外观/卖点，不改可留空）', type: 'text', wide: true },
        { id: 'reference_confirm', label: '参考图确认', type: 'select', options: ['参考图须在写提示词前经我确认（推荐）', '跳过确认'] },
      ]},
      COMMON_OUTPUT,
    ],
  },
  'yunjing-studio-detail-page-director': {
    skill: 'yunjing-studio-detail-page-director',
    title: '商品详情页导演',
    intro: '卖点矩阵、多角度展示、生活方式图、包装细节、组件结构与品牌收尾编排。',
    actionLabel: '开始创作',
    sections: [
      { title: '商品信息', fields: [
        { id: 'product', label: '商品名称与品类', type: 'text', required: true },
        { id: 'selling_points', label: '卖点矩阵（每行一条）', type: 'textarea', required: true, wide: true },
        { id: 'product_images', label: '商品参考图（≤9 张）', type: 'images', required: true },
      ]},
      { title: '编排偏好', fields: [
        { id: 'platform', label: '目标平台', type: 'select', options: ['淘宝/天猫', '京东', '拼多多', '抖音商城', '独立站'] },
        { id: 'modules', label: '内容模块', type: 'select', options: ['卖点信息图', '多角度展示', '生活方式图', '包装细节', '组件结构', '使用步骤', '品牌收尾'] },
        { id: 'text_rule', label: '图内文字', type: 'select', options: ['保持已确认文字的原文（推荐）', '允许改写'] },
        { id: 'forbid', label: '禁项', type: 'select', options: ['不出现平台界面/零售商标识/采购渠道（推荐）', '无特殊要求'] },
      ]},
    ],
  },
  'yunjing-studio-ecommerce-images': {
    skill: 'yunjing-studio-ecommerce-images',
    title: '电商图片创作',
    intro: '商品图与营销图批量生成：每张自动换一套构图方向，不重复同一张。',
    actionLabel: '开始创作',
    sections: [
      { title: '商品素材', fields: [
        { id: 'product_images', label: '商品图（≤9 张，可一次多选）', type: 'images', required: true },
        { id: 'product', label: '商品介绍（不会写没关系）', type: 'textarea', placeholder: '例：植物精华滥用管瓶，主打清爽质地与日常护理，面向 25-40 岁女性', wide: true },
      ]},
      { title: '生成偏好', fields: [
        { id: 'language', label: '目标语言', type: 'select', options: ['中文', '英语'] },
        { id: 'platform', label: '销售平台', type: 'select', options: ['自动推荐', '抖音', '天猫', '京东', '独立站'] },
        { id: 'composition', label: '构图方向', type: 'select', options: ['每张自动换一套（主视觉/卖点拆解/场景图/细节特写，推荐）', '统一构图'] },
        { id: 'count', label: '生成数量', type: 'number' },
        { id: 'selling_copy', label: '卖点文案（适用时）', type: 'textarea', wide: true },
      ]},
    ],
  },
  'yunjing-studio-brand-strategy': {
    skill: 'yunjing-studio-brand-strategy',
    title: '品牌策略（YJ-101 族）',
    intro: '品牌定位、人群与内容策略方案。',
    actionLabel: '开始创作',
    sections: [
      { title: '品牌输入', fields: [
        { id: 'brand', label: '品牌/产品名', type: 'text', required: true },
        { id: 'positioning', label: '当前定位与诉求', type: 'textarea', required: true, wide: true },
        { id: 'competitors', label: '竞品（可选，每行一个）', type: 'textarea', wide: true },
        NOTES,
      ]},
    ],
  },
  'yunjing-studio-customer-insight': {
    skill: 'yunjing-studio-customer-insight',
    title: '客户洞察（YJ-201 族）',
    intro: '目标人群的痛点、动机与内容偏好洞察。',
    actionLabel: '开始创作',
    sections: [
      { title: '洞察对象', fields: [
        { id: 'product', label: '产品/服务', type: 'text', required: true },
        { id: 'audience', label: '目标人群描述', type: 'textarea', required: true, wide: true },
        { id: 'goal', label: '想验证的问题', type: 'text' },
        NOTES,
      ]},
    ],
  },
  'yunjing-studio-meta-optimizer': {
    skill: 'yunjing-studio-meta-optimizer',
    title: '投放素材优化（YJ-501）',
    intro: '广告投放素材的诊断与迭代优化方案。',
    actionLabel: '开始创作',
    sections: [
      { title: '素材与目标', fields: [
        { id: 'material_desc', label: '现有素材描述/数据', type: 'textarea', required: true, wide: true },
        { id: 'goal', label: '优化目标', type: 'select', options: ['提升点击率', '提升转化率', '降低 ACP', '延长停留'] },
        NOTES,
      ]},
    ],
  },
  'yunjing-studio-sd2-generate': {
    skill: 'yunjing-studio-sd2-generate',
    title: 'SD2 视频渠道（YJ-801）',
    intro: 'SD2 渠道生成：真实模型 ID、一次创建、轮询取件；参考素材门禁校验。',
    actionLabel: '开始创作',
    sections: [
      { title: '生成输入', fields: [
        { id: 'prompt', label: '画面/Prompt 描述', type: 'textarea', required: true, wide: true },
        { id: 'reference_images', label: '参考图（人物/背景/产品一致性）', type: 'images' },
        { id: 'reference_video', label: '参考视频/音频（可选）', type: 'video' },
        { id: 'model_tier', label: '模型档位', type: 'select', options: ['标准', '增强版（参考视频分析后）'] },
      ]},
      COMMON_OUTPUT,
    ],
  },
  'global-video-prompt-director': {
    skill: 'global-video-prompt-director',
    title: '全局视频提示词导演（YJ-320 族 · 43 场景）',
    intro: '自动场景主播等 43 个场景模板的总导演：把产品/市场/素材做成策划、分镜与纯净 Prompt。',
    actionLabel: '开始创作',
    sections: [
      { title: '创作输入', fields: [
        { id: 'product', label: '产品名称与卖点/Hook', type: 'textarea', required: true, wide: true },
        { id: 'product_images', label: '产品图（≤9 张）', type: 'images' },
        { id: 'reference_video', label: '参考视频/关键帧（可选）', type: 'video' },
        { id: 'market', label: '市场/人群', type: 'text', placeholder: '例：国内抖音 女装 25-40 岁' },
      ]},
      { title: '场景与节奏', fields: [
        { id: 'scene_note', label: '场景模板确认', type: 'text', placeholder: '例：服装卡点变装（默认按所选模板）' },
        { id: 'style', label: '拍摄风格', type: 'select', options: ['按模板默认', '手持自拍', '固定机位', '一镜到底', '快剪卡点'] },
        NOTES,
      ]},
      COMMON_OUTPUT,
    ],
  },
  'yunjing-studio-video-replication': {
    skill: 'yunjing-studio-video-replication',
    title: '视频复刻 V1（兼容）',
    intro: 'V1 复刻工作流（新任务请用 V2）。',
    actionLabel: '开始复刻',
    sections: [
      { title: '输入', fields: [
        { id: 'source_video', label: '原视频', type: 'video', required: true },
        NOTES,
      ]},
    ],
  },
  'yunjing-studio-updater': {
    skill: 'yunjing-studio-updater',
    title: '插件更新（系统）',
    intro: '系统内部模板，不对外使用。',
    actionLabel: '开始',
    sections: [{ title: '输入', fields: [{ id: 'notes', label: '说明', type: 'text', wide: true }] }],
  },
}
export const TEMPLATE_FIELD_EXTENSIONS: Record<string, TemplateField[]> = {
  'yj-401-fashion-tryon': [
    { id: 'model_desc', label: '模特要求', type: 'text', placeholder: '例：亚洲女性 25 岁，身高 170' },
    { id: 'garment_desc', label: '服装描述', type: 'text', placeholder: '例：黑色连衣裙' },
    { id: 'tryon_scene', label: '场景', type: 'select', options: ['纯色影棚', '街头', '室内家居', '户外'] },
  ],
  'yj-401-image-text-edit': [
    { id: 'original_image', label: '原图（含待改文字）', type: 'images', required: true },
    { id: 'text_change', label: '文字改成什么', type: 'textarea', required: true, wide: true },
  ],
  'yj-401-product-model': [
    { id: 'model_desc', label: '模特要求', type: 'text', placeholder: '例：男模 30 岁 商务感' },
    { id: 'model_scene', label: '场景', type: 'select', options: ['纯色影棚', '电商棚拍', '街头', '室内家居', '户外'] },
  ],
  'yj-401-benchmark-replica': [
    { id: 'benchmark_image', label: '对标版式参考图', type: 'images' },
    { id: 'keep_structure', label: '版式结构', type: 'select', options: ['与对标图完全一致（推荐）', '允许微调'] },
  ],
  'yj-401-commercial-poster': [
    { id: 'poster_style', label: '海报风格', type: 'select', options: ['促销大促', '品牌质感', '极简', '节日主题'] },
    { id: 'poster_text', label: '海报文案（标题/副标题）', type: 'textarea', wide: true },
  ],
  'yj-401-custom-batch-edit': [
    { id: 'edit_instruction', label: '编辑指令（每行一条）', type: 'textarea', required: true, wide: true },
    { id: 'batch_count', label: '批量数量', type: 'number' },
  ],
  'yj-401-original-main-detail': [
    { id: 'main_image_style', label: '主图风格', type: 'select', options: ['白底', '场景化', '模特着用'] },
    { id: 'detail_structure', label: '详情结构', type: 'select', options: ['卖点分层（推荐）', '场景带入', '参数对比'] },
  ],
}
/** 模板 → schema（基础族 schema + 该模板专属字段段落）。 */
export function schemaForTemplate(templateId: string, skill: string): TemplateSchema {
  const base = schemaForSkill(skill)
  const ext = TEMPLATE_FIELD_EXTENSIONS[templateId]
  if (ext === undefined || ext.length === 0) return base
  const sections = base.sections.slice()
  const lastSection = sections[sections.length - 1]
  const insertAt = sections.length > 0 && lastSection?.title === '输出要求' ? sections.length - 1 : sections.length
  sections.splice(insertAt, 0, { title: '本模板专属', fields: ext })
  return { ...base, sections }
}

export function schemaForSkill(skill: string): TemplateSchema {
  return TEMPLATE_SCHEMAS[skill] ?? TEMPLATE_SCHEMAS['yunjing-studio-router'] ?? TEMPLATE_SCHEMAS[Object.keys(TEMPLATE_SCHEMAS)[0] ?? 'yunjing-studio-router'] as TemplateSchema
}

// V41：把全部 images/video 字段注册为控制台通用槽位——模板工作台直接
// 复用复刻控制台的整套上传链（缩略图/删除/资产库/本地路径落盘）。字段 id
// 跨 schema 去重（同名槽位共享素材，切换模板不丢已传文件）。slots 声明为
// readonly 是防误改约定，此处为合法扩展点（类型断言整体替换）。
const extraSlots: ConsoleUploadSlotSpec[] = []
const fieldGroups: TemplateField[][] = [
  ...Object.values(TEMPLATE_SCHEMAS).map(schema => schema.sections.flatMap(sec => sec.fields)),
  ...Object.values(TEMPLATE_FIELD_EXTENSIONS),
]
for (const fields of fieldGroups) {
  for (const f of fields) {
    if (f.type !== 'images' && f.type !== 'video') continue
    const id = `tpl-${f.id}`
    if (extraSlots.some(s => s.id === id) || VIDEO_REPLICATION_SCHEMA.slots.some(s => s.id === id)) continue
    extraSlots.push({
      id,
      label: f.label,
      caption: f.type === 'video' ? '上传后随任务进入对话（单文件）' : '上传后随任务进入对话',
      max: f.type === 'video' ? 1 : 9,
      kind: f.type === 'video' ? 'video' : 'image',
    })
  }
}
;(VIDEO_REPLICATION_SCHEMA as unknown as { slots: ConsoleUploadSlotSpec[] }).slots = [
  ...VIDEO_REPLICATION_SCHEMA.slots,
  ...extraSlots,
]
