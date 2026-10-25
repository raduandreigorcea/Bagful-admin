import { describe, expect, it } from 'vitest'
import { collectPages, csvCell, toCsv, EXPORT_MAX } from '../src/lib/csv'

// What goes in a downloaded file is read by Excel, and Excel treats a cell that
// starts with = + - or @ as a formula. Product and list names are text people
// typed, so those are the property worth pinning.

describe('csvCell', () => {
  it('quotes what would break a row and doubles the quotes', () => {
    expect(csvCell('Lapte, 1L')).toBe('"Lapte, 1L"')
    expect(csvCell('the "good" one')).toBe('"the ""good"" one"')
    expect(csvCell('two\nlines')).toBe('"two\nlines"')
  })

  it('leaves a plain value alone and writes nothing for null', () => {
    expect(csvCell('Lapte')).toBe('Lapte')
    expect(csvCell(null)).toBe('')
    expect(csvCell(undefined)).toBe('')
    expect(csvCell(0)).toBe('0')
    expect(csvCell(false)).toBe('false')
  })

  it('defuses a text cell that Excel would run as a formula', () => {
    expect(csvCell('=HYPERLINK("http://x")')).toBe(`"'=HYPERLINK(""http://x"")"`)
    expect(csvCell('+1')).toBe("'+1")
    expect(csvCell('-2')).toBe("'-2")
    expect(csvCell('@SUM(A1)')).toBe("'@SUM(A1)")
  })

  it('does not touch a negative NUMBER, which is not text', () => {
    expect(csvCell(-3)).toBe('-3')
  })
})

describe('toCsv', () => {
  it('joins with CRLF, headers first', () => {
    expect(toCsv(['a', 'b'], [[1, 'x'], [2, null]])).toBe('a,b\r\n1,x\r\n2,')
  })
})

describe('collectPages', () => {
  const pageOf = (total: number) => async (offset: number, limit: number) => ({
    rows: Array.from({ length: Math.max(0, Math.min(limit, total - offset)) }, (_, i) => offset + i),
    total,
    offset,
  })

  it('walks every page when the total fits', async () => {
    const { rows, total } = await collectPages(pageOf(450))
    expect(rows).toHaveLength(450)
    expect(total).toBe(450)
  })

  it('stops at the cap and still reports the real total', async () => {
    const { rows, total } = await collectPages(pageOf(100_000))
    expect(rows).toHaveLength(EXPORT_MAX)
    expect(total).toBe(100_000)
  })

  it('stops on an empty page rather than looping on a total that lied', async () => {
    const { rows } = await collectPages(async () => ({ rows: [], total: 99, offset: 0 }))
    expect(rows).toEqual([])
  })
})
