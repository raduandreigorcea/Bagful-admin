// Run one removal per row, one after another, and say which ones failed.
//
// Sequential on purpose: a page holds at most 25 rows, every removal is a
// round trip the database answers in milliseconds, and parallel requests would
// only make "3 of 5 failed" harder to read. Nothing stops at the first failure,
// because the rows that can go should go; the caller reports the rest.
export async function removeEach<T>(
  items: T[],
  remove: (item: T) => Promise<void>,
): Promise<{ done: number; failed: { item: T; message: string }[] }> {
  let done = 0
  const failed: { item: T; message: string }[] = []
  for (const item of items) {
    try {
      await remove(item)
      done += 1
    } catch (err) {
      failed.push({ item, message: err instanceof Error ? err.message : String(err) })
    }
  }
  return { done, failed }
}
