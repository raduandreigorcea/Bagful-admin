import { FunctionsHttpError } from '@supabase/supabase-js'
import { getAppSupabase } from '../supabase'

// Sentry, OneSignal, Clerk and PostHog, read through Bagful's admin-services
// edge function.
//
// Not directly, and never directly: all three answer only to a secret key, and
// this dashboard holds none (.env.example says why). The function holds the
// keys as secrets of the app project it is deployed to, checks is_admin() with
// the caller's own Clerk token, and returns only the fields these pages render.
// Its request and response shapes are in Bagful's
// supabase/functions/_shared/services.ts; the types below mirror them.
//
// It follows the project switcher like every list read does, because it
// is deployed to both app projects and each answers from its own secrets. So a
// page on bagful-dev can say "not configured" for a service production has.

export type Service = 'sentry' | 'onesignal' | 'clerk' | 'posthog'

export interface SentryIssue {
  id: string
  shortId: string
  title: string
  culprit: string | null
  level: string
  events: number
  users: number
  firstSeen: string
  lastSeen: string
  url: string
}

export interface SentryFeedback {
  id: string
  shortId: string
  message: string
  name: string | null
  email: string | null
  /** unresolved, resolved or ignored; ignored is what Sentry calls archived. */
  status: string
  at: string
  url: string
}

/** One place a person's push notifications can land, as OneSignal knows it. */
export interface PushDevice {
  /** Android, iOS, Chrome, Firefox, Safari. */
  kind: string
  /** False means unsubscribed: uninstalled, data cleared, or notifications turned off. */
  enabled: boolean
  model: string | null
  os: string | null
  appVersion: string | null
}

export interface PushSubscriber {
  userId: string
  /** on: a device is subscribed. off: devices exist and none is. none: OneSignal has no device for them. */
  state: 'on' | 'off' | 'none'
  devices: PushDevice[]
  lastActive: string | null
}

export interface PushNotification {
  id: string
  text: string
  at: string | null
  delivered: number
  /** Devices that had unsubscribed: gone, rather than broken. */
  unsubscribed: number
  errored: number
  remaining: number
  canceled: boolean
}

export interface ClerkUser {
  id: string
  name: string | null
  email: string | null
  imageUrl: string | null
  methods: string[]
  createdAt: string | null
  lastSignInAt: string | null
  lastActiveAt: string | null
  twoFactor: boolean
  banned: boolean
  locked: boolean
}

/** Counts only, per day; see posthogActivityQuery for why nothing else comes back. */
export interface PostHogActivity {
  channel: string
  /** YYYY-MM-DD, oldest first. */
  days: string[]
  /** counts[event][part]: one number per day; part is '' for an event with no breakdown. */
  counts: Record<string, Record<string, number[]>>
}

export interface ClerkSummary {
  total: number
  recent: ClerkUser[]
}

// Where each service's own dashboard lives, for the "Open in" button on its page.
// None of these is a secret: they are the public addresses a person signs in at.
// OneSignal's id is the production app's, the one the app ships in its bundle.
export const DASHBOARDS = {
  sentry: { label: 'Open Sentry', href: 'https://bagful.sentry.io/issues/' },
  onesignal: { label: 'Open OneSignal', href: 'https://dashboard.onesignal.com/apps/e6346de4-1112-4985-a974-7a4e4838bc8f' },
  posthog: { label: 'Open PostHog', href: 'https://eu.posthog.com/project/287898/dashboard/982750' },
  clerk: { label: 'Open Clerk', href: 'https://dashboard.clerk.com/last-active?path=users' },
} as const

const SERVICE_NAMES: Record<Service, string> = { sentry: 'Sentry', onesignal: 'OneSignal', clerk: 'Clerk', posthog: 'PostHog' }

/**
 * The service cannot be asked on this project at all, as opposed to having
 * failed. Two causes, and a page says which, because the fixes differ: a secret
 * nobody set, or a function nobody deployed.
 */
export class ServiceUnavailable extends Error {
  constructor(
    readonly service: Service,
    readonly reason: 'not_configured' | 'not_deployed',
    readonly missing: string[] = [],
  ) {
    super(`${SERVICE_NAMES[service]} is not ${reason === 'not_configured' ? 'configured' : 'deployed'} on this project`)
  }
}

