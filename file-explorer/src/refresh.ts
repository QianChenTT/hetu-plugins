// The wait after a listing: the second the carrier holds a plugin's listing time to (filterMsPerSecond in
// core/api/floor.ts), so each listing of a stream starts in a second the one before is no longer charged to
export const GAP_MS = 1000

const pause = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms))

// One listing at a time and a wait of GAP_MS after each. Requests that come while one runs or waits make one more once
// the wait is over, however many there were, so a change made during a listing is never missed and a stream of changes
// costs one listing for every GAP_MS and the time a listing takes. A request with none running or waiting lists at once
export class Refresher {
  private readonly run: () => Promise<void>
  private readonly gapMs: number
  private readonly wait: (ms: number) => Promise<void>
  private running = false
  private again = false

  constructor(run: () => Promise<void>, gapMs = GAP_MS, wait: (ms: number) => Promise<void> = pause) {
    this.run = run
    this.gapMs = gapMs
    this.wait = wait
  }

  request(): void {
    if (this.running) {
      this.again = true
      return
    }
    void this.loop()
  }

  private async loop(): Promise<void> {
    this.running = true
    try {
      do {
        this.again = false
        await this.run()
        await this.wait(this.gapMs)
      } while (this.again)
    } finally {
      this.running = false
    }
  }
}
