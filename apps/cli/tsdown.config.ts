import { isBuiltin } from 'node:module'
import { defineConfig } from 'tsdown'

/**
 * The dsh CLI ships its command and the profile lifecycle shared with Desktop.
 * Declarations come from `tsc -b` (dts: false), matching every package.
 *
 * 2026-09-18: the bundle must be SELF-CONTAINED for npm dependencies. The
 * desktop host executes this file as `<runtime>/vendor/deepseek-harness/
 * lib/bin.js` (see desktop-dsh/src-tauri/src/lib.rs spawn_dsh_host), where
 * pnpm's strict layout does not hoist npm deps (commander, …) to the vendor
 * root — an externalized import fails with ERR_MODULE_NOT_FOUND and the app
 * hangs on its launch screen. Workspace `@deepseek-ai/*` imports stay
 * external: the packaged runtime hoists those links into the vendor root
 * node_modules (build-dsh-runtime.ts hoistWorkspaceScopedPackages).
 */
export default defineConfig({
  entry: ['lib/types/bin.js', 'lib/types/profile-boot.js'],
  outDir: 'lib',
  format: ['esm'],
  platform: 'node',
  target: 'es2024',
  fixedExtension: false,
  dts: false,
  clean: ['lib/*.js'],
  deps: {
    neverBundle: () => false,
    alwaysBundle: (specifier: string) => !isBuiltin(specifier) && !specifier.startsWith('@deepseek-ai/'),
  },
})
