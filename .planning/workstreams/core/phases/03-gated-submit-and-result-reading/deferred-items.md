# Deferred Items

- `npm run ext:test` starts Vitest with `apps/extension` as its working directory, while `apps/extension/test/build.test.ts` resolves `apps/extension/manifest.template.json` relative to the repository root. The workspace command therefore looks for a duplicate `apps/extension/apps/extension` path. The full extension test directory passes when run from the repository root with `npx vitest run apps/extension/test`. This pre-existing test-command path mismatch is outside Plan 03-04 and was not changed.
