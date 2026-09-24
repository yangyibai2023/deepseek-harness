/**
 * HeightLab V40：模板工作台参数 schema——13 个官方 skill 族各一套。
 * 每个 schema 由该 skill 的 SKILL.md 内容设计（它向用户要什么输入，
 * 工作台就有什么字段）；模板卡点击 → 按 item.skill 命中对应 schema。
 * 字段类型：text/textarea/select/number/images/video。
 */

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

const COMMON_OUTPUT: TemplateSection = {
  title: '输出要求',
  fields: [
    { id: 'ratio', label: '画面比例', type: 'select', options: ['9:16（竖屏，推荐）', '16:9（横屏）', '1:1', '3:4'] },
    { id: 'quality', label: '清晰度', type: 'select', options: ['768P（标准）', '2K（高清）'] },
    { id: 'duration', label: '时长', type: 'select', options: ['同原片/脚本节奏（推荐）', '5 秒', '10 秒', '15 秒'] },
  ],
}

const ROUTER_SCHEMA: TemplateSchema = {
  skill: 'yunjing-studio-router',
  title: '视频创意模板',
  intro: '官方视频创意模板（该分类下各模板共用总控工作流，按模板名进入对应分支）。',
  actionLabel: '开始创作',
  sections: [
    {
      title: '创作输入',
      fields: [
        { id: 'product', label: '产品名称与卖点', type: 'textarea', required: true, wide: true },
        { id: 'product_images', label: '产品图（≤9 张）', type: 'images' },
        { id: 'reference_video', label: '参考视频（可选）', type: 'video' },
        { id: 'notes', label: '特别要求', type: 'text', wide: true },
      ],
    },
  ],
}

