/**
 * HeightLab：输入框下方模板/创意库共用数据。
 * 每类 8 个（4 列 × 2 排）；配图为浅色渐变占位，后续可换真实缩略图。
 */

export interface Recommendation {
  title: string
  desc: string
  color: string
  /** 做同款时切换到的专家（缺省按所在标签推断：图片→图片专家等）。 */
  agent?: 'image-generator' | 'video-producer' | 'content-creator'
  /** 做同款时的结构描述（来源：Oil Skills 提炼，MIT 参考）。 */
  prompt?: string
  /** 成片效果缩略图（data URI SVG）；缺省时用占位渐变。 */
  thumbnail?: string
  /** 封面技能模板：cover=实操证据卡；impact-tech=冲击科技封面。 */
  cover?: 'cover' | 'impact-tech'
  /** 内容模板：激活输入框「平台/形式/风格/要求」对应选项，而不是填提示词。 */
  content?: ContentPrefPatch
  /** 控制台型模板：做同款不发「直接执行」指令，发模式宣告并引导用户在右栏控制台收集参数。 */
  console?: boolean
}

/** 内容创作输入框选项补丁（键名与 ContentToolbar 偏好字段一致）。 */
export interface ContentPrefPatch {
  platform?: 'general' | 'xhs' | 'douyin' | 'gzh' | 'shipinhao' | 'moments' | 'website' | 'email' | 'office'
  type?: 'note' | 'talk' | 'skit' | 'tutorial' | 'sales' | 'article' | 'slogan' | 'title' | 'deconstruct' | 'weekly' | 'minutes' | 'ppt' | 'email' | 'notice' | 'other'
  style?: 'default' | 'oil-tone' | 'advisor' | 'friendly' | 'formal' | 'youthful' | 'minimal' | 'story' | 'none'
  length?: 'any' | 'short' | 'medium' | 'long'
  audience?: 'any' | 'c' | 'b' | 'colleagues'
  withImage?: 'text' | 'with_image'
  reference?: 'none' | 'provide'
  extra?: string
}

export const TEMPLATE_ORDER = ['推荐', '文案', '图片', '视频', '办公', '术语'] as const
export type TemplateCategory = typeof TEMPLATE_ORDER[number]

// HeightLab 2026-08-29（企业版 M6）：「专属」栏数据——企业模式下输入框下方
// 最左侧的「专属」标签，展示本企业当前成员可见的全部定制模板（跨分类扁平化，
// 服务端已按成员权限过滤）。品牌三件套（品牌名/logo/主题色）随目录一起下发。
export interface EnterpriseBranding {
  brandName: string | null
  logoUrl: string | null
  slogan: string | null
  themeColor: string | null
}

/** 专属栏条目：企业模板 + 原分类（卡片角标用）。 */
export interface ExclusiveItem extends Recommendation {
  sourceCategory: string
}

export interface EnterpriseDockData {
  orgId: string
  exclusive: ExclusiveItem[]
  branding: EnterpriseBranding | null
}

let enterpriseDock: EnterpriseDockData | null = null

export function getEnterpriseDock(): EnterpriseDockData | null {
  return enterpriseDock
}

/** 主题色只接受 #RRGGBB，其他一律视为未配置（防 CSS 注入）。 */
export function normalizeThemeColor(raw: unknown): string | null {
  return typeof raw === 'string' && /^#[0-9a-fA-F]{6}$/.test(raw) ? raw : null
}

/** 企业品牌字段归一化：非字符串一律置空。 */
export function normalizeEnterpriseBranding(raw: unknown): EnterpriseBranding | null {
  if (raw === null || typeof raw !== 'object') return null
  const obj = raw as Record<string, unknown>
  const text = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null)
  return {
    brandName: text(obj.brandName),
    logoUrl: text(obj.logoUrl),
    slogan: text(obj.slogan),
    themeColor: normalizeThemeColor(obj.themeColor),
  }
}

/**
 * 企业模板跨分类扁平化（纯函数）：服务端下发结构为 { 分类: 条目[] }，
 * 每条补 sourceCategory；缺 color 的给默认浅色，保证专属栏渲染不依赖通用集。
 */
