// One listing at a time. Requests that come while one runs make one more after it, however many there were, so a
// change made during a listing is never missed and a burst of changes costs two listings
export class Refresher {
  private readonly run: () => Promise<void>
  private running = false
  private again = false

  constructor(run: () => Promise<void>) {
    this.run = run
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
      } while (this.again)
    } finally {
      this.running = false
    }
  }
}
