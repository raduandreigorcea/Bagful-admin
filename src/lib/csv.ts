import type { Page } from './data/types'

// CSV for the Export button on DataTable.
//
// Two things here are not obvious. Product names and list names are free text
// somebody typed, and a cell that starts with = + - or @ is a formula the moment
// Excel opens the file, so those get a leading apostrophe. And the file starts
// with a byte-order mark: without it Excel reads UTF-8 as Windows-1252 and every
// ă, ș and ț in a Romanian name arrives as mojibake.

const FORMULA_START = /^[=+\-@\t\r]/

export function csvCell(value: unknown): string {
  if (value === null || value === undefined) return ''
  let text = typeof value === 'string' ? value : String(value)
  if (typeof value === 'string' && FORMULA_START.test(text)) text = `'${text}`
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

export function toCsv(headers: string[], rows: unknown[][]): string {
  return [headers, ...rows].map((line) => line.map(csvCell).join(',')).join('\r\n')
}

export function downloadCsv(filename: string, csv: string): void {
  const url = URL.createObjectURL(new Blob(['﻿', csv], { type: 'text/csv;charset=utf-8' }))
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

/** The most rows one export fetches. 25 requests at the RPCs' 200-row ceiling. */
export const EXPORT_MAX = 5000
const EXPORT_PAGE = 200

/**
 * Walk a paginated fetcher to the end, or to EXPORT_MAX.
 *
 * `total` is what the server says matched, so the caller can tell the person
 * the file is the first 5,000 of 108,000 rather than let them think it is whole.
 */
export async function collectPages<T>(
  fetchPage: (offset: number, limit: number) => Promise<Page<T>>,
): Promise<{ rows: T[]; total: number }> {
  const rows: T[] = []
  let total = 0
  while (rows.length < EXPORT_MAX) {
    const page = await fetchPage(rows.length, Math.min(EXPORT_PAGE, EXPORT_MAX - rows.length))
    total = page.total
    rows.push(...page.rows)
    if (page.rows.length === 0 || rows.length >= total) break
  }
  return { rows, total }
}