export function flattenEnterpriseTemplates(
  templates: Record<string, unknown[]>,
): ExclusiveItem[] {
  const out: ExclusiveItem[] = []
  for (const [cat, items] of Object.entries(templates)) {
    if (!Array.isArray(items)) continue
    for (const raw of items as Array<Partial<Recommendation> & { title?: unknown }>) {
      if (typeof raw?.title !== 'string' || raw.title === '') continue
      out.push({
        color: '#E8ECFF',
        desc: '',
        ...raw,
        title: raw.title,
        sourceCategory: cat,
      } as ExclusiveItem)
    }
  }
  return out
}

const P1MARK = 'P1MARK-9901'
void P1MARK

export const TEMPLATE_CARDS: Record<TemplateCategory, Recommendation[]> = {
  推荐: [
    {
      title: '小红书爆款封面',
      desc: '3:4 竖版 · 主题文字 + 卖点',
      color: '#FFE4D6',
      agent: 'image-generator',
      thumbnail: coverArt(),
      prompt: '封面结构：先提炼最有分量的结论/数字做主标题（≤14 字），副标题补一句卖点；无人物底图，文字与背景高对比、四周留安全边距',
    },
    { title: '电商主图优化', desc: '白底 + 场景氛围', color: '#DCE9FF', agent: 'image-generator' },
    {
      title: '口播视频脚本',
      desc: '黄金 3 秒开场 + 钩子',
      color: '#DFF3E0',
      agent: 'content-creator',
      content: { type: 'talk' },
    },
    { title: '产品海报设计', desc: '促销主视觉 · 大标题', color: '#F0E2FF', agent: 'image-generator' },
    { title: '抖音文案改写', desc: '对标爆款结构拆解', color: '#FFF1C9', agent: 'content-creator', content: { platform: 'douyin', type: 'deconstruct' } },
    {
      title: '会议纪要整理',
      desc: '结论先行 · 待办跟踪',
      color: '#DCF1EC',
      agent: 'content-creator',
      content: { platform: 'office', type: 'minutes' },
    },
    { title: '头像生成', desc: '职业照 / 卡通 / 插画风', color: '#FFE9F0', agent: 'image-generator' },
    {
      title: '周报总结',
      desc: '数据化 · 下周计划',
      color: '#E8ECFF',
      agent: 'content-creator',
      content: { platform: 'office', type: 'weekly' },
    },
  ],
  文案: [
    {
      title: '小红书笔记',
      desc: '标题 + 正文 + 话题标签',
      color: '#FFE4D6',
      content: { platform: 'xhs', type: 'note' },
    },
    { title: '抖音脚本', desc: '口播分镜 + 字幕', color: '#DCE9FF', content: { platform: 'douyin', type: 'talk' } },
    {
      title: '公众号文章',
      desc: '结构清晰 · 引导关注',
      color: '#DFF3E0',
      content: { platform: 'gzh', type: 'article' },
      prompt: '文风规范（oil-tone 提炼）：事实边界优先、平铺直叙、动词准确（不写“搞/弄”）、标题当内容标签、避免 AI 腔固定表达',
    },
    { title: '广告语', desc: '一句话卖点 + 记忆点', color: '#F0E2FF', content: { type: 'slogan' } },
    {
      title: '油式文风改写',
      desc: '事实边界 · 平铺直叙 · 准确动词',
      color: '#FFF1C9',
      content: { style: 'oil-tone' },
      prompt: '文风规范（oil-tone）：只写已确认事实、不编造经历/反馈；平铺直叙、删除语气词与填充句、动词准确（不用搞/弄/做/用等含糊单字）；标题当内容标签；删除 AI 腔与讨好表达；保留原文格式，中英数字间半角空格',
    },
    { title: '朋友圈文案', desc: '轻社交 · 有互动钩子', color: '#DCF1EC', content: { platform: 'moments' } },
    { title: '直播话术', desc: '开场留人 + 逼单', color: '#FFE9F0', content: { type: 'talk' } },
    {
      title: '品牌故事',
      desc: '创始初心 · 价值主张',
      color: '#E8ECFF',
      content: { type: 'article', style: 'story' },
      prompt: '故事结构：真实材料里的起因→过程→结果，用「我/我们」叙述，不虚构经历，结尾不硬加价值总结',
    },
  ],
  图片: [
    {
      title: '海报设计',
      desc: '大标题 + 主视觉',
      color: '#FFE4D6',
      prompt: '海报结构：一个视觉焦点+一个大标题（≤14 字）+一句副标题/卖点，安全留白，文字与背景高对比',
    },
    {
      title: '实操证据封面',
      desc: '以截图/视频为屏幕证据 · oil-cover 规范',
      color: '#DCE9FF',
      cover: 'cover',
      thumbnail: '/templates/cover-evidence.jpg',
      prompt: '封面结构（oil-cover）：真实屏幕证据 + 细网格柔和氛围 + 透视屏幕 + 衬线标题 + chip 点缀，三画幅可选',
    },
    { title: '商品主图', desc: '白底 / 场景 / 卖点', color: '#DFF3E0' },
    { title: '头像生成', desc: '职业照 / 卡通 / 插画风', color: '#F0E2FF' },
    {
      title: '插画创作',
      desc: '扁平 / 水彩 / 国潮',
      color: '#FFF1C9',
      prompt: '插画语言（oil-visual 提炼）：黑白墨线+点阵网纹，暖黄点缀，最多两个语义色；解释性图片把关键标签直接画进画面',
    },
    {
      title: 'LOGO 创意',
      desc: '极简 / 徽章 / 文字标',
      color: '#DCF1EC',
      prompt: '图标/标志结构（oil-icon 提炼）：先定风格规格（线性/填充/色块/立体/贴纸），锁定调色板，统一描边/圆角/细节密度，透明背景输出',
    },
    { title: '电商白底图', desc: '干净留白 · 商品居中', color: '#FFE9F0' },
    {
      title: '冲击科技封面',
      desc: '清爽科技杂志风 · 适合产品/对比/工作流',
      color: '#E8ECFF',
      cover: 'impact-tech',
      prompt: '封面结构（impact-tech）：清爽科技杂志 + 苹果式高级感，大标题 35%-50%，浅色纸面/冷白 + 少量信号黄点缀，轻 3D 屏幕锚点',
    },
  ],
  视频: [
    {
      title: '口播视频',
      desc: '数字人 / 真人出镜',
      color: '#FFE4D6',
      prompt: '口播结构：3 秒钩子→逐段讲清因果→结尾行动指令；数字人形象+克隆声音，字幕样式简洁',
    },
    {
      title: '产品演示',
      desc: '功能介绍 · 特写镜头',
      color: '#DCE9FF',
      prompt: '演示结构：功能痛点→操作特写→结果对比；镜头围绕产品，必要时拆解动作',
    },
    {
      title: '活动混剪',
      desc: '节奏卡点 · 转场',
      color: '#DFF3E0',
      prompt: '混剪结构：开场高光→时间线叙事→结尾定格；卡点转场+品牌条',
    },
    { title: '数字人播报', desc: '形象 + 声音 + 口型', color: '#F0E2FF' },
    { title: '分镜脚本', desc: '镜头表 + 台词', color: '#FFF1C9' },
    {
      title: '片头动画',
      desc: '3-5 秒品牌开场',
      color: '#DCF1EC',
      prompt: '动画结构（oil-motion 提炼）：先定义关键状态/首尾帧，再生成中间连续动作；语义运动交给生成模型，位移/缩放/显隐由程序精确控制',
    },
    { title: '探店 Vlog', desc: '第一视角 · 真实感', color: '#FFE9F0' },
    { title: '知识口播', desc: '干货结构 · 重点字幕', color: '#E8ECFF' },
  ],
  办公: [
    {
      title: '周报',
      desc: '数据化 · 下周计划',
      color: '#FFE4D6',
      prompt: '周报结构：成果量化、问题与原因、下周计划；平铺直叙，不写套话',
    },
    {
      title: '会议纪要',
      desc: '结论先行 · 待办跟踪',
      color: '#DCE9FF',
      prompt: '纪要结构：结论先行，决策/待办/负责人/截止时间分列',
    },
    {
      title: 'PPT 大纲',
      desc: '章节 + 每页要点',
      color: '#DFF3E0',
      prompt: '演示结构（oil-ppt 提炼）：16:9 页面，每页一个要点；封面标题→目录→内容页→结尾；文案用平实文风，页面只放必要信息',
    },
    { title: 'Excel 整理', desc: '表格结构 · 字段说明', color: '#F0E2FF' },
    { title: '通知公告', desc: '正式规范 · 时间地点', color: '#FFF1C9' },
    {
      title: '简历优化',
      desc: '成果量化 · 关键词',
      color: '#DCF1EC',
      prompt: '简历结构：每个经历用「动词+成果+数据」，按岗位关键词排序，一页内',
    },
    { title: '邮件回复', desc: '礼貌清晰 · 可执行', color: '#FFE9F0' },
    { title: '项目复盘', desc: '亮点 / 问题 / 改进', color: '#E8ECFF' },
  ],
  术语: [
    {
      title: 'Hover 悬停',
      desc: '鼠标放上按钮变个色，让人知道能点',
      color: '#FFE4D6',
      prompt: '术语讲解：悬停反馈（变色/浮起）+ 可点与不可点对比示例',
    },
    {
      title: 'Spring 弹性',
      desc: '弹窗出现带一点回弹，像弹簧轻晃',
      color: '#DCE9FF',
      prompt: '术语讲解：弹性动效 + 重播按钮演示回弹曲线',
    },
    {
      title: 'Backdrop Blur 毛玻璃',
      desc: '半透明导航，内容滚过去模糊',
      color: '#DFF3E0',
      prompt: '术语讲解：backdrop-filter 效果 + 开关对比有无模糊',
    },
    {
      title: 'Overshoot 回弹',
      desc: '先越过目标值再弹回来',
      color: '#F0E2FF',
      prompt: '术语讲解：overshoot 曲线 + 与普通缓动对比',
    },
    {
      title: 'Scroll-driven 滚动驱动',
      desc: '页面滚动控制动画进度',
      color: '#FFF1C9',
      prompt: '术语讲解：滚动进度驱动动画 + 可滚动示例',
    },
    {
      title: 'Easing 缓动',
      desc: '运动速度曲线（快慢变化）',
      color: '#DCF1EC',
      prompt: '术语讲解：ease-in/out/linear 曲线对比示例',
    },
    {
      title: '口语转准确需求',
      desc: '把模糊描述改成可直接发给 Agent 的需求',
      color: '#FFE9F0',
      prompt: '表达助手（vibe-hub 规则）：先请用户给出模糊描述或直接改写；保留原意、语气与约束，优先写可观察的行为和结果，不擅自增加框架/组件库/参数/实现方案；给出可直接复制的准确表达，再提示 1–3 个真正相关的术语及一句通俗解释；不生成课程或术语清单',
    },
    {
      title: 'Agent 回复大白话',
      desc: '贴一段看不懂的回复，解释并告诉下一步',
      color: '#E8ECFF',
      prompt: '表达助手（vibe-hub 规则）：请用户贴出 Agent 的原话；只挑影响下一步判断的概念，用大白话说明它指什么、负责什么、容易混淆的边界；告诉用户接下来怎么回复；不要逐词翻译整段，不自动开始课程',
    },
  ],
}