export const TEMPLATE_SCHEMAS: Record<string, TemplateSchema> = {
  'yunjing-studio-original-ugc': {
    skill: 'yunjing-studio-original-ugc',
    title: '原创 UGC 1.0 · 经典广告',
    intro: '经典精简 UGC 广告结构：一次收集完整资料并输出精简可执行方案。',
    actionLabel: '开始创作',
    sections: [
      {
        title: '产品与卖点',
        fields: [
          { id: 'product', label: '产品名称与品类', type: 'text', placeholder: '例：不锈钢细网滤筛 / 厨房好物', required: true },
          { id: 'selling_points', label: '核心卖点（每行一条）', type: 'textarea', placeholder: '例：食品级不锈钢\n加高加深不洒漏', required: true, wide: true },
          { id: 'audience', label: '目标人群', type: 'text', placeholder: '例：25-40 岁家庭用户' },
          { id: 'product_images', label: '产品图（≤9 张，白底/实拍最佳）', type: 'images' },
        ],
      },
      {
        title: '创意方向',
        fields: [
          { id: 'ugc_type', label: 'UGC 类型', type: 'select', options: ['口播推荐', '产品测评', '开箱', '痛点解决', 'B-roll 展示'] },
          { id: 'platform', label: '投放平台', type: 'select', options: ['抖音', 'TikTok', 'Reels', '视频号', '小红书'] },
          { id: 'language', label: '口播语言', type: 'select', options: ['中文', '英语', '日语'] },
        ],
      },
      COMMON_OUTPUT,
    ],
  },
  'yunjing-studio-ugc-2': {
    skill: 'yunjing-studio-ugc-2',
    title: '原创 UGC 2.0 · 多镜头智能分镜',
    intro: '多镜头连续叙事：智能分镜、连续对白、人物/背景/产品/声音连续性锁定。',
    actionLabel: '开始创作',
    sections: [
      {
        title: '产品与素材',
        fields: [
          { id: 'product', label: '产品名称与品类', type: 'text', required: true },
          { id: 'selling_points', label: '核心卖点（每行一条）', type: 'textarea', required: true, wide: true },
          { id: 'product_images', label: '产品图（≤9 张）', type: 'images' },
          { id: 'reference_video', label: '参考视频（可选，模仿其节奏）', type: 'video' },
        ],
      },
      {
        title: '叙事与连续性',
        fields: [
          { id: 'narrative', label: '叙事类型', type: 'select', options: ['真人测评', '开箱', '手持展示', '生活方式', '前后对比'] },
          { id: 'host_setting', label: '达人设定', type: 'text', placeholder: '例：30 岁居家妈妈，亲和口语' },
          { id: 'continuity', label: '连续性锁定', type: 'select', options: ['人物+背景+产品+声音全部锁定（推荐）', '仅锁定产品'] },
        ],
      },
      COMMON_OUTPUT,
    ],
  },
  'yunjing-studio-video-replication-v2': {
    skill: 'yunjing-studio-video-replication-v2',
    title: '视频复刻 V2 · 精细复刻',
    intro: '拆解原片分镜/字幕/节奏后逐段复刻，可替换产品/人物/场景元素。',
    actionLabel: '开始复刻',
    sections: [
      {
        title: '原片与拆解',
        fields: [
          { id: 'source_video', label: '原视频', type: 'video', required: true },
          { id: 'frame_interval', label: '拆解抽帧密度', type: 'select', options: ['每秒 1 帧（标准）', '每 0.5 秒 1 帧（精细）', '每 2 秒 1 帧（快速）'] },
        ],
      },
      {
        title: '复刻口径',
        fields: [
          { id: 'rep_mode', label: '复刻方式', type: 'select', options: ['分镜驱动（原版，默认）', '像素复刻（贴原片）'] },
          { id: 'voice', label: '声音', type: 'select', options: ['原片声音（推荐）', '原片音色克隆', '智能识别', '我的资产声音', '静音'] },
          { id: 'subtitle', label: '字幕', type: 'select', options: ['智能识别（跟随原片）', '烧录字幕', '无字幕'] },
          { id: 'replace_product', label: '替换产品（名称/外观/卖点，不改可留空）', type: 'text', wide: true },
        ],
      },
      COMMON_OUTPUT,
    ],
  },
  'yunjing-studio-detail-page-director': {
    skill: 'yunjing-studio-detail-page-director',
    title: '商品详情页导演',
    intro: '商品详情页面的信息结构与视觉编排方案。',
    actionLabel: '开始创作',
    sections: [
      {
        title: '商品信息',
        fields: [
          { id: 'product', label: '商品名称与品类', type: 'text', required: true },
          { id: 'selling_points', label: '卖点/参数（每行一条）', type: 'textarea', required: true, wide: true },
          { id: 'product_images', label: '商品图（≤9 张）', type: 'images' },
        ],
      },
      {
        title: '编排偏好',
        fields: [
          { id: 'platform', label: '目标平台', type: 'select', options: ['淘宝/天猫', '京东', '拼多多', '抖音商城', '独立站'] },
          { id: 'structure', label: '结构偏好', type: 'select', options: ['卖点分层（推荐）', '场景带入', '参数对比'] },
        ],
      },
    ],
  },
  'yunjing-studio-ecommerce-images': {
    skill: 'yunjing-studio-ecommerce-images',
    title: '电商图片创作',
    intro: '商品图与营销图的 AI 批量生成。',
    actionLabel: '开始创作',
    sections: [
      {
        title: '商品素材',
        fields: [
          { id: 'product_images', label: '商品图（≤9 张）', type: 'images', required: true },
          { id: 'product', label: '商品介绍', type: 'textarea', placeholder: '例：植物精华滥用管瓶，主打清爽质地与日常护理，面向 25-40 岁女性', wide: true },
        ],
      },
      {
        title: '生成偏好',
        fields: [
          { id: 'language', label: '目标语言', type: 'select', options: ['中文', '英语'] },
          { id: 'platform', label: '销售平台', type: 'select', options: ['自动推荐', '抖音', '天猫', '京东'] },
          { id: 'count', label: '生成数量', type: 'number' },
        ],
      },
    ],
  },
  'yunjing-studio-brand-strategy': {
    skill: 'yunjing-studio-brand-strategy',
    title: '品牌策略',
    intro: '品牌定位、人群与内容策略方案。',
    actionLabel: '开始创作',
    sections: [
      {
        title: '品牌输入',
        fields: [
          { id: 'brand', label: '品牌/产品名', type: 'text', required: true },
          { id: 'positioning', label: '当前定位与诉求', type: 'textarea', required: true, wide: true },
          { id: 'competitors', label: '竞品（可选，每行一个）', type: 'textarea', wide: true },
        ],
      },
    ],
  },
  'yunjing-studio-customer-insight': {
    skill: 'yunjing-studio-customer-insight',
    title: '客户洞察',
    intro: '目标人群的痛点、动机与内容偏好洞察。',
    actionLabel: '开始创作',
    sections: [
      {
        title: '洞察对象',
        fields: [
          { id: 'product', label: '产品/服务', type: 'text', required: true },
          { id: 'audience', label: '目标人群描述', type: 'textarea', required: true, wide: true },
          { id: 'goal', label: '想验证的问题', type: 'text', placeholder: '例：为什么犹豫下单' },
        ],
      },
    ],
  },
  'yunjing-studio-meta-optimizer': {
    skill: 'yunjing-studio-meta-optimizer',
    title: '投放素材优化',
    intro: '广告投放素材的诊断与迭代优化方案。',
    actionLabel: '开始创作',
    sections: [
      {
        title: '素材与目标',
        fields: [
          { id: 'material_desc', label: '现有素材描述/数据', type: 'textarea', required: true, wide: true },
          { id: 'goal', label: '优化目标', type: 'select', options: ['提升点击率', '提升转化率', '降低 ACP', '延长停留'] },
        ],
      },
    ],
  },
  'yunjing-studio-sd2-generate': {
    skill: 'yunjing-studio-sd2-generate',
    title: 'SD2 视频渠道',
    intro: 'SD2 视频渠道的生成与计费口径。',
    actionLabel: '开始创作',
    sections: [
      {
        title: '生成输入',
        fields: [
          { id: 'prompt', label: '画面/Prompt 描述', type: 'textarea', required: true, wide: true },
          { id: 'reference_video', label: '参考视频（可选）', type: 'video' },
        ],
      },
      COMMON_OUTPUT,
    ],
  },
  'yunjing-studio-router': ROUTER_SCHEMA,
}

// V41：把全部 images/video 字段注册为控制台通用槽位——模板工作台直接
// 复用复刻控制台的整套上传链（缩略图/删除/资产库/本地路径落盘）。字段 id
// 跨 schema 去重（同名槽位共享素材，切换模板不丢已传文件）。
import { VIDEO_REPLICATION_SCHEMA } from './schema.ts'
import type { ConsoleUploadSlotSpec } from './schema.ts'
const extraSlots: ConsoleUploadSlotSpec[] = []
for (const schema of Object.values(TEMPLATE_SCHEMAS)) {
  for (const sec of schema.sections) {
    for (const f of sec.fields) {
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
}
// slots 声明为 readonly 是防误改约定；模板槽位是同一 schema 的合法扩展点，
// 此处经类型断言整体替换（运行时为普通数组）。
;(VIDEO_REPLICATION_SCHEMA as unknown as { slots: ConsoleUploadSlotSpec[] }).slots = [
  ...VIDEO_REPLICATION_SCHEMA.slots,
  ...extraSlots,
]

/** 模板 → schema（目录项 skill 未命中时回落总控）。 */
export function schemaForSkill(skill: string): TemplateSchema {
  return TEMPLATE_SCHEMAS[skill] ?? ROUTER_SCHEMA
}
