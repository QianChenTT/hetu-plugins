import { definePlugin } from '@hetu/sdk'
import { Explorer } from './explorer.ts'

export default definePlugin({
  start: ctx => new Explorer(ctx).start(),
})