// HeightLab 2026-09-17（模板升级 P1，用户拍板）：原示例模板全部为占位、并未
// 真正生效——全部下架；首个真实模板「视频复刻」上架（skill 包：云镜
// YJ-331 视频复刻 2.0，源文件见 .claude/research/yunj-plugin/）。后续模板
// 按 skill 包逐个上架，不上架的不显示。
for (const key of Object.keys(TEMPLATE_CARDS) as TemplateCategory[]) {
  ;(TEMPLATE_CARDS[key] as Recommendation[]).length = 0
}
TEMPLATE_CARDS.视频.push({
  title: '视频复刻',
  desc: '上传原视频 · 分析镜头动作节奏 · 整理复刻方案',
  color: '#E4F0FF',
  agent: 'video-producer',
  console: true,
  prompt: '①上传要复刻的原视频（必选）'
    + '②在右侧创作控制台选择模型/画面比例/分辨率/成片秒数，'
    + '填写改款需求（替换产品/人物/场景/文案处理/风格），按需上传产品图等素材，'
    + '③点「生成视频」提交。',
})

/**
 * 热更新模板目录：优先取服务器 `/hl/templates`（host 代理到云端），
 * 失败/未登录时回退包内默认模板。服务器条目缺省字段用包内同名条目补齐，
 * 保证旧客户端兼容新模板结构。
 */
