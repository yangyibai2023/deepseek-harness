/** Locale bundles for the agent-preset settings row, hero chip, header label, and management section. */

/** Locale keys these surfaces render. */
export type AgentPresetSettingsKey =
  | 'title' | 'description' | 'loading' | 'error' | 'userTrust' | 'seatHint' | 'headerHint'
  | 'nav' | 'sectionIntro' | 'builtIn' | 'setDefault' | 'view'
  | 'presetStandardName' | 'presetStandardDescription'
  | 'presetCodeName' | 'presetCodeDescription'
  | 'presetMinimalName' | 'presetMinimalDescription'
  | 'presetCordisName' | 'presetCordisDescription'
  | 'presetGeneralAssistantName' | 'presetGeneralAssistantDescription'
  | 'customModelHint'
  | 'duplicate' | 'duplicateUnavailable' | 'delete' | 'presetId' | 'presetIdPlaceholder' | 'copyOf'
  | 'displayName' | 'displayNamePlaceholder'
  | 'inUse' | 'noDescription' | 'builtInGroup' | 'customGroup'
  | 'brokenBadge' | 'brokenNoCopy'
  | 'composition' | 'cancel' | 'close' | 'retry'
  | 'copyTitle' | 'copyIntro' | 'create' | 'creating' | 'creatorDraft'
  | 'createMenuTitle' | 'createViaForm' | 'createViaConversation'
  | 'createFormName' | 'createFormId' | 'createFormDescription' | 'createFormPersona'
  | 'createFormCapabilities' | 'createFormDomains'
  | 'createCapFileShell' | 'createCapWebSearch' | 'createCapSkills'
  | 'createCapPlanMode' | 'createCapSubagents'
  | 'createDomainContent' | 'createDomainImage' | 'createDomainVideo' | 'createDomainResearch'
  | 'createSaving' | 'createFailed'
  | 'creatorChip' | 'creatorChipEnter' | 'creatorChipExit'
  | 'openLocation' | 'showLocation' | 'revealedPathLabel'
  | 'idRequired' | 'idInvalid' | 'idTaken'
  | 'deleteTitle' | 'deleteDescription' | 'deleteConfirm' | 'deleting'

