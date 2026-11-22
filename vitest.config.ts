// A plain object, since vitest is hetu's and nothing at the root resolves vitest/config. hetu's own tests are its own
export default { test: { include: ['test/**/*.test.ts', '*/test/**/*.test.ts'], exclude: ['hetu/**', '**/node_modules/**'] } }