export async function loadTemplateCatalog(): Promise<Record<TemplateCategory, Recommendation[]> | null> {
  try {
    const res = await fetch('/hl/templates', { signal: AbortSignal.timeout(10_000) })
    if (!res.ok) return null
    const data = await res.json().catch(() => null)
    if (!data?.ok || !data.templates || typeof data.templates !== 'object') return null
    const merged: Record<TemplateCategory, Recommendation[]> = {
      推荐: [...TEMPLATE_CARDS.推荐],
      文案: [...TEMPLATE_CARDS.文案],
      图片: [...TEMPLATE_CARDS.图片],
      视频: [...TEMPLATE_CARDS.视频],
      办公: [...TEMPLATE_CARDS.办公],
      术语: [...TEMPLATE_CARDS.术语],
    }
    for (const [cat, items] of Object.entries(data.templates)) {
      if (!(cat in merged) || !Array.isArray(items)) continue
      merged[cat as TemplateCategory] = (items as Array<Partial<Recommendation> & { title: string }>)
        .map((it) => {
          const local = TEMPLATE_CARDS[cat as TemplateCategory].find(d => d.title === it.title)
          return { ...(local ?? {}), ...it } as Recommendation
        })
    }
    // HeightLab 2026-08-28（企业版 M3）：企业模式下把本组织定制模板追加
    // 到对应分类尾部（通用模板全部保留）；分类不在固定六类时并入「推荐」。
    // 模式与 orgId 由侧边栏切换项写入 localStorage（见 ui-sidebar/hl-mode）。
    // HeightLab 2026-08-29（企业版 M4）：合并时同步登记企业模板名，
    // 供输入框胶囊识别（getTemplateNames）；个人模式/失败时登记为空。
    const entNames: string[] = []
    let nextDock: EnterpriseDockData | null = null
    try {
      const mode = window.localStorage.getItem('hl.mode')
      const orgId = window.localStorage.getItem('hl.mode.orgId') ?? ''
      const ent = mode === 'enterprise' && orgId !== ''
        ? (data.enterprise as Record<string, {
          templates?: Record<string, unknown[]>
          branding?: unknown
        }> | undefined)?.[orgId]
        : undefined
      if (ent?.templates && typeof ent.templates === 'object') {
        for (const [cat, items] of Object.entries(ent.templates)) {
          if (!Array.isArray(items)) continue
          const target = (cat in merged ? cat : '推荐') as TemplateCategory
          const extras = (items as Array<Partial<Recommendation> & { title?: unknown }>)
            .filter((it): it is Partial<Recommendation> & { title: string } =>
              typeof it?.title === 'string' && it.title !== '')
          if (extras.length > 0) merged[target] = [...merged[target], ...extras.map(it => it as Recommendation)]
          for (const it of extras) entNames.push(it.title)
        }
        // M6：专属栏数据（跨分类扁平化 + 品牌）；条目已被服务端按成员权限过滤。
        nextDock = {
          orgId,
          exclusive: flattenEnterpriseTemplates(ent.templates),
          branding: normalizeEnterpriseBranding(ent.branding),
        }
      } else if (mode === 'enterprise' && orgId !== '') {
        // 企业模式但无企业段（个人用户无权/无数据）：专属栏空态，不泄露存在性。
        nextDock = { orgId, exclusive: [], branding: null }
      }
    } catch { /* localStorage 不可用：按个人模式 */ }
    enterpriseDock = nextDock
    setEnterpriseTemplateNames(entNames)
    return merged
  } catch {
    return null
  }
}

