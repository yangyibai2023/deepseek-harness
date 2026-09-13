/** Locale bundles for the agent-preset hero chip, header label, and management section. */

/** Locale keys these surfaces render. */
export type AgentPresetSettingsKey =
  | 'error' | 'userTrust' | 'seatHint' | 'headerHint'
  | 'nav' | 'sectionIntro' | 'builtIn' | 'setDefault' | 'view'
  | 'presetStandardName' | 'presetStandardDescription'
  | 'presetPtcName' | 'presetPtcDescription'
  | 'presetMinimalName' | 'presetMinimalDescription'
  | 'presetCordisName' | 'presetCordisDescription'
  | 'duplicate' | 'duplicateUnavailable' | 'delete' | 'presetId' | 'presetIdPlaceholder' | 'copyOf'
  | 'displayName' | 'displayNamePlaceholder'
  | 'inUse' | 'noDescription' | 'builtInGroup' | 'customGroup'
  | 'brokenBadge' | 'brokenNoCopy' | 'switchRefused'
  | 'composition' | 'cancel' | 'close' | 'retry'
  | 'copyTitle' | 'copyIntro' | 'create' | 'creating' | 'creatorDraft'
  | 'creatorChip' | 'creatorChipEnter' | 'creatorChipExit'
  | 'customModelHint' | 'presetGeneralAssistantName' | 'presetGeneralAssistantDescription' | 'createMenuTitle' | 'createViaForm' | 'createViaConversation' | 'createFormName' | 'createFormId' | 'createFormDescription' | 'createFormPersona' | 'createFormCapabilities' | 'createFormDomains' | 'createCapFileShell' | 'createCapWebSearch' | 'createCapSkills' | 'createCapPlanMode' | 'createCapSubagents' | 'createDomainContent' | 'createDomainImage' | 'createDomainVideo' | 'createDomainResearch' | 'createSaving' | 'createFailed'
  | 'openLocation' | 'showLocation' | 'revealedPathLabel'
  | 'idRequired' | 'idInvalid' | 'idTaken'
  | 'deleteTitle' | 'deleteDescription' | 'deleteConfirm' | 'deleting'

/** English copy. */
export const en: Record<AgentPresetSettingsKey, string> = {
  error: 'Could not load agent presets.',
  userTrust: 'Custom',
  seatHint: 'Agent preset for the session you are about to start',
  headerHint: 'The agent preset this session runs, fixed when it started',
  nav: 'Agent management',
  sectionIntro: 'System presets are maintained by the HeightLab platform. Duplicate any preset to create your own agent (edit its files after copying), or let the agent draft one for you.',
  builtIn: 'Built-in',
  setDefault: 'Set as default',
  view: 'View',
  presetStandardName: 'Colin Commander',
  presetStandardDescription: 'Colin Commander: understands your request, dispatches it to expert agents, reviews the results, and delivers them to you.',
  presetPtcName: 'PTC mode',
  presetPtcDescription:
    'Full coding agent without the workflow tool; other tools are exposed through the PTC mode SDK so the model can combine multi-step operations in one TypeScript program.',
  presetMinimalName: 'System Operations Expert',
  presetMinimalDescription: 'System expert: helps you organize computer files, manage project directories, and handle local file operations.',
  presetCordisName: 'Creator mode',
  presetCordisDescription:
    'Built for creating custom agent presets, with all Standard mode capabilities plus runtime inspection, plugin experiments, and preset-authoring guidance.',
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
  switchRefused: 'Could not switch to {name}: {reason}',
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
  creatorChip: 'Create Agent',
  customModelHint: 'Custom models only support the General AI Assistant.',
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
  presetGeneralAssistantName: 'General AI Assistant',
  presetGeneralAssistantDescription: 'General AI assistant for your own custom model: everyday conversation and general tasks.',
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
}

/** Simplified Chinese copy. */
export const zh: Record<AgentPresetSettingsKey, string> = {
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
  presetPtcName: 'PTC 模式',
  presetPtcDescription: '功能完整的编码 Agent，但默认不提供 workflow 工具；其他工具通过 PTC 模式 SDK 呈现，让模型用一个 TypeScript 程序组合多步操作。',
  presetMinimalName: '系统操作专家',
  presetMinimalDescription: '系统专家：帮你整理电脑文件、管理项目目录、批量处理本地文件等系统操作。',
  presetCordisName: '创造模式',
  presetCordisDescription: '用于创建自定义 Agent preset：具备标准模式的全部能力，并提供运行时检查、插件实验和 preset 创作指导。',
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
  switchRefused: '无法切换到「{name}」：{reason}',
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
  creatorChip: '创造 Agent',
  customModelHint: '自定义模型仅支持「通用 AI 助手」。',
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
  presetGeneralAssistantName: '通用 AI 助手',
  presetGeneralAssistantDescription: '通用 AI 助手：使用你自己的模型完成日常对话与通用任务。',
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
}

// The resolution itself is the shared fold in `dsh-agent-presets/display`,
// re-exported here so every surface in this plugin reads one path; the
// Settings plugin list inlines the same fold over this plugin's dictionaries.
export { presetDisplayText } from '@deepseek-ai/dsh-agent-presets/display'
export type { PresetDisplaySource, PresetDisplayText } from '@deepseek-ai/dsh-agent-presets/display'
