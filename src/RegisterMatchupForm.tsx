import type { Dispatch, FormEvent, SetStateAction } from 'react'
import { AutocompleteField } from './AutocompleteField.tsx'

export type RegisterFormState = {
  defense1: string
  defense2: string
  defense3: string
  attack1: string
  attack2: string
  attack3: string
  pet1: string
  pet2: string
  pet3: string
  skillSlot1: string
  skillSlot2: string
  skillSlot3: string
  notes: string
}

type Props = {
  idPrefix: string
  reg: RegisterFormState
  setReg: Dispatch<SetStateAction<RegisterFormState>>
  heroOptions: string[]
  regSkillOptions: string[]
  regErr: string | null
  regMsg: string | null
  regBusy: boolean
  onSubmit: (e: FormEvent) => void
}

export function RegisterMatchupForm({
  idPrefix,
  reg,
  setReg,
  heroOptions,
  regSkillOptions,
  regErr,
  regMsg,
  regBusy,
  onSubmit,
}: Props) {
  return (
    <form onSubmit={onSubmit}>
      <div className="guide-register-grid">
        <AutocompleteField
          id={`${idPrefix}-d1`}
          label="방어1"
          value={reg.defense1}
          onChange={(v) => setReg((p) => ({ ...p, defense1: v }))}
          options={heroOptions}
          maxSuggestions={5}
        />
        <AutocompleteField
          id={`${idPrefix}-d2`}
          label="방어2"
          value={reg.defense2}
          onChange={(v) => setReg((p) => ({ ...p, defense2: v }))}
          options={heroOptions}
          maxSuggestions={5}
        />
        <AutocompleteField
          id={`${idPrefix}-d3`}
          label="방어3"
          value={reg.defense3}
          onChange={(v) => setReg((p) => ({ ...p, defense3: v }))}
          options={heroOptions}
          maxSuggestions={5}
        />
        <AutocompleteField
          id={`${idPrefix}-a1`}
          label="공격1"
          value={reg.attack1}
          onChange={(v) => setReg((p) => ({ ...p, attack1: v }))}
          options={heroOptions}
          maxSuggestions={5}
        />
        <AutocompleteField
          id={`${idPrefix}-a2`}
          label="공격2"
          value={reg.attack2}
          onChange={(v) => setReg((p) => ({ ...p, attack2: v }))}
          options={heroOptions}
          maxSuggestions={5}
        />
        <AutocompleteField
          id={`${idPrefix}-a3`}
          label="공격3"
          value={reg.attack3}
          onChange={(v) => setReg((p) => ({ ...p, attack3: v }))}
          options={heroOptions}
          maxSuggestions={5}
        />
      </div>
      <div className="guide-register-grid guide-register-pet-row">
        <AutocompleteField
          id={`${idPrefix}-pet1`}
          label="펫1"
          value={reg.pet1}
          onChange={(v) => setReg((p) => ({ ...p, pet1: v }))}
          options={heroOptions}
          maxSuggestions={5}
        />
        <AutocompleteField
          id={`${idPrefix}-pet2`}
          label="펫2"
          value={reg.pet2}
          onChange={(v) => setReg((p) => ({ ...p, pet2: v }))}
          options={heroOptions}
          maxSuggestions={5}
        />
        <AutocompleteField
          id={`${idPrefix}-pet3`}
          label="펫3"
          value={reg.pet3}
          onChange={(v) => setReg((p) => ({ ...p, pet3: v }))}
          options={heroOptions}
          maxSuggestions={5}
        />
      </div>
      <div className="guide-register-grid guide-register-skill-row">
        <div className="field">
          <label htmlFor={`${idPrefix}-sk1`}>스킬1</label>
          <select
            id={`${idPrefix}-sk1`}
            className="field-input ac-input"
            value={reg.skillSlot1}
            onChange={(e) => setReg((p) => ({ ...p, skillSlot1: e.target.value }))}
          >
            <option value="">선택</option>
            {regSkillOptions.map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor={`${idPrefix}-sk2`}>스킬2</label>
          <select
            id={`${idPrefix}-sk2`}
            className="field-input ac-input"
            value={reg.skillSlot2}
            onChange={(e) => setReg((p) => ({ ...p, skillSlot2: e.target.value }))}
          >
            <option value="">선택</option>
            {regSkillOptions.map((opt) => (
              <option key={`s2-${opt}`} value={opt}>
                {opt}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor={`${idPrefix}-sk3`}>스킬3</label>
          <select
            id={`${idPrefix}-sk3`}
            className="field-input ac-input"
            value={reg.skillSlot3}
            onChange={(e) => setReg((p) => ({ ...p, skillSlot3: e.target.value }))}
          >
            <option value="">선택</option>
            {regSkillOptions.map((opt) => (
              <option key={`s3-${opt}`} value={opt}>
                {opt}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="field" style={{ marginTop: '0.65rem' }}>
        <label htmlFor={`${idPrefix}-notes`}>코멘트 / 메모</label>
        <textarea
          id={`${idPrefix}-notes`}
          className="guide-textarea guide-textarea--register-notes"
          value={reg.notes}
          onChange={(e) => setReg((p) => ({ ...p, notes: e.target.value }))}
          placeholder="팁을 입력하세요"
        />
      </div>
      {regErr ? (
        <p className="form-error" role="alert">
          {regErr}
        </p>
      ) : null}
      {regMsg ? (
        <p className="register-hint register-hint--success" role="status">
          {regMsg}
        </p>
      ) : null}
      <button
        type="submit"
        className="guide-btn-primary-lg"
        style={{ marginTop: '0.85rem' }}
        disabled={regBusy}
      >
        {regBusy ? '등록 중…' : '등록하기'}
      </button>
    </form>
  )
}
