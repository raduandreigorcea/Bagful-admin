import type { BannedUserRow } from './data/users'
import type { ClerkUser } from './data/services'

// One row per banned person, whichever door refused them.
//
// A ban is two refusals: the app's (they cannot open Bagful, their lists stay)
// and Clerk's (they cannot sign in at all). They are recorded in different
// places, so the page reads both and lays them over each other by Clerk id. Most
// bans are in both; the rows that are in only one are the interesting ones, a ban
// that stopped halfway.

export interface BanRow {
  user_id: string
  display_name: string
  image_url: string | null
  /** When the app banned them. Null for a Clerk-only ban: Clerk does not say. */
  banned_at: string | null
  lists: number | null
  reason: string | null
  banned_by: string | null
  banned_by_name: string | null
  banned_by_image_url: string | null
  inApp: boolean
  inClerk: boolean
}

export function mergeBans(app: BannedUserRow[], clerk: ClerkUser[]): BanRow[] {
  const rows = new Map<string, BanRow>()
  for (const row of app) rows.set(row.user_id, { ...row, inApp: true, inClerk: false })
  for (const user of clerk) {
    const existing = rows.get(user.id)
    if (existing) {
      existing.inClerk = true
      continue
    }
    rows.set(user.id, {
      user_id: user.id,
      display_name: user.name || user.email || '',
      image_url: user.imageUrl,
      banned_at: null,
      lists: null,
      reason: null,
      banned_by: null,
      banned_by_name: null,
      banned_by_image_url: null,
      inApp: false,
      inClerk: true,
    })
  }
  // The app's own bans keep the order the database gave them (newest first); the
  // Clerk-only ones follow.
  return [...rows.values()]
}
