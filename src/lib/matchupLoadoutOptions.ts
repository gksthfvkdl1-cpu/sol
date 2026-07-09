export const EQUIPMENT_OPTIONS = [
  '선봉장',
  '성기사',
  '추적자',
  '수문장',
  '암살자',
  '수호자',
  '조율자',
  '주술사',
  '복수자',
] as const

export const FORMATION_OPTIONS = [
  '기본진형',
  '밸런스진형',
  '공격진형',
  '보호진형',
] as const

export type EquipmentOption = (typeof EQUIPMENT_OPTIONS)[number]
export type FormationOption = (typeof FORMATION_OPTIONS)[number]

export function joinLoadoutSlots(a: string, b: string, c: string): string {
  return [a, b, c].map((s) => s.trim()).filter(Boolean).join(' / ')
}