/** What a page says instead of its content, or null when it has content. */
export function serviceProblem(error: Error | null): { title: string; message: string } | null {
  if (!(error instanceof ServiceUnavailable)) return null
  const name = SERVICE_NAMES[error.service]
  if (error.reason === 'not_deployed') {
    return {
      title: 'The admin-services function is not deployed here',
      message: `This project has no admin-services edge function, so ${name} cannot be read from it. Deploy it with: npx supabase functions deploy admin-services --no-verify-jwt --project-ref <ref>`,
    }
  }
  return {
    title: `${name} is not connected on this project`,
    message: `This project is missing the ${error.missing.join(', ')} secret${error.missing.length === 1 ? '' : 's'}. Set ${error.missing.length === 1 ? 'it' : 'them'} with: npx supabase secrets set --project-ref <ref>`,
  }
}

async function failure(service: Service, error: unknown): Promise<Error> {
  if (error instanceof FunctionsHttpError) {
    const res = error.context as Response
    const body = (await res.json().catch(() => null)) as
      | { code?: string; error?: string; missing?: string[] }
      | null
    if (body?.code === 'not_configured') return new ServiceUnavailable(service, 'not_configured', body.missing ?? [])
    // The function never answers 404, so a 404 is the platform saying it is
    // not there.
    if (res.status === 404) return new ServiceUnavailable(service, 'not_deployed')
    return Object.assign(new Error(`admin-services/${service}: ${body?.error ?? `HTTP ${res.status}`}`), {
      code: body?.code,
    })
  }
  const message = error instanceof Error ? error.message : String(error)
  return new Error(`admin-services/${service}: ${message}`)
}

async function ask<T>(body: { service: Service } & Record<string, unknown>, signal: AbortSignal): Promise<T> {
  const { data, error } = await getAppSupabase().functions.invoke('admin-services', { body, signal })
  if (error) throw await failure(body.service, error)
  return (data as { data: T }).data
}

export function fetchSentryIssues(signal: AbortSignal): Promise<SentryIssue[]> {
  return ask({ service: 'sentry', view: 'issues' }, signal)
}

export function fetchSentryFeedback(signal: AbortSignal): Promise<SentryFeedback[]> {
  return ask({ service: 'sentry', view: 'feedback' }, signal)
}

// The last answer for each person, kept in this browser. The answer takes a
// second request after the list of users, so a page already seen shows what it
// knew at once, even after a reload, and corrects it when the new answer lands.
const STORE = 'bagful-admin-subscribers'
const lastSubscribers = new Map<string, PushSubscriber>()
try {
  for (const sub of JSON.parse(localStorage.getItem(STORE) ?? '[]') as PushSubscriber[]) lastSubscribers.set(sub.userId, sub)
} catch {
  // Storage blocked or garbled: start empty.
}

/** Whether each of these people (at most 50) recorded a session in the last 30 days, i.e. has Session replay on. */
export function fetchReplayers(userIds: string[], signal: AbortSignal): Promise<{ userId: string; replay: boolean }[]> {
  return ask({ service: 'posthog', view: 'replayers', userIds }, signal)
}

export function cachedSubscriber(userId: string): PushSubscriber | undefined {
  return lastSubscribers.get(userId)
}

/** Whether each of these people (at most 50) can be pushed to. One answer per id, in any order. */
export async function fetchPushSubscribers(userIds: string[], signal: AbortSignal): Promise<PushSubscriber[]> {
  const answers = await ask<PushSubscriber[]>({ service: 'onesignal', view: 'subscribers', userIds }, signal)
  for (const answer of answers) lastSubscribers.set(answer.userId, answer)
  try {
    // ponytail: newest 200 people; a bigger roster just warms less of the cache.
    localStorage.setItem(STORE, JSON.stringify([...lastSubscribers.values()].slice(-200)))
  } catch {
    // Full or blocked: the in-memory copy still works.
  }
  return answers
}

export function fetchPushNotifications(signal: AbortSignal): Promise<PushNotification[]> {
  return ask({ service: 'onesignal', view: 'notifications' }, signal)
}

/** How many times an event happened in the last `days` days of an activity answer, all breakdowns summed. */
export function recentCount(activity: PostHogActivity, event: string, days: number): number {
  let total = 0
  for (const values of Object.values(activity.counts[event] ?? {})) {
    for (const value of values.slice(-days)) total += value
  }
  return total
}

export function fetchPostHogActivity(signal: AbortSignal): Promise<PostHogActivity> {
  return ask({ service: 'posthog', view: 'activity' }, signal)
}