/** 全部模板名（去重，按标签顺序）；供输入框胶囊识别与整颗删除。 */
export const TEMPLATE_NAMES: string[] = Array.from(new Set(
  TEMPLATE_ORDER.flatMap(tag => TEMPLATE_CARDS[tag].map(item => item.title)),
))

// HeightLab 2026-08-29（企业版 M4）：企业模板名动态并入胶囊识别。
// 通用名单保持静态常量；企业名单由 loadTemplateCatalog 每次拉取后整体
// 替换（个人模式/拉取失败登记为空），不做增量叠加，避免切回个人版后
// 企业模板名残留。
const enterpriseTemplateNames = new Set<string>()

export function setEnterpriseTemplateNames(names: string[]): void {
  enterpriseTemplateNames.clear()
  for (const name of names) if (name !== '') enterpriseTemplateNames.add(name)
}

/** 胶囊识别用的完整模板名单：通用静态集 ∪ 当前企业模板名。 */
export function getTemplateNames(): string[] {
  return enterpriseTemplateNames.size === 0
    ? TEMPLATE_NAMES
    : [...TEMPLATE_NAMES, ...enterpriseTemplateNames]
}

/** 做同款指令：标题 + 说明 + 结构描述 + 用户已填写的弹窗信息。 */
export function sameTemplateText(item: Recommendation, answers: Record<string, string> = {}): string {
  // 控制台型模板：发「模式宣告」而非执行指令——参数与素材由右栏控制台随后
  // 提交，宣告阶段不得开始分析/生成（2026-09-18 用户拍板，替换通用包装语）。
  if (item.console === true) {
    const guide = item.prompt === undefined || item.prompt === ''
      ? '①上传必选素材 ②填写参数 ③点击「生成」提交'
      : item.prompt.replace(/。+$/, '')
    return `【模板：${item.title}】进入${item.title}模式。请先简短确认已进入，并引导用户在右侧创作控制台完成：${guide}。用户提交前不要开始分析或生成；素材与参数以控制台提交的任务文本为准。`
  }
  const structure = item.prompt === undefined || item.prompt === ''
    ? ''
    : `（结构要求：${item.prompt}）`
  const coverRule = item.cover !== undefined
    ? '（必须走「封面生成」技能：以本会话最近上传的截图/视频为屏幕证据；'
      + `风格：${item.cover === 'impact-tech' ? '冲击科技' : '实操证据卡'}；`
      + '没有素材时先请用户上传，禁止文生图）'
    : ''
  const filled = Object.entries(answers)
    .filter(([, value]) => typeof value === 'string' && value.trim() !== '')
    .map(([key, value]) => `${key}：${value}`)
    .join('；')
  const filledText = filled === '' ? '' : `用户已在弹窗填写：${filled}。`
  return `【模板：${item.title}】按模板做同款（${item.desc}）${structure}${coverRule}。` +
    filledText +
    '请按以上信息直接执行；仍有缺失项时再弹窗询问一次，禁止用默认值擅自生成。'
}

