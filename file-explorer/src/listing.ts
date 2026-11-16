import { Refused } from '@hetu/sdk'

// A throttled page is asked for again after RETRY_MS, until the listing waited WAIT_MS in all, as hetu's palette does
export const RETRY_MS = 1000
export const WAIT_MS = 60_000

export type Page = { paths: string[], next: string | null }
export type Lister = (args: { after?: string }) => Promise<Page>
export type Listed = { ok: true, pages: string[][] } | { ok: false, code: string }

const pause = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms))

// Every page of a listing, each asked for after the last name of the one before. The luoshu charges a listing to the
// plugin's filter budget, so a page can come back throttled once the SDK's own retries ran out: the same page is asked
// for again. Any other refusal ends the listing
export async function listAll(list: Lister, wait: (ms: number) => Promise<void> = pause): Promise<Listed> {
  const pages: string[][] = []
  let after: string | undefined
  let waited = 0
  for (;;) {
    let page: Page
    try {
      page = await list(after === undefined ? {} : { after })
    } catch (err) {
      if (!(err instanceof Refused)) throw err
      if (err.code !== 'throttled' || waited >= WAIT_MS) return { ok: false, code: err.code }
      await wait(RETRY_MS)
      waited += RETRY_MS
      continue
    }
    pages.push(page.paths)
    if (page.next === null) return { ok: true, pages }
    after = page.next
  }
}