/** English copy. */
export const en: Record<AgentPresetSettingsKey, string> = {
  title: 'Agent preset',
  description: 'Applies to sessions you start from now on. Running sessions keep the preset they began with.',
  loading: 'Loading presets…',
  error: 'Could not load agent presets.',
  userTrust: 'Custom',
  seatHint: 'Agent preset for the session you are about to start',
  headerHint: 'The agent preset this session runs, fixed when it started',
  nav: 'Agent management',
  sectionIntro:
    'System presets are maintained by the HeightLab platform. Duplicate any preset to create your own agent (edit its files after copying), or let the agent draft one for you.',
  builtIn: 'Built-in',
  setDefault: 'Set as default',
  view: 'View',
  presetStandardName: 'Colin Commander',
  presetStandardDescription:
    'Colin Commander: understands your request, dispatches it to expert agents, reviews the results, and delivers them to you.',
  presetCodeName: 'Code mode',
  presetCodeDescription:
    'All Standard mode capabilities, with tools exposed through the Code Mode SDK so the model can combine multi-step operations in one TypeScript program.',
  presetMinimalName: 'System Operations Expert',
  presetMinimalDescription:
    'System expert: helps you organize computer files, manage project directories, and handle local file operations.',
  presetCordisName: 'Creator mode',
  presetCordisDescription:
    'Built for creating custom agent presets, with all Standard mode capabilities plus runtime inspection, plugin experiments, and preset-authoring guidance.',
  presetGeneralAssistantName: 'General AI Assistant',
  presetGeneralAssistantDescription:
    'General AI assistant for your own custom model: everyday conversation and general tasks.',
  customModelHint: 'Custom models only support the General AI Assistant.',
  duplicate: 'Duplicate',
  duplicateUnavailable: 'This deployment has no writable preset directory',
  delete: 'Delete',
  presetId: 'Identifier',
  presetIdPlaceholder: 'my-agent',
  displayName: 'Name',
  displayNamePlaceholder: 'Shown in the picker; defaults to the identifier',
  inUse: 'In use',
  builtInGroup: 'Built-in',
  customGroup: 'Custom',
  noDescription: 'No description.',
  brokenBadge: 'Failed to load',
  brokenNoCopy: 'A preset that failed to load cannot be duplicated',
  copyOf: 'Copied from',
  composition: 'Composition (agent.cordis.yml)',
  cancel: 'Cancel',
  close: 'Close',
  retry: 'Retry',
  copyTitle: 'Duplicate preset',
  copyIntro:
    'The whole preset is copied on this machine. The identifier becomes its directory name and cannot '
    + 'be changed later; everything else is edited in the preset\'s own files.',
  create: 'Create',
  creating: 'Creating…',
  creatorDraft: 'Create a custom agent',
  createMenuTitle: 'Create a custom agent',
  createViaForm: 'Create with a form',
  createViaConversation: 'Create via conversation',
  createFormName: 'Name',
  createFormId: 'Identifier',
  createFormDescription: 'Description',
  createFormPersona: 'Role / system prompt',
  createFormCapabilities: 'Capabilities',
  createFormDomains: 'HeightLab domains',
  createCapFileShell: 'Files & Shell',
  createCapWebSearch: 'Web search',
  createCapSkills: 'Skills',
  createCapPlanMode: 'Plan mode',
  createCapSubagents: 'Subagents',
  createDomainContent: 'Content',
  createDomainImage: 'Image',
  createDomainVideo: 'Video',
  createDomainResearch: 'Research',
  createSaving: 'Creating…',
  createFailed: 'Failed to create. Please try again.',
  creatorChip: 'Create Agent',
  creatorChipEnter: 'Turn on Creator mode to draft a custom agent',
  creatorChipExit: 'Creator mode is on; click to exit',
  openLocation: 'Open folder',
  showLocation: 'Show location',
  revealedPathLabel: 'Preset files:',
  idRequired: 'Give the preset an identifier.',
  idInvalid: 'Use lowercase letters, digits, and hyphens, starting with a letter or digit.',
  idTaken: 'A preset with this identifier already exists.',
  deleteTitle: 'Delete this preset?',
  deleteDescription:
    'The preset directory is deleted. Sessions already running on it keep working; new sessions cannot select it.',
  deleteConfirm: 'Delete',
  deleting: 'Deleting…',
}

