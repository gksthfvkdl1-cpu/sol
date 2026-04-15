/** matchups·DB hero_portraits.hero_key 와 동일 규칙 */
export function portraitKey(displayName: string): string {
  return displayName.trim().toLowerCase()
}
