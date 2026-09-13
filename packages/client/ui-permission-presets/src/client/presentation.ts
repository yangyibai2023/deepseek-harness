import { en } from './locales.ts'

/** Machine value of the preset that requires an explicit GUI risk gate. */
export const FULL_ACCESS_PRESET = 'danger-full-access'

// HeightLab：权限档位中文名（仅查看 / 当前项目 / 完全访问）。
const ZH_PRESET_LABELS: Record<string, string> = {
  'read-only': '仅查看',
  'Read Only': '仅查看',
  'Read-only': '仅查看',
  readonly: '仅查看',
  'workspace-write': '当前项目',
  workspace: '当前项目',
  Workspace: '当前项目',
  'Workspace Write': '当前项目',
  'danger-full-access': '完全访问',
  'Full access': '完全访问',
  'full-access': '完全访问',
}

/** Locale dictionary key for a built-in permission preset label. */
export type PermissionPresetLabelKey =
  | 'preset.readOnly'
  | 'preset.workspaceWrite'
  | 'preset.fullAccess'

const PRESET_LABEL_KEYS = new Map<string, PermissionPresetLabelKey>([
  ['read-only', 'preset.readOnly'],
  ['workspace-write', 'preset.workspaceWrite'],
  [FULL_ACCESS_PRESET, 'preset.fullAccess'],
])

const DEFAULT_PRESET_LABELS: Record<PermissionPresetLabelKey, string> = {
  'preset.readOnly': en['preset.readOnly'],
  'preset.workspaceWrite': en['preset.workspaceWrite'],
  'preset.fullAccess': en['preset.fullAccess'],
}

/**
 * Convert conventional kebab-case preset names into user-facing title case.
 * @param name - host-supplied preset label or key.
 * @returns the title-cased conventional key, or a non-kebab label unchanged.
 */
export function displayPresetName(name: string): string {
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(name)) return name
  return name.split('-').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')
}

/**
 * Render a permission preset under its product label.
 * @param value - preset machine value.
 * @param name - host-supplied preset name.
 * @param t - optional locale dictionary lookup for built-in product labels.
 * @returns the built-in product label or the conventional display name.
 */
export function displayPermissionPreset(
  value: string,
  name: string,
  t?: (key: PermissionPresetLabelKey) => string,
): string {
  const key = PRESET_LABEL_KEYS.get(value)
  if (key !== undefined && (name === value || name === DEFAULT_PRESET_LABELS[key])) {
    return t?.(key) ?? DEFAULT_PRESET_LABELS[key]
  }
  // HeightLab：中文档位名兜底。
  return ZH_PRESET_LABELS[name] ?? ZH_PRESET_LABELS[value]
    ?? (value === FULL_ACCESS_PRESET ? '完全访问' : displayPresetName(name))
}
