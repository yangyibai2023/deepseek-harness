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
    { id: 'generation_mode', label: '生成方式', type: 'select', options: ['完整成片单条（推荐）', '分段独立生成后拼接'] },
    { id: 'delivery_mode', label: '交付模式', type: 'select', options: ['快速交付（成片核验即交付，推荐）', '深度检查（逐帧复核后交付）'] },
    { id: 'output_language', label: '输出语言', type: 'select', options: ['中文（默认）', '英语', '日语', '按素材语言'] },
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
        { id: 'device_visibility', label: '拍摄设备是否可见', type: 'select', options: ['不入镜（默认）', '设备可见（手持自拍感）'] },
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
        { id: 'creator_mode', label: '创作模式', type: 'select', options: ['reference_creator（参考创作，推荐）', 'text_locked_creator（文字锁定）'] },
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
        { id: 'multi_product', label: '多产品口径', type: 'select', options: ['每款分别生成一条（官方默认）', '合并为一条'] },
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
  'yj-320-adaptive-scene-host': [
    { id: 'host_gender_age', label: '主播形象（性别/年龄段）', type: 'text', placeholder: '例：30 岁左右居家女性' },
    { id: 'auto_scene', label: '场景选择', type: 'select', options: ['系统自动推断（推荐）', '居家', '厨房', '办公室', '户外', '门店'] },
    { id: 'pain_hook', label: '最强痛点/Hook 方向', type: 'text', placeholder: '例：做饭时手忙脚乱' },
    { id: 'host_emotion', label: '情绪强度', type: 'select', options: ['自然亲和（推荐）', '热情高涨', '专业沉稳', '幽默轻松'] },
    { id: 'scene_confirm', label: '推断确认方式', type: 'select', options: ['先公开系统推断的人物与场景（推荐）', '直接生成最终提示词'] },
  ],
  'yj-320-before-after': [
    { id: 'before_state', label: '使用前状态描述', type: 'textarea', wide: true },
    { id: 'after_state', label: '使用后状态/期望效果', type: 'textarea', wide: true },
    { id: 'transition', label: '转场方式（只选一个）', type: 'select', options: ['手势遮挡', '横移镜头', '跳剪硬切', '物品划过', '眨眼/低头'] },
    { id: 'anchor_lock', label: '前后一致性', type: 'select', options: ['同机位同主体同背景（推荐）', '允许轻微变化'] },
    { id: 'ending', label: '结尾方式', type: 'select', options: ['结果定格', '重复对比一次', '自然收尾'] },
  ],
  'yj-320-brand-craftsman': [
    { id: 'craft_steps', label: '制作工艺步骤（每行一个动作，2-4 个）', type: 'textarea', wide: true },
    { id: 'craftsman_persona', label: '主理人人设', type: 'text', placeholder: '例：手工皮具工作室主理人' },
    { id: 'asmr_focus', label: '声音重点', type: 'select', options: ['敲打/切割声', '翻动/摩擦声', '水声/搅拌声', '无特殊要求'] },
    { id: 'product_count', label: '成品展示数量', type: 'select', options: ['少量成品（1-2 件，推荐）', '多件陈列'] },
    { id: 'scene_setting', label: '工作室/工坊场景描述', type: 'text' },
  ],
  'yj-320-car-host': [
    { id: 'seat_position', label: '车内位置', type: 'select', options: ['驾驶座（车辆静止）', '副驾驶', '后排'] },
    { id: 'camera_way', label: '机位', type: 'select', options: ['手机支架固定', '手持自拍'] },
    { id: 'light_time', label: '光线时段', type: 'select', options: ['白天自然车窗光（推荐）', '傍晚暖光', '夜间车内灯'] },
    { id: 'car_talk_style', label: '分享语气', type: 'select', options: ['随口安利', '闺蜜/兄弟分享', '专业讲解'] },
    { id: 'product_use', label: '产品在车内如何使用/佩戴', type: 'text' },
  ],
  'yj-320-comment-reply': [
    { id: 'review_content', label: '要回应的评论/质疑内容', type: 'textarea', required: true, wide: true },
    { id: 'reply_persona', label: '回复人设', type: 'select', options: ['品牌主理人', '专业顾问', '幽默博主', '普通用户'] },
    { id: 'reply_tone', label: '回复语气', type: 'select', options: ['真诚耐心', '硬核证明', '幽默回怼', '克制专业'] },
    { id: 'demo_way', label: '回答方式', type: 'select', options: ['实操演示', '讲解+演示', '纯讲解'] },
    { id: 'comment_ui', label: '评论截图处理', type: 'select', options: ['后期添加截图（推荐）', '不生成评论文字'] },
  ],
  'yj-320-comparison-test': [
    { id: 'compare_target', label: '对比对象', type: 'select', options: ['与同类竞品', '与旧方法/旧产品', '与普通款', '与不使用状态'] },
    { id: 'test_item', label: '测试项目', type: 'text', placeholder: '例：吸水性与保温时长' },
    { id: 'result_show', label: '结果呈现', type: 'select', options: ['并排特写', '逐个演示后定格', '标签对照'] },
    { id: 'fair_note', label: '公平条件说明', type: 'text', placeholder: '例：同容量同水温' },
    { id: 'host_action', label: '操作方式', type: 'select', options: ['双手同条件操作', '分先后演示'] },
  ],
  'yj-320-craftsman-live-clip': [
    { id: 'craft_point', label: '要讲解的工艺点', type: 'text', placeholder: '例：手工缝线的走线密度' },
    { id: 'live_vibe', label: '直播氛围', type: 'select', options: ['安静工作+低声讲解', '边做边聊天', '高互动答疑'] },
    { id: 'finished_show', label: '成品展示', type: 'select', options: ['工作台上少量成品（推荐）', '特写单件成品'] },
    { id: 'asmr_focus', label: '声音重点', type: 'select', options: ['工具敲打/打磨声', '布料/纸张摩擦声', '无特殊要求'] },
    { id: 'ui_confirm', label: '弹幕/直播 UI', type: 'select', options: ['后期添加（推荐）', '不出现'] },
  ],
  'yj-320-crowd-rush': [
    { id: 'crowd_level', label: '人群热度', type: 'select', options: ['热烈（安全）', '夸张喜剧化', '适度围观'] },
    { id: 'rush_trigger', label: '抢购触发情境', type: 'text', placeholder: '例：补货车刚推出来' },
    { id: 'hero_action', label: '主角取得产品的方式', type: 'text' },
    { id: 'safe_confirm', label: '安全改写确认', type: 'select', options: ['喜剧化处理，不出现摔倒冲撞（推荐）', '无特殊要求'] },
    { id: 'ending', label: '结尾反应', type: 'select', options: ['近景惊喜反应', '举起产品定格', '自然结账'] },
  ],
  'yj-320-dramatic-short': [
    { id: 'conflict_type', label: '冲突类型', type: 'select', options: ['情侣日常', '同事摩擦', '朋友误会', '家庭分歧'] },
    { id: 'roles', label: '角色数量', type: 'number' },
    { id: 'product_join', label: '产品接入方式', type: 'select', options: ['作为解决关键', '作为争执导火索后反转', '自然递接'] },
    { id: 'twist', label: '反转方式', type: 'text', placeholder: '例：被嫌弃的产品反而帮了大忙' },
    { id: 'ending_emotion', label: '结尾情绪', type: 'select', options: ['和解温馨', '爽感解气', '幽默一笑'] },
  ],
  'yj-320-export-factory-owner': [
    { id: 'factory_info', label: '工厂信息（产地/产线/产能，须真实）', type: 'textarea', wide: true },
    { id: 'workshop_scene', label: '车间场景', type: 'select', options: ['生产线', '质检区', '仓库', '样品间', '打包发货区'] },
    { id: 'owner_persona', label: '主理人人设', type: 'text' },
    { id: 'proof_action', label: '背书动作', type: 'select', options: ['展示样品与做工', '介绍生产流程', '仓库发货实况'] },
    { id: 'worker_face', label: '工人出镜', type: 'select', options: ['工人不正脸出镜（推荐）', '不出现工人'] },
  ],
  'yj-320-extreme-conflict': [
    { id: 'conflict_kind', label: '冲突形式', type: 'select', options: ['打翻/洒出', '挤爆/碎裂', '卡住/失灵', '突发状况'] },
    { id: 'pain_expose', label: '痛点暴露方式', type: 'text' },
    { id: 'product_rescue', label: '产品介入方式', type: 'text' },
    { id: 'intensity', label: '冲突强度', type: 'select', options: ['强烈但物理合理（推荐）', '极度夸张'] },
    { id: 'ending', label: '收尾', type: 'select', options: ['秩序恢复', '结果释放', '产品定格'] },
  ],
  'yj-320-fashion-beat-change': [
    { id: 'outfit_count', label: '变装套数', type: 'number' },
    { id: 'beat_style', label: '卡点节奏', type: 'select', options: ['强鼓点快切（推荐）', '渐进式', '自动适配音乐'] },
    { id: 'change_focus', label: '变装重点', type: 'select', options: ['同款换色', '多款轮换', '混搭组合'] },
    { id: 'pose_lock', label: '机位锁定', type: 'select', options: ['中轴线+背景参照物固定（推荐）', '允许轻微移动'] },
    { id: 'voice_confirm', label: '口播与文字', type: 'select', options: ['无口播无文字（推荐）', '加简短口播'] },
  ],
  'yj-320-fashion-store-presenter': [
    { id: 'host_gender', label: '主播性别', type: 'select', options: ['女', '男'] },
    { id: 'store_element', label: '陈列元素', type: 'select', options: ['衣架成排', '模特架', '货架叠放', '试衣间旁'] },
    { id: 'pan_direction', label: '摇摄方向', type: 'select', options: ['人物→衣架（推荐）', '衣架→人物'] },
    { id: 'outfit_note', label: '服装类型与展示重点', type: 'text' },
    { id: 'closing', label: '收尾', type: 'select', options: ['回到人物收尾', '服装特写定格'] },
  ],
  'yj-320-fashion-street-interview': [
    { id: 'interview_question', label: '采访问题', type: 'text', placeholder: '例：这身穿搭穿着舒服吗' },
    { id: 'passerby_type', label: '受访者类型', type: 'text', placeholder: '例：25-35 岁通勤女生' },
    { id: 'street_style', label: '街景', type: 'select', options: ['商圈街头（推荐）', '园区/写字楼', '校园', '公园'] },
    { id: 'interview_form', label: '采访形式', type: 'select', options: ['第一人称采访', '朋友跟拍'] },
    { id: 'fabric_action', label: '面料动作', type: 'select', options: ['拉扯展示弹性', '抚摸展示质感', '翻看领口细节'] },
  ],
  'yj-320-female-fashion-blogger': [
    { id: 'blogger_persona', label: '博主人设', type: 'text', placeholder: '例：温柔知性通勤风' },
    { id: 'outfit_pain', label: '穿搭痛点 Hook', type: 'text', placeholder: '例：显瘦又不敢皱的通勤裙' },
    { id: 'closeup_focus', label: '特写重点', type: 'select', options: ['面料质感', '腰线剪裁', '整体廓形', '配件搭配'] },
    { id: 'body_note', label: '身材/展示重点（保持尊重）', type: 'text' },
    { id: 'sync_note', label: '口播与动作', type: 'select', options: ['口播与动作同步（推荐）', '纯展示无口播'] },
  ],
  'yj-320-garment-product-only': [
    { id: 'display_way', label: '展示方式', type: 'select', options: ['平铺桌面', '悬挂衣架', '手持展开'] },
    { id: 'hand_action', label: '手部动作', type: 'select', options: ['指尖拉扯面料', '轻抚纹理', '翻领口/袖口'] },
    { id: 'macro_part', label: '微距特写部位', type: 'text', placeholder: '例：针织纹理与走线' },
    { id: 'appear_range', label: '出镜范围', type: 'select', options: ['仅手部（推荐）', '手部+前臂'] },
    { id: 'no_logo_confirm', label: '图案与标签', type: 'select', options: ['只保留产品图真实存在的图案（推荐）', '无特殊要求'] },
  ],
  'yj-320-grid-storyboard-6': [
    { id: 'grid_layout', label: '布局', type: 'select', options: ['2x3（推荐）', '3x2'] },
    { id: 'shot_style', label: '镜头风格', type: 'select', options: ['自拍视角', 'POV 第一视角', '第三人称'] },
    { id: 'cell_themes', label: '每格主题（6 格，每行一个，留空按默认骨架）', type: 'textarea', wide: true },
    { id: 'consist_lock', label: '一致性', type: 'select', options: ['同一人物+服装+背景（推荐）', '按需调整'] },
    { id: 'thumb_real', label: '缩略图质感', type: 'select', options: ['真实手机截图感（推荐）', '插画感'] },
  ],
  'yj-320-grid-storyboard-9': [
    { id: 'shot_style', label: '镜头风格', type: 'select', options: ['自拍视角', 'POV 第一视角', '第三人称'] },
    { id: 'cell_themes', label: '九格主题（每行一个，留空按默认叙事）', type: 'textarea', wide: true },
    { id: 'consist_lock', label: '一致性', type: 'select', options: ['同一人物+同一服装+同一产品（推荐）', '按需调整'] },
    { id: 'text_free', label: '格内文字', type: 'select', options: ['缩略图内无文字（推荐）', '允许少量文字'] },
    { id: 'thumb_real', label: '缩略图质感', type: 'select', options: ['真实手机截图感（推荐）', '插画感'] },
  ],
  'yj-320-gym-one-shot': [
    { id: 'gym_area', label: '健身房背景', type: 'select', options: ['器械区（虚化）', '跑步机区', '自由训练区', '操房'] },
    { id: 'fixed_spot', label: '定点位置', type: 'text', placeholder: '例：器械区哑铃架前' },
    { id: 'show_action', label: '展示动作', type: 'select', options: ['双手持握展示', '单手举起', '递近镜头'] },
    { id: 'word_limit', label: '口播词数', type: 'select', options: ['短句（15 字内，推荐）', '一句话', '无口播'] },
    { id: 'outfit_note', label: '着装/形象要求', type: 'text' },
  ],
  'yj-320-high-contrast-soft-sell': [
    { id: 'info_gap', label: '信息差点（可验证）', type: 'text', placeholder: '例：多数人不知道的正确用法' },
    { id: 'suspense_open', label: '悬念开场事件', type: 'text' },
    { id: 'soft_way', label: '植入方式', type: 'select', options: ['无声对比', '克制口播点一句', '产品自然入画'] },
    { id: 'hard_sell_ban', label: '强推销元素', type: 'select', options: ['不出现价格/链接/购物车（推荐）', '允许口播提及渠道'] },
    { id: 'ending_tone', label: '收尾', type: 'select', options: ['克制留白', '轻推荐'] },
  ],
  'yj-320-host-product-showcase': [
    { id: 'host_persona', label: '主播人设', type: 'text', placeholder: '例：当地 30 岁亲和男主播' },
    { id: 'hook_emotion', label: '开场情绪', type: 'select', options: ['惊喜', '怀疑后惊叹', '兴奋安利', '沉稳专业'] },
    { id: 'one_feature', label: '只演示的一个核心功能', type: 'text' },
    { id: 'first_frame', label: '首帧 Prompt', type: 'select', options: ['同时交付首帧 Prompt（推荐）', '只要视频 Prompt'] },
    { id: 'hand_detail', label: '材质/结构动作', type: 'select', options: ['手指抚过表面', '翻转展示细节', '按压/开合演示'] },
  ],
  'yj-320-image2-storyboard': [
    { id: 'core_pain', label: '核心痛点（旧方法为什么失败）', type: 'textarea', required: true, wide: true },
    { id: 'rescue_person', label: '救场人物设定', type: 'text' },
    { id: 'product_join', label: '产品接入方式', type: 'text' },
    { id: 'payoff', label: '最强可见结果/爽点', type: 'text' },
    { id: 'verify_scenes', label: '多场景验证数量', type: 'number' },
    { id: 'cover_frame', label: '封面镜（第 5 镜）', type: 'select', options: ['单独可作封面（推荐）', '无特殊要求'] },
  ],
  'yj-320-live-clip': [
    { id: 'live_stage', label: '直播环节', type: 'select', options: ['讲品高光', '试吃/试用', '答疑互动', '上链接前逼单'] },
    { id: 'host_emotion', label: '主播状态', type: 'select', options: ['高能亢奋', '专业讲解', '亲切唠嗑'] },
    { id: 'asmr_focus', label: '声音重点', type: 'select', options: ['产品声音（撕开/按键/倒出）', '现场氛围声', '无特殊要求'] },
    { id: 'ui_confirm', label: '弹幕/直播 UI', type: 'select', options: ['后期添加（推荐）', '不出现'] },
    { id: 'open_style', label: '开场', type: 'select', options: ['直接进入实操（推荐）', '完整广告开场'] },
  ],
  'yj-320-male-fashion-blogger': [
    { id: 'blogger_persona', label: '博主人设', type: 'select', options: ['兄弟式分享', '精致型男', '街头潮流', '商务精英'] },
    { id: 'closeup_focus', label: '特写重点', type: 'select', options: ['领口', '袖口', '面料纹理', '整体廓形'] },
    { id: 'body_type', label: '体型描述（贴合目标用户）', type: 'text' },
    { id: 'ending_pose', label: '结尾姿势', type: 'text', placeholder: '例：双手插兜靠墙' },
    { id: 'pattern_lock', label: '图案与文字', type: 'select', options: ['与产品图完全一致不变化（推荐）', '无特殊要求'] },
  ],
  'yj-320-male-fashion-first-frame': [
    { id: 'shoot_way', label: '拍摄方式', type: 'select', options: ['镜面自拍', '固定机位', '朋友帮拍'] },
    { id: 'fitting_scene', label: '试衣场景', type: 'select', options: ['卧室', '玄关', '衣柜前', '酒店房间'] },
    { id: 'pose_count', label: '姿势变体数（2-4）', type: 'number' },
    { id: 'outfit_lock', label: '服装锁定（图案/颜色/版型须一致）', type: 'textarea', wide: true },
    { id: 'deliver', label: '交付物', type: 'select', options: ['仅首帧图提示词（推荐）', '首帧+视频提示词'] },
  ],
  'yj-320-multi-use-scenes': [
    { id: 'scene_count', label: '场景数量', type: 'select', options: ['2 个', '3 个（推荐）', '4 个'] },
    { id: 'scene_list', label: '场景清单（每行一个用途）', type: 'textarea', wide: true },
    { id: 'scene_action', label: '每个场景的核心动作说明', type: 'text' },
    { id: 'hook_open', label: '开场 Hook 方向', type: 'text' },
    { id: 'product_lock', label: '产品一致性', type: 'select', options: ['全程同一产品不变化（推荐）', '按需调整'] },
  ],
  'yj-320-pain-first-five-shot': [
    { id: 'pain_scene', label: '痛点场景描述', type: 'textarea', wide: true },
    { id: 'detail_shot', label: '第三镜头细节重点', type: 'select', options: ['材质', '核心功能', '做工'] },
    { id: 'daily_verify', label: '第四镜头日常验证场景', type: 'text' },
    { id: 'cta_note', label: '结果与 CTA 内容', type: 'text' },
    { id: 'structure_confirm', label: '结构确认', type: 'select', options: ['标准五镜头结构（推荐）', '允许微调'] },
  ],
  'yj-320-pain-unbox-review': [
    { id: 'pain_fail', label: '痛点/翻车场景', type: 'textarea', wide: true },
    { id: 'unbox_way', label: '拆箱方式', type: 'select', options: ['撕开塑封', '划开纸箱', '掀开盒盖'] },
    { id: 'core_test', label: '核心功能测试项', type: 'text' },
    { id: 'hand_lock', label: '手部特征', type: 'select', options: ['与人设一致（推荐）', '无特殊要求'] },
    { id: 'result_show', label: '结果呈现', type: 'select', options: ['可观察的满意结果（推荐）', '对比收尾'] },
  ],
  'yj-320-palace-drama': [
    { id: 'palace_conflict', label: '宫斗桥段', type: 'select', options: ['争宠吃醋', '下毒/试探', '宫女逆袭', '娘娘斗法'] },
    { id: 'product_role', label: '产品接入', type: 'select', options: ['作为贡品/奇物', '化解危机的关键', '打脸反转的底气'] },
    { id: 'twist_way', label: '反转方式', type: 'text' },
    { id: 'ancient_end', label: '收尾', type: 'select', options: ['古风语境收尾（推荐）', '反差现代梗收尾'] },
    { id: 'market_lang_note', label: '目标国家与语言（古装不等于默认中文）', type: 'text' },
  ],
  'yj-320-professional-storyboard': [
    { id: 'shot_count', label: '镜头数量', type: 'number' },
    { id: 'color_theme', label: '看板配色', type: 'select', options: ['黑金', '深色科技', '浅色简洁', '按指定颜色'] },
    { id: 'board_ratio', label: '看板比例', type: 'select', options: ['16:9（推荐）', '9:16', '1:1'] },
    { id: 'rhythm_note', label: '底部节奏说明要求', type: 'text' },
    { id: 'watermark', label: '水印', type: 'select', options: ['不加水印（推荐）', '按需添加'] },
  ],
  'yj-320-retail-discovery': [
    { id: 'shelf_type', label: '货架类型', type: 'select', options: ['超市货架', '便利店冷柜', '药妆店开架', '品牌专柜'] },
    { id: 'grab_action', label: '拿取动作', type: 'select', options: ['单手拿取（推荐）', '双手捧起'] },
    { id: 'shelf_env', label: '周边陈列', type: 'select', options: ['同类产品整齐陈列', '混排货架'] },
    { id: 'two_step', label: '两步生成', type: 'select', options: ['先生成首帧，再生成拿取（推荐）', '一次生成'] },
    { id: 'hand_scope', label: '手部动作数', type: 'select', options: ['只做一个拿取动作（推荐）', '拿取+检查'] },
  ],
  'yj-320-retail-shelf': [
    { id: 'display_env', label: '陈列环境', type: 'select', options: ['商超货架', '服装衣架', '品牌专柜', '卖场堆头'] },
    { id: 'push_in', label: '镜头推进', type: 'select', options: ['缓慢推进（推荐）', '横摇', '手持走近'] },
    { id: 'check_action', label: '细节检查动作', type: 'text', placeholder: '例：翻看背面说明文字' },
    { id: 'first_form', label: '视角', type: 'select', options: ['第一人称', '朋友跟拍'] },
    { id: 'price_ban', label: '价格牌', type: 'select', options: ['不生成虚构价格牌（推荐）', '无特殊要求'] },
  ],
  'yj-320-store-reviewer': [
    { id: 'store_desc', label: '门店信息（类型/环境/特色，据实描述）', type: 'textarea', wide: true },
    { id: 'store_type', label: '门店类型', type: 'select', options: ['餐饮', '咖啡/茶饮', '美容/理发', '零售买手店'] },
    { id: 'signature', label: '招牌菜品/特色服务', type: 'text' },
    { id: 'route_note', label: '探店动线', type: 'text', placeholder: '例：门头→吧台→落座→上菜' },
    { id: 'conclusion', label: '结论方向', type: 'select', options: ['主观真实推荐', '克制中性评价'] },
  ],
  'yj-320-storyboard-8s': [
    { id: 'four_beats', label: '四段内容（Hook/痛点特写/可见结果/收尾）', type: 'textarea', wide: true },
    { id: 'time_split', label: '时长分配', type: 'select', options: ['平均分配', 'Hook 加权（推荐）'] },
    { id: 'hook_kind', label: 'Hook 类型', type: 'text' },
    { id: 'ui_note', label: '看板 UI', type: 'select', options: ['UI 与缩略图分离（推荐）', '无特殊要求'] },
    { id: 'sell_ban', label: '价格与话术', type: 'select', options: ['不自动加价格和抢购话术（推荐）', '按需加入'] },
  ],
  'yj-320-street-interview': [
    { id: 'questions', label: '采访问题（每行一个）', type: 'textarea', required: true, wide: true },
    { id: 'passerby_type', label: '受访者类型与数量', type: 'text' },
    { id: 'street_scene', label: '街景环境', type: 'select', options: ['商圈街头', '园区/写字楼', '校园', '夜市'] },
    { id: 'react_style', label: '反应风格', type: 'select', options: ['真实自然（推荐）', '幽默搞笑', '惊讶反差'] },
    { id: 'shoot_form', label: '拍摄形式', type: 'select', options: ['第一人称采访', '第三人称跟拍'] },
  ],
  'yj-320-struggling-creator': [
    { id: 'setback', label: '受挫情境（真实不卖惨）', type: 'textarea', wide: true },
    { id: 'make_process', label: '制作过程重点', type: 'text' },
    { id: 'emotion_tone', label: '情绪基调', type: 'select', options: ['克制真实（推荐）', '内敛压抑转释然'] },
    { id: 'turn_point', label: '反转触发点', type: 'text' },
    { id: 'ending_show', label: '结尾', type: 'select', options: ['自信使用/展示成品', '成品特写定格'] },
  ],
  'yj-320-supermarket-rush': [
    { id: 'store_type', label: '卖场类型', type: 'select', options: ['大型超市', '折扣店', '社区生鲜店', '大卖场'] },
    { id: 'crowd_level', label: '人流强度', type: 'select', options: ['热烈但安全（推荐）', '适度人流'] },
    { id: 'discount_fact', label: '折扣/库存事实（须有依据）', type: 'text' },
    { id: 'grab_action', label: '创作者取得产品的方式', type: 'text' },
    { id: 'ending', label: '收尾', type: 'select', options: ['稳定双手展示', '真实库存观察', '自然结论'] },
  ],
  'yj-320-testimonial': [
    { id: 'user_persona', label: '使用者人设', type: 'text' },
    { id: 'try_reason', label: '为什么尝试', type: 'text' },
    { id: 'use_period', label: '真实使用时长（不虚构）', type: 'text', placeholder: '例：用了两周' },
    { id: 'feel_focus', label: '感受重点', type: 'select', options: ['主观体验', '对比变化', '性价比'] },
    { id: 'recommend_level', label: '推荐强度', type: 'select', options: ['克制推荐（推荐）', '明确安利'] },
  ],
  'yj-320-tutorial-howto': [
    { id: 'tutorial_topic', label: '教程主题', type: 'text', required: true },
    { id: 'step_count', label: '步骤数量', type: 'select', options: ['2 步', '3 步（推荐）', '4 步'] },
    { id: 'wrong_way', label: '错误方法对比', type: 'select', options: ['先错误示范再纠正（推荐）', '直接正确教学'] },
    { id: 'pov_form', label: '拍摄形式', type: 'select', options: ['第一视角 POV', '桌面俯拍'] },
    { id: 'step_result', label: '步骤结果', type: 'select', options: ['每步有可见动作结果（推荐）', '无特殊要求'] },
  ],
  'yj-320-unboxing-review': [
    { id: 'package_form', label: '包裹形态', type: 'select', options: ['快递纸箱', '礼盒', '袋装', '气泡膜包裹'] },
    { id: 'first_impress', label: '第一印象重点', type: 'text' },
    { id: 'core_test', label: '核心测试项（只测一个）', type: 'text' },
    { id: 'asmr_focus', label: 'ASMR 重点', type: 'select', options: ['撕开/划开声', '开合/按键声', '无特殊要求'] },
    { id: 'conclusion', label: '结论口径', type: 'select', options: ['基于已知信息，不虚构长期效果（推荐）', '无特殊要求'] },
  ],
  'yj-320-warehouse-one-take': [
    { id: 'warehouse_env', label: '仓储环境', type: 'select', options: ['高位货架', '托盘堆放', '堆头陈列', '会员店大仓'] },
    { id: 'push_path', label: '镜头推进路径', type: 'text', placeholder: '例：从通道口缓推进到托盘特写' },
    { id: 'take_product', label: '是否拿取', type: 'select', options: ['不拿取，纯观察（推荐）', '拿取近景展示'] },
    { id: 'voice_note', label: '口播', type: 'select', options: ['现场观察式描述（推荐）', '无口播'] },
    { id: 'price_ban', label: '价格与链接', type: 'select', options: ['不提及未经证实的价格/链接（推荐）', '无特殊要求'] },
  ],
  'yj-320-warehouse-owner': [
    { id: 'owner_persona', label: '主理人人设', type: 'text' },
    { id: 'warehouse_bg', label: '仓库背景', type: 'select', options: ['货架通道', '打包工作台', '发货堆头', '办公室窗口'] },
    { id: 'source_point', label: '来源介绍重点', type: 'select', options: ['供应链实力', '仓储与发货', '选品标准'] },
    { id: 'detail_action', label: '细节/测试动作', type: 'select', options: ['开箱验货', '上秤/量尺', '打包演示'] },
    { id: 'cta_note', label: '结尾 CTA 内容', type: 'text' },
  ],
  'yj-320-product-seo-support': [
    { id: 'target_user', label: '目标用户', type: 'text' },
    { id: 'core_keywords', label: '核心关键词（每行一个）', type: 'textarea', wide: true },
    { id: 'title_count', label: '标题方向数量', type: 'select', options: ['3 个（推荐）', '5 个'] },
    { id: 'hashtag_count', label: 'Hashtag/标签数量', type: 'number' },
    { id: 'locale_words', label: '本地化词汇/市场习惯用语', type: 'text' },
    { id: 'data_source', label: '数据口径', type: 'select', options: ['语义建议（无实时数据时，推荐）', '有实时搜索数据'] },
  ],
  'yj-301-original-ugc': [
    { id: 'hook_style', label: '开场 Hook', type: 'select', options: ['痛点直击', '悬念提问', '效果前置', '场景代入'] },
    { id: 'broll_count', label: 'B-roll 镜头数（默认 6）', type: 'number' },
    { id: 'host_persona', label: '口播人设', type: 'text' },
    { id: 'subtitle_note', label: '字幕', type: 'select', options: ['烧录字幕', '无字幕'] },
    { id: 'cut_note', label: '剪辑节奏', type: 'select', options: ['快剪（3-5 秒/镜，推荐）', '常规节奏'] },
  ],
  'yj-302-ugc-2': [
    { id: 'shot_count', label: '分镜数量', type: 'number' },
    { id: 'lock_focus', label: '连续性锁定重点', type: 'select', options: ['人物+背景+产品+声音全部锁定（推荐）', '重点锁产品', '重点锁人物'] },
    { id: 'dialogue_style', label: '对白风格', type: 'select', options: ['口语化自然', '闺蜜/兄弟安利', '专业讲解'] },
    { id: 'hook_type', label: '开场钩子', type: 'select', options: ['痛点', '悬念', '效果展示', '提问互动'] },
    { id: 'continuity_check', label: '分镜衔接', type: 'select', options: ['逐镜校验连续性（推荐）', '快速出稿'] },
  ],
  'original-ugc-ai-video': [
    { id: 'host_setting', label: '出镜人物设定', type: 'text', placeholder: '例：30 岁居家妈妈，亲和口语' },
    { id: 'realism_detail', label: '真实感细节', type: 'select', options: ['手持轻微晃动+环境音（推荐）', '稳定画面', '生活杂音保留'] },
    { id: 'conversion_hook', label: '转化钩子（促下单的一句话）', type: 'text' },
    { id: 'comment_guide', label: '评论区引导语', type: 'text' },
    { id: 'suit_products', label: '产品与使用场景补充', type: 'text' },
  ],
  'skill-test-36-gaofancha-ugc-shenzhuanzhe': [
    { id: 'low_open', label: '压低预期的开场（自嘲/踩坑/平价感）', type: 'textarea', wide: true },
    { id: 'turn_point', label: '转折触发点', type: 'text' },
    { id: 'contrast_show', label: '反差呈现', type: 'select', options: ['画面质感跳变', '效果前后对比', '情绪反转'] },
    { id: 'emotion_tone', label: '情绪基调', type: 'select', options: ['先丧后燃（推荐）', '幽默自嘲', '真诚坦白'] },
  ],
  'yunjing-video-replication-cloud': [
    { id: 'route', label: '复刻路线', type: 'select', options: ['STANDARD 标准路线（推荐）', 'FAST 快速路线'] },
    { id: 'replace_boundary', label: '替换边界', type: 'select', options: ['只换产品', '换产品+人物', '换产品+背景', '全部替换（保留结构）'] },
    { id: 'keep_elements', label: '必须保留的原片元素', type: 'textarea', wide: true },
    { id: 'replace_assets', label: '替换素材（新产品/新人物参考图）', type: 'images' },
    { id: 'lock_note', label: '替换后需复核的动作/物理逻辑', type: 'text' },
  ],
  'skill-test-41-baokuan-1bi1-duibiao-fuke': [
    { id: 'benchmark_video', label: '对标爆款视频', type: 'video', required: true },
    { id: 'keep_focus', label: '复刻重点', type: 'select', options: ['镜头逻辑与节奏（推荐）', '文案结构', '情绪曲线', '全部结构'] },
    { id: 'replace_content', label: '替换为自有产品/人物/场景的内容', type: 'textarea', wide: true },
    { id: 'originality', label: '原创边界', type: 'select', options: ['只复刻结构不照搬内容（推荐）', '尽量贴近原片'] },
    { id: 'shot_note', label: '镜头数/时长对齐要求', type: 'text' },
  ],
  'yj-402-white-background-main': [
    { id: 'shoot_angle', label: '拍摄角度', type: 'select', options: ['正面 45°（推荐）', '正面平视', '俯拍', '按参考图'] },
    { id: 'bg_require', label: '背景', type: 'select', options: ['纯白背景（推荐）', '浅灰渐变'] },
    { id: 'shadow_note', label: '投影/倒影', type: 'select', options: ['自然柔和投影', '无投影'] },
    { id: 'spec_note', label: '主图规范要求', type: 'text', placeholder: '例：平台主图第 1 张规范' },
  ],
  'yj-402-benefits-infographic': [
    { id: 'point_count', label: '卖点条数（3-5 条）', type: 'select', options: ['3 条', '4 条（推荐）', '5 条'] },
    { id: 'layout_style', label: '版式', type: 'select', options: ['图标+短句（推荐）', '编号列表', '分区卡片'] },
    { id: 'icon_style', label: '图标风格', type: 'select', options: ['线性简约', '立体拟物', '手绘'] },
    { id: 'text_note', label: '图内文案（逐条，留空则按已验证资料生成）', type: 'textarea', wide: true },
  ],
  'yj-402-multi-angle-showcase': [
    { id: 'angles', label: '视角组合', type: 'select', options: ['正+侧+背（推荐）', '正+侧+背+顶', '正+细节特写'] },
    { id: 'angle_count', label: '出图张数', type: 'number' },
    { id: 'layout_way', label: '排布', type: 'select', options: ['每视角一张（推荐）', '组合拼图'] },
    { id: 'angle_evidence', label: '各视角依据（来自参考图的部分）', type: 'text' },
  ],
  'yj-402-lifestyle-scene': [
    { id: 'scene_type', label: '场景类型', type: 'select', options: ['居家', '办公室', '户外', '通勤', '咖啡厅', '按指定'] },
    { id: 'mood', label: '氛围', type: 'select', options: ['自然日光（推荐）', '温馨暖光', '清冷高级'] },
    { id: 'user_model', label: '是否出现人物', type: 'select', options: ['出现使用中的手部/人物', '纯产品置景'] },
    { id: 'scene_desc', label: '场景补充描述', type: 'text' },
  ],
  'yj-402-packaging-detail': [
    { id: 'macro_focus', label: '特写部位', type: 'text', placeholder: '例：瓶身磨砂质感与烫金 Logo' },
    { id: 'macro_scale', label: '特写倍率', type: 'select', options: ['微距（推荐）', '近距'] },
    { id: 'anchor_show', label: '完整商品锚点', type: 'select', options: ['画面一角保留完整商品（推荐）', '纯特写'] },
    { id: 'light_style', label: '光线', type: 'select', options: ['侧光强调纹理（推荐）', '柔光'] },
  ],
  'yj-402-components-structure': [
    { id: 'component_list', label: '随附组件清单（已确认，每行一个）', type: 'textarea', wide: true },
    { id: 'structure_focus', label: '结构重点', type: 'select', options: ['瓶体/开合结构（已确认）', '内部构造', '配件组合'] },
    { id: 'layout_style', label: '排布', type: 'select', options: ['平铺展开（推荐）', '层叠标注', '爆炸图'] },
    { id: 'label_note', label: '组件标注', type: 'select', options: ['简短文字标注', '无标注'] },
  ],
  'yj-402-wide-hero-banner': [
    { id: 'banner_ratio', label: '横幅比例', type: 'select', options: ['16:9（推荐）', '3:1', '2:1'] },
    { id: 'product_pos', label: '产品位置', type: 'select', options: ['左侧（推荐）', '右侧', '居中'] },
    { id: 'headline_text', label: '主文案（已验证）', type: 'text' },
    { id: 'whitespace', label: '留白', type: 'select', options: ['大面积留白高质感（推荐）', '紧凑'] },
    { id: 'bg_tone', label: '背景色调', type: 'select', options: ['品牌色（按参考）', '纯色', '渐变'] },
  ],
  'yj-402-routine-context': [
    { id: 'scene_count', label: '视觉区域数量', type: 'select', options: ['2 个', '3 个（推荐）'] },
    { id: 'routine_list', label: '日常使用情境（按时间顺序，每行一个）', type: 'textarea', wide: true },
    { id: 'panel_style', label: '面板样式', type: 'select', options: ['分区拼接（推荐）', '独立三联'] },
    { id: 'tone_note', label: '表达口径', type: 'select', options: ['中性事实型（推荐）', '生活感'] },
  ],
  'yj-402-feature-matrix': [
    { id: 'item_count', label: '特征条数（3-5 项）', type: 'select', options: ['3 项', '4 项（推荐）', '5 项'] },
    { id: 'matrix_layout', label: '矩阵样式', type: 'select', options: ['四宫格卡片（推荐）', '双列对照', '横向扫描条'] },
    { id: 'icon_use', label: '图标', type: 'select', options: ['每项配图标（推荐）', '纯文字'] },
    { id: 'balance_note', label: '视觉平衡', type: 'select', options: ['等权重平衡布局（推荐）', '突出首项'] },
  ],
  'yj-402-materials-story': [
    { id: 'material_subject', label: '成分/材质主体', type: 'text', placeholder: '例：烟酰胺/头层牛皮' },
    { id: 'story_angle', label: '故事角度', type: 'select', options: ['来源与提取', '质地与肤感', '工艺与耐用'] },
    { id: 'visual_style', label: '视觉风格', type: 'select', options: ['微距质感（推荐）', '实验室感', '自然原料'] },
    { id: 'fact_note', label: '已验证的材质事实（逐条）', type: 'textarea', wide: true },
  ],
  'yj-402-attribute-guide': [
    { id: 'attr_scope', label: '已验证属性范围（尺寸/材质/规格等）', type: 'textarea', wide: true },
    { id: 'variant_note', label: '已确认变体（颜色/容量）', type: 'text' },
    { id: 'no_compare', label: '竞品比较', type: 'select', options: ['不引入竞品与优越性暗示（推荐）', '无特殊要求'] },
    { id: 'layout_style', label: '版式', type: 'select', options: ['属性表格', '图标清单', '分区卡片'] },
  ],
  'yj-402-how-to-use': [
    { id: 'step_list', label: '使用步骤（每行一步，2-4 步）', type: 'textarea', required: true, wide: true },
    { id: 'step_count', label: '步骤数量', type: 'select', options: ['2 步', '3 步（推荐）', '4 步'] },
    { id: 'action_focus', label: '每步动作重点', type: 'select', options: ['用量', '手法', '时长', '顺序'] },
    { id: 'visual_form', label: '呈现', type: 'select', options: ['分步编号图（推荐）', '连续动作序列'] },
  ],
  'yj-402-brand-closing-banner': [
    { id: 'brand_facts', label: '已验证品牌事实（每行一条）', type: 'textarea', wide: true },
    { id: 'brand_visual', label: '品牌主视觉/Logo 参考', type: 'images' },
    { id: 'banner_ratio', label: '横幅比例', type: 'select', options: ['16:9（推荐）', '3:1'] },
    { id: 'slogan_text', label: '收尾口号/品牌语', type: 'text' },
    { id: 'tone', label: '基调', type: 'select', options: ['质感克制（推荐）', '温暖', '专业'] },
  ],
  'yj-101-brand-dna': [
    { id: 'archive_mode', label: '建档模式', type: 'select', options: ['完整建档（DNA+Voice+ICP）', '快速建档（先够用）', '单模块补全'] },
    { id: 'industry', label: '行业/品类', type: 'text' },
    { id: 'materials', label: '已有品牌资料（介绍/页面/指南/评论要点）', type: 'textarea', wide: true },
    { id: 'must_claims', label: '必须出现的声明（每行一条）', type: 'textarea', wide: true },
    { id: 'banned_claims', label: '禁用 claims（每行一条）', type: 'textarea', wide: true },
    { id: 'evidence_rule', label: '证据分级', type: 'select', options: ['已证实/待证据/禁用 三级标注（推荐）', '不分级'] },
  ],
  'yj-102-brand-voice': [
    { id: 'tone_base', label: '语气基调', type: 'select', options: ['亲切自然', '专业权威', '幽默轻松', '高级克制', '热血激励'] },
    { id: 'sentence_rhythm', label: '句式节奏', type: 'select', options: ['短句为主（推荐）', '长短结合', '口语化长句'] },
    { id: 'person_form', label: '人称', type: 'select', options: ['第一人称「我们」', '与用户对话「你」', '第三人称'] },
    { id: 'must_words', label: '必用词/口头禅（每行一个）', type: 'textarea', wide: true },
    { id: 'banned_words', label: '禁用词（每行一个）', type: 'textarea', wide: true },
    { id: 'sample_copy', label: '代表性文案样本（供校准语气）', type: 'textarea', wide: true },
  ],
  'yj-103-icp-persona': [
    { id: 'persona_count', label: 'Persona 数量（1-3）', type: 'select', options: ['1 个（推荐）', '2 个', '3 个'] },
    { id: 'life_stage', label: '生活阶段/身份场景', type: 'text' },
    { id: 'core_pain', label: '核心痛点（每行一条）', type: 'textarea', wide: true },
    { id: 'buy_trigger', label: '购买触发点', type: 'text' },
    { id: 'objection', label: '主要异议', type: 'text', placeholder: '例：价格贵/没听过牌子' },
    { id: 'price_mind', label: '价格心理', type: 'select', options: ['性价比敏感', '品质优先', '冲动型', '纠结观望'] },
    { id: 'voc_source', label: '真实客户原话来源（如有）', type: 'text' },
  ],
  'yj-201-voc-audit': [
    { id: 'voc_material', label: '评论/客服/访谈原话（粘贴，每行一条）', type: 'textarea', required: true, wide: true },
    { id: 'material_source', label: '材料来源', type: 'select', options: ['电商评论', '客服记录', '问卷', '访谈笔记', '社交媒体'] },
    { id: 'quote_permission', label: '逐字引用权限', type: 'select', options: ['允许逐字用于广告', '仅抽象洞察', '未知（默认不逐字）'] },
    { id: 'insight_focus', label: '洞察重点', type: 'select', options: ['痛点', '购买动机', '异议', '广告语言素材', '全部'] },
    { id: 'trace_note', label: '可追溯性', type: 'select', options: ['每条洞察回链来源编号（推荐）', '汇总即可'] },
  ],
  'yj-202-hook-engine': [
    { id: 'hook_count', label: 'Hook 数量', type: 'select', options: ['6 个', '9 个', '12 个'] },
    { id: 'funnel_stage', label: '漏斗阶段', type: 'select', options: ['TOF 拉新', 'MOF 培养', 'BOF 转化', '不确定（全阶段）'] },
    { id: 'hook_mechanism', label: '偏好机制', type: 'select', options: ['痛点共鸣', '反常识', '效果前置', '提问互动', '社交证明'] },
    { id: 'top_select', label: 'Top 筛选', type: 'select', options: ['选出 Top 3（推荐）', '全部平铺'] },
    { id: 'cta_type', label: '结尾 CTA', type: 'select', options: ['引导点击', '引导评论', '引导关注', '无 CTA'] },
  ],
  'yj-203-creative-brief': [
    { id: 'test_mode', label: '测试模式', type: 'select', options: ['受控迭代（推荐）', '单变量测试', '新概念探索'] },
    { id: 'single_variable', label: '本轮唯一测试变量', type: 'text' },
    { id: 'format_count', label: '期望格式与数量', type: 'text', placeholder: '例：9:16 视频 3 条' },
    { id: 'must_keep', label: '必须保留元素（每行一条）', type: 'textarea', wide: true },
    { id: 'success_metric', label: '验收指标', type: 'text', placeholder: '例：CTR 高于基线 20%' },
    { id: 'funnel_stage', label: '漏斗阶段', type: 'select', options: ['TOF', 'MOF', 'BOF'] },
  ],
  'yj-204-creative-research': [
    { id: 'ref_material', label: '对标广告描述/字幕/链接要点（不复制成品）', type: 'textarea', required: true, wide: true },
    { id: 'ref_ad_images', label: '对标广告截图/关键帧', type: 'images' },
    { id: 'dna_focus', label: '拆解重点', type: 'select', options: ['注意力入口', '说服路径', '制作语法', '全部维度'] },
    { id: 'variant_count', label: '原创变体数量', type: 'select', options: ['3 个（默认）', '5 个'] },
    { id: 'originality_gap', label: '原创距离', type: 'select', options: ['高（换情境+换证明，推荐）', '中（保留机制换表达）'] },
    { id: 'test_variable', label: '本轮测试变量', type: 'select', options: ['Hook', 'Angle 角度', 'Proof 证明', 'Format 形式'] },
  ],
  'yj-501-meta-ads-audit': [
    { id: 'conversion_event', label: '核心转化事件', type: 'select', options: ['Purchase', 'Lead', 'Complete Registration', 'Add to Cart', '自定义'] },
    { id: 'date_range', label: '数据日期范围与币种', type: 'text', placeholder: '例：近 30 天，美元' },
    { id: 'granularity', label: '行粒度', type: 'select', options: ['ad 层', 'ad set 层', 'campaign 层', '按日期', '含 breakdown'] },
    { id: 'biz_threshold', label: '业务门槛', type: 'text', placeholder: '例：目标 CPA 上限与保本 ROAS' },
    { id: 'output_focus', label: '输出重点', type: 'select', options: ['素材分层与状态', '下一轮 Hook 建议', 'UGC 建议', '测试计划', '全部'] },
    { id: 'data_file_note', label: '数据来源说明', type: 'text', placeholder: '例：广告后台导出报表，字段随对话粘贴' },
  ],
  'skill-test-01-gongdou-daihuo-duanju': [
    { id: 'palace_plot', label: '宫斗桥段', type: 'select', options: ['争宠吃醋', '打脸反派', '逆袭上位', '下毒试探'] },
    { id: 'product_role', label: '产品接入', type: 'select', options: ['作为争宠奇物', '打脸逆袭的关键', '娘娘同款'] },
    { id: 'shot_count', label: '分镜数（默认 4）', type: 'number' },
    { id: 'twist_beat', label: '爽点/打脸节拍', type: 'text', placeholder: '例：第 3 镜反转' },
    { id: 'dynasty_note', label: '朝代/服化道风格', type: 'text' },
  ],
  'skill-test-02-cangku-laobanniang-poji': [
    { id: 'boss_persona', label: '老板娘人设', type: 'select', options: ['泼辣豪爽', '实在大姐', '精明算账'] },
    { id: 'clear_reason', label: '清仓理由', type: 'text', placeholder: '例：租约到期搬仓' },
    { id: 'price_punch', label: '破价表达', type: 'select', options: ['原价对比撕价（推荐）', '论斤/论堆甩', '亏本喊话'] },
    { id: 'store_vibe', label: '卖场氛围', type: 'select', options: ['哄抢热烈', '堆货如山', '打包发货忙'] },
  ],
  'skill-test-03-tandian-daka-zhongcao': [
    { id: 'store_desc', label: '门店与招牌品（据实描述）', type: 'textarea', wide: true },
    { id: 'tour_route', label: '探店动线', type: 'text', placeholder: '例：门头→点单→出餐→试吃' },
    { id: 'voice_style', label: '口播配音', type: 'select', options: ['口语化沉浸（推荐）', '文艺旁白', '无解说纯环境音'] },
    { id: 'no_subtitle', label: '字幕', type: 'select', options: ['无字幕（默认，推荐）', '加字幕'] },
  ],
  'skill-test-04-zhongwen-shuangju-daihuo': [
    { id: 'shuang_plot', label: '爽剧桥段', type: 'select', options: ['打脸反派', '逆袭翻身', '怒怼杠精', '身份反转'] },
    { id: 'villain_note', label: '反派/冲突设定', type: 'text' },
    { id: 'product_turn', label: '产品反转点', type: 'select', options: ['产品成为打脸底气', '效果当场碾压', '主角同款揭秘'] },
    { id: 'shot_count', label: '分镜数（默认 4）', type: 'number' },
  ],
  'skill-test-05-shenghuo-weijuchang': [
    { id: 'life_scene', label: '生活场景', type: 'select', options: ['家庭', '厨房', '办公室', '宿舍', '合租房'] },
    { id: 'conflict_note', label: '剧情冲突', type: 'select', options: ['小误会', '小摩擦', '日常翻车', '家人吐槽'] },
    { id: 'product_turn', label: '产品反转点', type: 'text' },
    { id: 'two_part_confirm', label: '两段式结构', type: 'select', options: ['冲突→反转 两段式（推荐）', '允许微调'] },
  ],
  'skill-test-06-zhalie-chongtu-lanjie': [
    { id: 'conflict_form', label: '冲突形式', type: 'select', options: ['泼洒', '碎裂', '炸开', '撞翻', '卡住爆开'] },
    { id: 'first_3s', label: '前 3 秒画面描述', type: 'text' },
    { id: 'product_turn', label: '产品反转', type: 'select', options: ['产品一秒救场', '强势替换旧物', '效果碾压'] },
    { id: 'emotion', label: '情绪基调', type: 'select', options: ['夸张搞笑', '紧张刺激', '爽感解气'] },
    { id: 'total_duration', label: '总时长', type: 'select', options: ['15 秒（推荐）', '30 秒'] },
  ],
  'skill-test-07-chaoshi-hongqiang-jianlou': [
    { id: 'rush_level', label: '哄抢强度', type: 'select', options: ['热烈（安全，推荐）', '夸张喜剧'] },
    { id: 'area_note', label: '超市区域', type: 'select', options: ['折扣专区', '日用品区', '食品区', '临期区'] },
    { id: 'pick_action', label: '抢到产品的动作', type: 'text' },
    { id: 'deal_line', label: '捡漏破价话术方向', type: 'text' },
  ],
  'skill-test-08-hongqiang-jiaqiang-bidan': [
    { id: 'rush_level', label: '疯抢强度', type: 'select', options: ['极致夸张（推荐）', '热烈真实'] },
    { id: 'scarce_line', label: '稀缺话术', type: 'text', placeholder: '例：最后 100 单' },
    { id: 'one_take_confirm', label: '一镜到底', type: 'select', options: ['一镜到底（推荐）', '允许快切'] },
    { id: 'pace_note', label: '逼单节奏', type: 'select', options: ['层层加码（推荐）', '单点暴击'] },
  ],
  'skill-test-09-maican-zhuliren-shuaimai': [
    { id: 'sad_reason', label: '卖惨理由', type: 'select', options: ['搬店清仓', '尾货积压', '工厂尾单', '门店到期清货'] },
    { id: 'owner_persona', label: '主理人人设', type: 'text' },
    { id: 'price_expr', label: '亏本幅度表达', type: 'text', placeholder: '例：原价 199 现在清仓价' },
    { id: 'tone_mix', label: '情绪配比', type: 'select', options: ['七分同情三分捡漏（推荐）', '真诚坦白', '幽默自嘲'] },
  ],
  'skill-test-10-zhenshi-kaixiang-ceping': [
    { id: 'package_form', label: '包裹形态', type: 'select', options: ['快递盒', '礼盒', '袋装'] },
    { id: 'test_items', label: '上手测试项（每行一个）', type: 'textarea', wide: true },
    { id: 'real_confirm', label: '真实感', type: 'select', options: ['保留停顿/自然语气（推荐）', '干净利落'] },
    { id: 'conclusion_note', label: '结论口径', type: 'select', options: ['只说当场可见（推荐）', '允许综合评价'] },
  ],
  'skill-test-11-yinghe-hengping-shice': [
    { id: 'compare_count', label: '对比对象数量', type: 'select', options: ['2 款同台', '3 款（推荐）', '4 款'] },
    { id: 'test_items', label: '实测项目（每行一个）', type: 'textarea', required: true, wide: true },
    { id: 'test_way', label: '实测方式', type: 'select', options: ['当场暴力测试（防水/防摔/承重）', '数据仪器对照', '长期使用对比'] },
    { id: 'trust_point', label: '打消疑虑的关键证明点', type: 'text' },
  ],
  'skill-test-12-yongqian-yonghou-fanzhuan': [
    { id: 'before_mess', label: '用前的糟糕状态', type: 'textarea', wide: true },
    { id: 'transition_trick', label: '转场创意', type: 'select', options: ['一镜到底甩镜（推荐）', '手势遮挡', '跳剪', '穿过门框'] },
    { id: 'after_show', label: '用后效果呈现', type: 'text' },
    { id: 'contrast_level', label: '反差强度', type: 'select', options: ['强烈（推荐）', '自然渐进'] },
  ],
  'skill-test-13-yiwu-duoyong-changjing': [
    { id: 'usage_count', label: '用法数量', type: 'select', options: ['3 种（推荐）', '4 种', '5 种'] },
    { id: 'usage_list', label: '用法清单（每行一个）', type: 'textarea', wide: true },
    { id: 'cut_pace', label: '快切节奏', type: 'select', options: ['1.5-2 秒/场景（推荐）', '3 秒/场景'] },
    { id: 'value_line', label: '价值感放大的关键句', type: 'text' },
  ],
  'skill-test-14-zhenren-koubei-anli': [
    { id: 'user_persona', label: '口碑视角', type: 'select', options: ['多年老用户', '回购多次', '被种草后真香', '家人推荐'] },
    { id: 'reason_note', label: '安利理由（真实使用经历）', type: 'text' },
    { id: 'trust_detail', label: '信任细节', type: 'select', options: ['旧包装/空瓶出镜（推荐）', '购物记录口述', '无特殊道具'] },
    { id: 'recommend_level', label: '推荐浓度', type: 'select', options: ['自来水感不强推（推荐）', '明确安利'] },
  ],
  'skill-test-15-pinglunqu-kaigang-huidui': [
    { id: 'review_quote', label: '要回怼的评论内容', type: 'textarea', required: true, wide: true },
    { id: 'attitude', label: '回怼语气', type: 'select', options: ['硬核证明', '幽默调侃', '淡定碾压'] },
    { id: 'pov_show', label: 'POV 展示', type: 'select', options: ['第一视角实操打脸（推荐）', '对镜讲解', '对比实验'] },
    { id: 'proof_point', label: '打脸证明点', type: 'text' },
  ],
  'skill-test-16-jietou-luren-anli': [
    { id: 'use_scene', label: '试用场景', type: 'text', placeholder: '例：街边刚买的饮品' },
    { id: 'reaction_note', label: '路人反应', type: 'select', options: ['真实惊喜', '淡定认可', '强烈安利'] },
    { id: 'question_note', label: '采访问题方向', type: 'text' },
    { id: 'real_confirm', label: '真实感', type: 'select', options: ['保留口水音/笑场（推荐）', '干净收音'] },
  ],
  'skill-test-17-chenjin-shoubashou-jiaocheng': [
    { id: 'step_count', label: '步骤数量', type: 'select', options: ['3 步', '4 步（推荐）', '5 步'] },
    { id: 'hand_focus', label: '手部特写重点', type: 'select', options: ['操作手法', '用量展示', '工具使用'] },
    { id: 'pov_form', label: '视角', type: 'select', options: ['第一视角（推荐）', '过肩视角'] },
    { id: 'pace_note', label: '教学节奏', type: 'select', options: ['沉浸无解说（推荐）', '轻声讲解'] },
  ],
  'skill-test-18-nvzhuang-bozhu-chuanda': [
    { id: 'blogger_persona', label: '博主人设', type: 'text' },
    { id: 'outfit_theme', label: '穿搭主题', type: 'select', options: ['通勤', '约会', '度假', '日常出街', '秋冬叠穿'] },
    { id: 'item_combo', label: '单品组合', type: 'text' },
    { id: 'mix_form', label: '口播与分镜', type: 'select', options: ['口播+上身分镜交替（推荐）', '纯口播', '纯展示'] },
  ],
  'skill-test-19-nvzhuang-dian-shangshen': [
    { id: 'store_area', label: '店内场景', type: 'select', options: ['试衣镜前', '陈列区', '试衣间门口', '橱窗旁'] },
    { id: 'fit_focus', label: '上身展示重点', type: 'select', options: ['版型', '垂感', '修身效果', '面料光泽'] },
    { id: 'try_action', label: '试穿动作', type: 'text' },
    { id: 'real_feel', label: '实拍感', type: 'select', options: ['店内实拍真实感（推荐）', '棚拍精致感'] },
  ],
  'skill-test-20-nanzhuang-xingnan-anli': [
    { id: 'aura_style', label: '气质方向', type: 'select', options: ['硬汉', '商务精英', '运动型男', '街头酷感'] },
    { id: 'fabric_focus', label: '廓形与面料重点', type: 'select', options: ['廓形挺括', '面料质感', '做工细节'] },
    { id: 'scene_note', label: '场景', type: 'select', options: ['健身房', '街头', '办公室', '地下车库'] },
    { id: 'body_show', label: '上身气场呈现要点', type: 'text' },
  ],
  'skill-test-21-nvzhuang-jiefang-shichuan': [
    { id: 'stop_form', label: '街访形式', type: 'select', options: ['街头拦访（推荐）', '门店邀请试穿'] },
    { id: 'passerby_type', label: '路人类型与人数', type: 'text' },
    { id: 'comment_focus', label: '点评重点', type: 'select', options: ['版型', '舒适度', '性价比', '上身效果'] },
    { id: 'real_confirm', label: '真实反应', type: 'select', options: ['保留犹豫与真实评价（推荐）', '全程好评'] },
  ],
  'skill-test-22-chaoliu-nanzhuang-duijing': [
    { id: 'outfit_style', label: '男装风格', type: 'select', options: ['街头潮流', '轻商务', '美式复古', '运动机能'] },
    { id: 'pose_groups', label: '姿势组数（2-4）', type: 'number' },
    { id: 'mirror_form', label: '对镜形式', type: 'select', options: ['手机镜面自拍感（推荐）', '固定机位对镜'] },
    { id: 'item_focus', label: '单品重点', type: 'text', placeholder: '例：oversize 卫衣版型' },
  ],
  'skill-test-23-pinpai-zhuliren-jiangxin': [
    { id: 'owner_persona', label: '主理人人设', type: 'text' },
    { id: 'craft_focus', label: '工艺/用料重点', type: 'select', options: ['选材', '工序', '手工细节', '品控'] },
    { id: 'studio_scene', label: '工作室/车间场景', type: 'text' },
    { id: 'endorse_line', label: '背书话术方向', type: 'text' },
    { id: 'asmr_note', label: '声音', type: 'select', options: ['手工声音入镜（推荐）', '无特殊要求'] },
  ],
  'skill-test-24-cangchu-chaoshi-yijing': [
    { id: 'store_desc', label: '仓储超市场景描述', type: 'text' },
    { id: 'grab_path', label: '抢货动线', type: 'text', placeholder: '例：入口→零食区→推车装满' },
    { id: 'volume_show', label: '货量感', type: 'select', options: ['堆头如山（推荐）', '整箱搬运', '货架满仓'] },
    { id: 'urgent_line', label: '紧迫感话术方向', type: 'text' },
  ],
  'skill-test-25-lingshou-caopanshou-huojia': [
    { id: 'operator_persona', label: '操盘手人设', type: 'text', placeholder: '例：十年商超采购老手' },
    { id: 'talk_focus', label: '讲解重点', type: 'select', options: ['选品逻辑', '成本与渠道', '行业规则', '性价比算账'] },
    { id: 'shelf_env', label: '货架环境', type: 'select', options: ['商超货架', '批发仓库', '品牌堆头'] },
    { id: 'trust_line', label: '建立信任的关键话术点', type: 'text' },
  ],
  'skill-test-26-gongchang-suyuan-zhigong': [
    { id: 'factory_scene', label: '工厂场景', type: 'select', options: ['生产线', '原料仓', '质检区', '成品仓', '打包发货'] },
    { id: 'trace_focus', label: '溯源重点', type: 'select', options: ['原料', '工艺', '出厂检验', '供应链规模'] },
    { id: 'price_expr', label: '源头价表达（须真实）', type: 'text' },
    { id: 'trust_line', label: '源头信任话术方向', type: 'text' },
  ],
  'skill-test-27-jiugongge-fenjing-chutu': [
    { id: 'cell_themes', label: '九格主题（每行一个，留空按默认）', type: 'textarea', wide: true },
    { id: 'shot_mix', label: '景别分布', type: 'select', options: ['特写+中景+全景混排（推荐）', '以特写为主'] },
    { id: 'consist_lock', label: '一致性', type: 'select', options: ['人物/场景/产品一致（推荐）', '按需调整'] },
    { id: 'real_feel', label: '真实感', type: 'select', options: ['手机抓拍截图感（推荐）', '电影感'] },
  ],
  'skill-test-28-liugongge-fenjing-chutu': [
    { id: 'cell_themes', label: '六格主题（每行一个，留空按默认）', type: 'textarea', wide: true },
    { id: 'grid_layout', label: '布局', type: 'select', options: ['2x3（推荐）', '3x2'] },
    { id: 'shot_mix', label: '景别分布', type: 'select', options: ['特写+中景混排（推荐）', '以特写为主'] },
    { id: 'consist_lock', label: '一致性', type: 'select', options: ['人物/场景一致（推荐）', '按需调整'] },
  ],
  'skill-test-29-gushiban-heijin-fenjingbiao': [
    { id: 'shot_count', label: '镜头数', type: 'select', options: ['6 镜', '7 镜（推荐）'] },
    { id: 'ui_style', label: '黑金 UI 风格', type: 'select', options: ['黑金商务（推荐）', '深灰科技', '按指定'] },
    { id: 'rhythm_note', label: '脚本节奏要求', type: 'text', placeholder: '例：15 秒，前 3 秒 Hook' },
    { id: 'first_frame_note', label: '首帧图要求', type: 'text' },
  ],
  'skill-test-30-liujingtou-gushiban-zhongcao': [
    { id: 'pain_note', label: '崩溃痛点描述', type: 'textarea', wide: true },
    { id: 'savior_person', label: '救星人物设定', type: 'text' },
    { id: 'transform_show', label: '蜕变效果呈现', type: 'text' },
    { id: 'structure_confirm', label: '六镜头结构', type: 'select', options: ['崩溃→救星→产品→蜕变（推荐）', '允许微调'] },
    { id: 'cover_note', label: '封面镜', type: 'select', options: ['效果最强一镜可作封面（推荐）', '无特殊要求'] },
  ],
  'skill-test-31-quanneng-zhongcao-nvzhubo': [
    { id: 'host_persona', label: '女主播人设', type: 'select', options: ['气质知性', '邻家亲切', '专业测评', '活泼甜妹'] },
    { id: 'talk_style', label: '种草话术', type: 'select', options: ['成分党讲解', '场景化种草', '闺蜜安利'] },
    { id: 'oral_points', label: '口播内容要点', type: 'textarea', wide: true },
    { id: 'shot_form', label: '出镜景别', type: 'select', options: ['半身口播为主（推荐）', '近景特写', '全身展示'] },
  ],
  'skill-test-32-quanpinlei-wanneng-daihuo': [
    { id: 'product_note', label: '产品与品类补充说明', type: 'text' },
    { id: 'script_structure', label: '脚本结构', type: 'select', options: ['痛点→解决→证明→CTA（推荐）', 'Hook→场景→效果', '卖点罗列'] },
    { id: 'appear_form', label: '出镜形式', type: 'select', options: ['真人出镜（推荐）', '手部展示', '纯产品'] },
    { id: 'fallback_note', label: '兜底风格', type: 'select', options: ['稳定不翻车（推荐）', '大胆试新'] },
  ],
  'skill-test-33-fangbenghuai-wending-zhanshi': [
    { id: 'fragile_part', label: '易崩坏部位', type: 'text', placeholder: '例：Logo 文字/细密花纹/细杆结构' },
    { id: 'motion_limit', label: '镜头运动', type: 'select', options: ['固定机位（推荐）', '缓慢横移', '轻微推近'] },
    { id: 'speed_note', label: '动作速度', type: 'select', options: ['慢动作（推荐）', '常速克制'] },
    { id: 'action_list', label: '稳定展示动作（每行一个）', type: 'textarea', wide: true },
  ],
  'skill-test-34-tongdian-baoji-yizhao': [
    { id: 'pain_scene', label: '痛点场景', type: 'textarea', wide: true },
    { id: 'one_move', label: '一招解决的核心演示', type: 'text' },
    { id: 'shot_confirm', label: '五分镜结构', type: 'select', options: ['标准五分镜（推荐）', '允许微调'] },
    { id: 'effect_confirm', label: '效果确认', type: 'select', options: ['当场可见结果（推荐）', '口播确认'] },
  ],
  'skill-test-35-tongdian-chaixiang-bidan-sanlian': [
    { id: 'pain_point', label: '痛点内容', type: 'textarea', wide: true },
    { id: 'unbox_way', label: '拆箱方式', type: 'select', options: ['撕膜', '划箱', '开盖'] },
    { id: 'test_focus', label: '核心测评项', type: 'text' },
    { id: 'bidan_note', label: '逼单话术重点', type: 'text' },
    { id: 'structure_confirm', label: '三连结构', type: 'select', options: ['痛点→拆箱→测评（推荐）', '允许微调'] },
  ],
  'skill-test-37-shangchao-shipai-huojia-qiangjing': [
    { id: 'store_type', label: '商超类型', type: 'select', options: ['大型商超', '便利店', '会员店', '社区超市'] },
    { id: 'shelf_desc', label: '货架陈列描述', type: 'text' },
    { id: 'grab_shot', label: '抢镜动作', type: 'select', options: ['手伸入货架拿取（推荐）', '整排扫过', '拿起对镜展示'] },
    { id: 'talk_style', label: '推荐话术', type: 'select', options: ['内行导购式', '街坊安利式'] },
  ],
  'skill-test-38-jimeng-zixuan-changjing-koubo': [
    { id: 'scene_pref', label: '场景偏好', type: 'select', options: ['自动匹配（推荐）', '厨房', '客厅', '办公室', '浴室', '阳台'] },
    { id: 'talk_style', label: '口播风格', type: 'select', options: ['自然口语', '闺蜜分享', '专业测评'] },
    { id: 'talk_duration', label: '口播时长', type: 'select', options: ['15 秒（推荐）', '30 秒', '60 秒'] },
    { id: 'scene_match_note', label: '场景与产品的关联说明', type: 'text' },
  ],
  'skill-test-39-chenei-suishoupai-tongqin-anli': [
    { id: 'seat_pos', label: '车内位置', type: 'select', options: ['驾驶座（静止）', '副驾', '后排'] },
    { id: 'commute_scene', label: '通勤场景描述', type: 'text' },
    { id: 'talk_tone', label: '安利语气', type: 'select', options: ['随口一提（推荐）', '认真安利', '吐槽式安利'] },
    { id: 'light_note', label: '光线', type: 'select', options: ['自然车窗光（推荐）', '晨光', '夜间车内灯'] },
  ],
  'skill-test-40-jianshenfang-8miao-baofa-koubo': [
    { id: 'gym_area', label: '健身房区域', type: 'select', options: ['器械区', '操房', '跑步机区'] },
    { id: 'sentence_count', label: '口播句数（8 秒）', type: 'select', options: ['2 句（推荐）', '3 句'] },
    { id: 'show_action', label: '展示动作', type: 'select', options: ['举起产品', '训练间隙拿起', '递近镜头'] },
    { id: 'energy_level', label: '爆发强度', type: 'select', options: ['高能爆发（推荐）', '沉稳有力'] },
  ],
  'skill-test-42-zhibo-qiepian-gaoguang-bidan': [
    { id: 'live_moment', label: '高光时刻内容', type: 'text', placeholder: '例：主播喊出破价瞬间' },
    { id: 'bidan_focus', label: '逼单重点', type: 'select', options: ['限时', '限量', '价格锚点', '赠品加码'] },
    { id: 'clip_duration', label: '切片时长', type: 'select', options: ['15 秒（推荐）', '30 秒'] },
    { id: 'live_vibe', label: '直播间氛围', type: 'select', options: ['高能促单', '亲切唠嗑', '专业讲品'] },
  ],
  'skill-test-43-gushi-ban-veo-8miao-jisu': [
    { id: 'beat_count', label: '8 秒镜头数', type: 'select', options: ['2 镜', '3 镜（推荐）', '4 镜'] },
    { id: 'core_action', label: '每拍的核心动作', type: 'text' },
    { id: 'rhythm', label: '节奏', type: 'select', options: ['前 2 秒 Hook 加权（推荐）', '均匀分布'] },
    { id: 'frame_note', label: '首尾帧', type: 'select', options: ['首帧即产品清晰入画（推荐）', '结尾定格产品'] },
  ],
  'crochet-knitted-ad-video': [
    { id: 'knit_style', label: '针织风格', type: 'select', options: ['粗毛线', '钩织花片', '毛衣质感', '毛毡'] },
    { id: 'texture_show', label: '质感呈现', type: 'select', options: ['微距纤维（推荐）', '慢动作翻动', '手作过程'] },
    { id: 'warmth_note', label: '温暖手作氛围元素', type: 'text', placeholder: '例：壁炉、木桌、热茶' },
    { id: 'scene_note', label: '出现的产品与场景', type: 'text' },
  ],
  'interview-dialogue-video': [
    { id: 'interview_form', label: '访谈形式', type: 'select', options: ['街头采访', '双人对话', '多人快问快答', '路人评价'] },
    { id: 'question_list', label: '问题清单（每行一个）', type: 'textarea', required: true, wide: true },
    { id: 'interviewee', label: '受访者类型与人数', type: 'text' },
    { id: 'answer_style', label: '回答风格', type: 'select', options: ['真实自然（推荐）', '搞笑整活', '观点犀利'] },
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