/** Simplified Chinese copy. */
export const zh: Record<AgentPresetSettingsKey, string> = {
  title: 'Agent 预设',
  description: '对此后新建的会话生效。运行中的会话保持它开始时的预设。',
  loading: '正在加载预设…',
  error: '无法加载 Agent 预设。',
  userTrust: '自定义',
  seatHint: '即将开始的这个会话所用的 Agent 预设',
  headerHint: '本会话运行的 Agent 预设，开始时即固定',
  nav: 'Agent 管理',
  sectionIntro: '系统预设由 HeightLab 平台统一维护。复制任意预设即可创建自己的 Agent（创建后在对应目录里修改），或点「创建自定义 Agent」让 Agent 帮你起草。',
  builtIn: '内置',
  setDefault: '设为默认',
  view: '查看',
  presetStandardName: 'Colin 指挥官',
  presetStandardDescription: 'Colin 指挥官：接收并理解你的任务，拆解后派发给专家执行，审阅后交付给你。',
  presetCodeName: 'PTC 模式',
  presetCodeDescription: '具备标准模式的全部能力，并通过 Code Mode SDK 呈现工具，让模型用一个 TypeScript 程序组合多步操作。',
  presetMinimalName: '系统操作专家',
  presetMinimalDescription: '系统专家：帮你整理电脑文件、管理项目目录、批量处理本地文件等系统操作。',
  presetCordisName: '创造模式',
  presetCordisDescription: '用于创建自定义 Agent preset：具备标准模式的全部能力，并提供运行时检查、插件实验和 preset 创作指导。',
  presetGeneralAssistantName: '通用 AI 助手',
  presetGeneralAssistantDescription:
    '通用 AI 助手：使用你自己的模型完成日常对话与通用任务。',
  customModelHint: '自定义只支持通用 AI 助手。',
  duplicate: '复制',
  duplicateUnavailable: '此部署未配置可写的预设目录',
  delete: '删除',
  presetId: '标识符',
  presetIdPlaceholder: 'my-agent',
  displayName: '名称',
  displayNamePlaceholder: '选择器中显示的名字，缺省用标识符',
  inUse: '当前使用',
  builtInGroup: '内置',
  customGroup: '自定义',
  noDescription: '暂无描述。',
  brokenBadge: '加载失败',
  brokenNoCopy: '预设加载失败，不能复制',
  copyOf: '复制自',
  composition: '组装（agent.cordis.yml）',
  cancel: '取消',
  close: '关闭',
  retry: '重试',
  copyTitle: '复制预设',
  copyIntro: '整个预设会在本机复制一份。标识符将成为目录名，事后无法更改；其余内容之后直接在预设自己的文件里编辑。',
  create: '创建',
  creating: '正在创建…',
  creatorDraft: '创建自定义 Agent',
  createMenuTitle: '创建自定义 Agent',
  createViaForm: '用表单创建',
  createViaConversation: '通过对话创建',
  createFormName: '名称',
  createFormId: '标识符',
  createFormDescription: '描述',
  createFormPersona: '角色设定 / 系统提示词',
  createFormCapabilities: '能力',
  createFormDomains: 'HeightLab 专业领域',
  createCapFileShell: '文件与 Shell',
  createCapWebSearch: '网页搜索',
  createCapSkills: 'Skills',
  createCapPlanMode: '计划模式',
  createCapSubagents: '子代理',
  createDomainContent: '内容创作',
  createDomainImage: '图片生成',
  createDomainVideo: '视频制作',
  createDomainResearch: '研究分析',
  createSaving: '创建中…',
  createFailed: '创建失败，请稍后重试。',
  creatorChip: '创造 Agent',
  creatorChipEnter: '开启创造模式：用对话起草自定义 Agent',
  creatorChipExit: '当前为创造模式，点击退出',
  openLocation: '打开目录',
  showLocation: '查看路径',
  revealedPathLabel: '预设文件：',
  idRequired: '请填写标识符。',
  idInvalid: '只能使用小写字母、数字与连字符，且以字母或数字开头。',
  idTaken: '该标识符已被占用。',
  deleteTitle: '删除该预设？',
  deleteDescription: '预设目录将被删除。已在其上运行的会话不受影响；新会话将无法再选择它。',
  deleteConfirm: '删除',
  deleting: '正在删除…',
}

/** Preset roster fields needed to resolve Web display copy. */
export interface PresetDisplaySource {
  /** Stable preset id. */
  readonly id: string
  /** Whether the deployment ships the preset or the user owns it. */
  readonly trust: 'system' | 'user'
  /** Unlocalized name published by the preset. */
  readonly name?: string
  /** Unlocalized description published by the preset. */
  readonly description?: string
}

/** Display copy resolved for the active Web locale. */
export interface PresetDisplayText {
  /** Localized built-in name or the preset's own fallback name. */
  readonly name: string
  /** Localized built-in description or the preset's own description. */
  readonly description?: string
}

interface PresetLocaleKeys {
  readonly name: AgentPresetSettingsKey
  readonly description: AgentPresetSettingsKey
}

const BUILT_IN_PRESET_KEYS: Readonly<Partial<Record<string, PresetLocaleKeys>>> = {
  standard: { name: 'presetStandardName', description: 'presetStandardDescription' },
  code: { name: 'presetCodeName', description: 'presetCodeDescription' },
  minimal: { name: 'presetMinimalName', description: 'presetMinimalDescription' },
  cordis: { name: 'presetCordisName', description: 'presetCordisDescription' },
}

/**
 * Resolve preset display copy without making user-authored metadata translatable.
 * @param preset - roster row whose copy is being rendered.
 * @param t - active Web locale lookup.
 * @returns localized copy for a known shipped preset, otherwise file metadata.
 */
export function presetDisplayText(
  preset: PresetDisplaySource,
  t: (key: AgentPresetSettingsKey) => string,
): PresetDisplayText {
  const keys = preset.trust === 'system' ? BUILT_IN_PRESET_KEYS[preset.id] : undefined
  if (keys !== undefined) return { name: t(keys.name), description: t(keys.description) }
  return {
    name: preset.name ?? preset.id,
    ...preset.description === undefined ? {} : { description: preset.description },
  }
}