export function fetchClerkSummary(signal: AbortSignal): Promise<ClerkSummary> {
  return ask({ service: 'clerk', view: 'summary' }, signal)
}

/** Null when the profile's Clerk account no longer exists. */
export function fetchClerkUser(userId: string, signal: AbortSignal): Promise<ClerkUser | null> {
  return ask({ service: 'clerk', view: 'user', userId }, signal)
}

const METHOD_LABELS: Record<string, string> = {
  google: 'Google',
  apple: 'Apple',
  microsoft: 'Microsoft',
  github: 'GitHub',
  facebook: 'Facebook',
  password: 'Password',
  email: 'Email code',
}

/** How a person signs in, in words: "Google, Email code". */
export function methodsLabel(methods: string[]): string {
  if (!methods.length) return 'Nothing set up'
  return methods.map((m) => METHOD_LABELS[m] ?? m.charAt(0).toUpperCase() + m.slice(1)).join(', ')
}

/** Totals across a list of notifications, for the tiles above it. */
export function pushTotals(rows: PushNotification[]) {
  return rows.reduce(
    (sum, row) => ({
      delivered: sum.delivered + row.delivered,
      unsubscribed: sum.unsubscribed + row.unsubscribed,
      errored: sum.errored + row.errored,
    }),
    { delivered: 0, unsubscribed: 0, errored: 0 },
  )
}

/** A person's notification state as a pill. Null while there is nothing to say yet. */
export function subscriberPill(
  sub: PushSubscriber | undefined,
): { tone: 'good' | 'warn' | 'idle'; label: string; title: string } | null {
  if (!sub) return null
  if (sub.state === 'on') {
    const on = sub.devices.filter((d) => d.enabled).length
    return { tone: 'good', label: 'On', title: `${on} subscribed device${on === 1 ? '' : 's'}.` }
  }
  if (sub.state === 'off') {
    return {
      tone: 'warn',
      label: 'Off',
      title: 'Has a device, but it is unsubscribed: the app was uninstalled, its data cleared, or notifications turned off. OneSignal does not say which.',
    }
  }
  return {
    tone: 'idle',
    label: 'No device',
    title: 'OneSignal has no phone or browser for this person. The app only signs a device in when someone turns notifications on.',
  }
}

/** "Android · Pixel 8", one per device, for the Devices column. */
export function deviceLabel(device: PushDevice): string {
  return device.model ? `${device.kind} · ${device.model}` : device.kind
}

/**
 * The Devices cell: "Android · Pixel 7 ×19, Android · moto g(60)s".
 *
 * OneSignal opens a new subscription on every reinstall and keeps the old ones,
 * so one phone can be twenty rows, most of them still marked enabled. Each device
 * is named once (the count is for the cell's tooltip, see subscriptionCount), and
 * when anything is subscribed only the subscribed ones are shown: the dead ones
 * are history, not where a push would go.
 */
export function deviceSummary(devices: PushDevice[]): string {
  const live = devices.filter((d) => d.enabled)
  const shown = live.length ? live : devices
  return [...new Set(shown.map(deviceLabel))].join(', ')
}

/** How many OneSignal subscriptions sit behind a summary: reinstalls, not phones. */
export function subscriptionCount(devices: PushDevice[]): number {
  const live = devices.filter((d) => d.enabled)
  return (live.length ? live : devices).length
}

export type PushKind = 'added' | 'bought' | 'test'

/**
 * What a notification is about, read from its English text.
 *
 * OneSignal keeps no "kind" for a push, and the English line is the one every
 * notification carries (push.ts sends all six languages): "<who> added <item>",
 * "<who> bought <list>", and the admin dashboard's own test. The earliest of
 * " added " and " bought " wins, so a person or product whose name contains the
 * other word does not flip it.
 * ponytail: breaks if push.ts rewords the English line; tag the push with a
 * `data.kind` in push-on-item-insert and read that instead.
 */
export function pushKind(text: string): PushKind | null {
  if (text.startsWith('Test notification sent from')) return 'test'
  const added = text.indexOf(' added ')
  const bought = text.indexOf(' bought ')
  if (added === -1 && bought === -1) return null
  if (bought === -1 || (added !== -1 && added < bought)) return 'added'
  return 'bought'
}

export interface PushState {
  tone: 'good' | 'warn' | 'bad' | 'idle' | 'live'
  label: string
  /** What the pill means, for the hover. */
  title: string
}

