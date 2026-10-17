// A list's icon, as the Bagful app stores it in `lists.emoji`: the NAME of a
// drawn icon ('bag', 'tea-cup'), or, for lists saved before the pictures
// existed, a plain emoji. Mirrors src/lib/listEmoji.ts in the app; the SVGs in
// src/assets/list-icons/ are copies of the app's, so add a new one to both.
const URLS = import.meta.glob('../assets/list-icons/*.svg', {
  query: '?url',
  import: 'default',
  eager: true,
}) as Record<string, string>

const BY_NAME: Record<string, string> = Object.fromEntries(
  Object.entries(URLS).map(([path, url]) => [path.replace(/^.*\/(.+)\.svg$/, '$1'), url]),
)

// Old emoji with a drawn twin, and the retired 'boy' / 'girl', which the app
// also shows as the bag.
const LEGACY: Record<string, string> = {
  '🛒': 'bag',
  '☕': 'tea-cup',
  '🌟': 'star',
  '❤️': 'heart',
  '🔑': 'key',
  boy: 'bag',
  girl: 'bag',
}

/** The picture for a stored value; the bag when none is set; null for an emoji drawn as text. */
export function listIconUrl(value: string | null): string | null {
  if (!value) return BY_NAME.bag!
  return BY_NAME[value] ?? BY_NAME[LEGACY[value] ?? ''] ?? null
}

/** A list's name for plain-text places (titles, search hits), emoji prefix only when it is a real one. */
export function listLabel(value: string | null, name: string): string {
  return value && listIconUrl(value) === null ? `${value} ${name}` : name
}
