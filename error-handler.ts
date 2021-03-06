let errorOccurred = false

onerror = function (
  event: string,
  source: string, lineNumber: number, columnNumber: number,
  error: Error
): void {
  errorOccurred = true
  ShowMessage(
    `An unexpected error occurred.  This application will now stop.
Please ensure that your device and browser are up to date, then refresh to try again.

Technical details on the error follow:
${event}
${source}@${lineNumber}:${columnNumber}
${error}`
  )

  CheckEventLoop()
}