/** 占位配图：浅色渐变圆角块（后续可换成真实模板缩略图/图标）。 */
export function templateThumbUri(color: string): string {
  const svg =
    '<svg xmlns="http://www.w3.org/2000/svg" width="480" height="300">' +
    '<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">' +
    `<stop offset="0" stop-color="${color}"/><stop offset="1" stop-color="#ffffff"/>` +
    '</linearGradient></defs>' +
    '<rect width="480" height="300" rx="24" fill="url(#g)"/>' +
    '</svg>'
  return `data:image/svg+xml,${encodeURIComponent(svg)}`
}

/** 成片效果缩略图：优先用模板自己的成品图，缺省退回占位渐变。 */
export function templateThumb(item: Recommendation): string {
  return item.thumbnail ?? templateThumbUri(item.color)
}

/** 封面成片效果（oil-cover 结构：主标题 + 副标题卖点 + 安全留白 + 3:4 竖版）。 */
function coverArt(): string {
  const svg =
    '<svg xmlns="http://www.w3.org/2000/svg" width="480" height="300" viewBox="0 0 480 300" font-family="-apple-system,\'PingFang SC\',\'Microsoft YaHei\',sans-serif">' +
    '<defs>' +
    '<linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#FFE4D6"/><stop offset="1" stop-color="#FFFFFF"/></linearGradient>' +
    '<linearGradient id="card" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#FF8A65"/><stop offset="1" stop-color="#FFB59B"/></linearGradient>' +
    '</defs>' +
    '<rect width="480" height="300" rx="24" fill="url(#bg)"/>' +
    '<circle cx="48" cy="42" r="26" fill="#FFB59B" opacity="0.55"/>' +
    '<circle cx="438" cy="258" r="34" fill="#FF8A65" opacity="0.28"/>' +
    '<rect x="162" y="22" width="156" height="222" rx="14" fill="#FFFFFF" filter="drop-shadow(0 10px 24px rgba(180,90,50,0.22))"/>' +
    '<rect x="162" y="22" width="156" height="222" rx="14" fill="url(#card)"/>' +
    '<rect x="182" y="48" width="116" height="24" rx="12" fill="#FFFFFF" opacity="0.92"/>' +
    '<text x="240" y="65" text-anchor="middle" font-size="13" font-weight="700" fill="#E0552F">AI 实操</text>' +
    '<text x="240" y="132" text-anchor="middle" font-size="27" font-weight="800" fill="#FFFFFF">爆款封面</text>' +
    '<text x="240" y="158" text-anchor="middle" font-size="11" font-weight="500" fill="#FFF3EC">主题文字 + 卖点</text>' +
    '<rect x="206" y="196" width="68" height="5" rx="2.5" fill="#FFFFFF" opacity="0.85"/>' +
    '<text x="240" y="286" text-anchor="middle" font-size="12" font-weight="600" fill="#8A7A70">3:4 竖版 · 安全留白</text>' +
    '</svg>'
  return `data:image/svg+xml,${encodeURIComponent(svg)}`
}

// P1MARKER-9901