/**
 * How one notification's delivery went, as pills.
 *
 * The counts are OneSignal's, per DEVICE (a phone, a browser), not per person:
 * `successful` is a push handed to Google or Apple for a device, `failed` is a
 * device OneSignal knows is unsubscribed, `errored` is a device that hit an
 * error. A person with two devices counts twice. Unsubscribed is not a fault and
 * is not an error: the app was uninstalled, its data cleared, or notifications
 * switched off, and OneSignal does not say which.
 *
 * A notification can be wrong in more than one way, so this is a list.
 */
export function pushStates(row: PushNotification): PushState[] {
  if (row.canceled) return [{ tone: 'idle', label: 'Canceled', title: 'Canceled before it finished sending.' }]
  if (row.remaining > 0) return [{ tone: 'live', label: 'Sending', title: `Still queued for ${row.remaining} devices.` }]
  const states: PushState[] = []
  if (row.delivered > 0) {
    states.push({ tone: 'good', label: 'Delivered', title: 'Handed to Google or Apple for at least one device. That is as far as OneSignal can see.' })
  }
  if (row.unsubscribed > 0) {
    states.push({
      tone: 'warn',
      label: `${row.unsubscribed} unsubscribed`,
      title: 'Devices OneSignal knows are unsubscribed: the app was uninstalled, its data cleared, or notifications turned off. Not an error, and it cannot say which.',
    })
  }
  if (row.errored > 0) {
    states.push({ tone: 'bad', label: `${row.errored} failed`, title: 'Devices where delivery hit an error.' })
  }
  if (!states.length) states.push({ tone: 'idle', label: 'No devices', title: 'Nobody was subscribed to receive it.' })
  return states
}

// ─── things the dashboard can do ─────────────────────────────────────────────
//
// Each is a request with an `action`, answered by the same admin-services
// function after the same is_admin() check. They never retry (fetchWithRetry
// only repeats reads) and each page asks the person to confirm the destructive
// ones before calling.

/** A person found by email or name, from all of Clerk and not just the latest sign-ins. */
export function searchClerkUsers(query: string, signal: AbortSignal): Promise<ClerkUser[]> {
  return ask({ service: 'clerk', view: 'search', query }, signal)
}

/** Every banned Clerk account. Owners only, like search: it names accounts. */
export function fetchClerkBanned(signal: AbortSignal): Promise<ClerkUser[]> {
  return ask({ service: 'clerk', view: 'banned' }, signal)
}

/**
 * THE ban. One call, and admin-services closes both doors: Clerk (no sign-in, every
 * session ended) and Bagful's own flag (refused at the door). `reason` is the audit text.
 */
export function banClerkUser(userId: string, signal: AbortSignal, reason = ''): Promise<ClerkUser> {
  return ask({ service: 'clerk', action: 'ban', userId, reason }, signal)
}

export function unbanClerkUser(userId: string, signal: AbortSignal): Promise<ClerkUser> {
  return ask({ service: 'clerk', action: 'unban', userId }, signal)
}

/** Signs the person out of every device. Returns how many sessions it ended. */
export function revokeClerkSessions(userId: string, signal: AbortSignal): Promise<{ revoked: number }> {
  return ask({ service: 'clerk', action: 'revoke_sessions', userId }, signal)
}

/** A one-time link that signs in AS this person for ten minutes. Treat it like a password. */
export function impersonateClerkUser(userId: string, signal: AbortSignal): Promise<{ url: string | null }> {
  return ask({ service: 'clerk', action: 'impersonate', userId }, signal)
}

export type IssueAction = 'resolve' | 'ignore' | 'unresolve'

export function setSentryIssueStatus(issueId: string, action: IssueAction, signal: AbortSignal): Promise<{ ok: true }> {
  return ask({ service: 'sentry', action, issueId }, signal)
}

/** A test notification to one account; with no id, to the signed-in admin. */
export function sendTestPush(userId: string | undefined, signal: AbortSignal): Promise<{ sent: boolean }> {
  return ask({ service: 'onesignal', action: 'test_push', ...(userId ? { userId } : {}) }, signal)
}

export interface PostHogRecording {
  id: string
  startedAt: string | null
  seconds: number
  clicks: number
  startPath: string | null
  /** The recording in PostHog's own player. */
  url: string
}

export function fetchPostHogRecordings(signal: AbortSignal): Promise<PostHogRecording[]> {
  return ask({ service: 'posthog', view: 'recordings' }, signal)
}
