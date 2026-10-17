import { banClerkUser, unbanClerkUser } from './data/services'

// The one ban. An account is refused twice over: Bagful stops it opening the app
// (its lists stay), Clerk stops it signing in at all and ends its sessions. There
// is no way to place half of one: the dashboard asks admin-services for a ban and
// the SERVER closes both doors in one request (Clerk first, then Bagful's flag;
// both are idempotent, so if the second step fails the error says so and pressing
// the button again is safe). Lifting is the same, in the same order.
//
// Owners only: the request is a Clerk action, and Clerk actions are limited to the
// ids in CLERK_ACTION_ADMINS. An admin who is not one cannot ban at all, rather
// than banning in one place.

/** Bans in Bagful and Clerk, in one request. `reason` goes into the audit trail. */
export async function banEverywhere(userId: string, reason: string, signal: AbortSignal): Promise<void> {
  await banClerkUser(userId, signal, reason.trim())
}

/** Lifts both, in one request. */
export async function liftEverywhere(userId: string, signal: AbortSignal): Promise<void> {
  await unbanClerkUser(userId, signal)
}

export interface BanState {
  label: string
  tone: 'bad'
  title: string
}

/**
 * How to name an account's ban. There is one ban, so there is one label: banned in
 * either place is Banned. Every ban the dashboard places closes both doors; a ban
 * found in only one (placed by hand in Clerk, say) is still a ban, and pressing
 * Ban or Lift ban acts on both.
 */
export function banState(inApp: boolean, inClerk: boolean): BanState | null {
  if (!inApp && !inClerk) return null
  return { label: 'Banned', tone: 'bad', title: 'Refused by Bagful and by Clerk.' }
}
