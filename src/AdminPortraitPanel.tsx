import {
  useCallback,
  useEffect,
  useState,
  type ChangeEventHandler,
} from 'react'
import { AutocompleteField } from './AutocompleteField.tsx'
import { supabase } from './supabase/client.ts'
import {
  uploadImageToCloudinary,
  isCloudinaryUploadConfigured,
  cloudinaryConfigHint,
} from './lib/cloudinaryUpload.ts'
import { portraitKey } from './lib/portraitKey.ts'

type Row = {
  hero_key: string
  display_name: string
  image_url: string
  updated_at: string
}

type Props = {
  sessionToken: string
  heroOptions: string[]
  onPortraitsChanged: () => void
}

export function AdminPortraitPanel({
  sessionToken,
  heroOptions,
  onPortraitsChanged,
}: Props) {
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)

  const [portraitName, setPortraitName] = useState('')
  const [pendingFile, setPendingFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [uploadBusy, setUploadBusy] = useState(false)

  useEffect(() => {
    if (!pendingFile) {
      setPreviewUrl(null)
      return
    }
    const url = URL.createObjectURL(pendingFile)
    setPreviewUrl(url)
    return () => {
      URL.revokeObjectURL(url)
    }
  }, [pendingFile])

  const loadRows = useCallback(async () => {
    const { data, error } = await supabase.rpc('admin_list_hero_portraits', {
      p_session_token: sessionToken,
    })
    if (error) throw new Error(error.message)
    setRows((data ?? []) as Row[])
  }, [sessionToken])

  const refresh = useCallback(async () => {
    setErr(null)
    setLoading(true)
    try {
      await loadRows()
    } catch (e) {
      setErr(e instanceof Error ? e.message : '불러오기 실패')
    } finally {
      setLoading(false)
    }
  }, [loadRows])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const rowByKey = new Map(rows.map((r) => [r.hero_key, r]))

  const missingPortraits = heroOptions
    .filter((n) => n.trim() && !rowByKey.has(portraitKey(n)))
    .sort((a, b) => a.localeCompare(b, 'ko'))

  const clearPendingFile = () => {
    setPendingFile(null)
  }

  const onFileChosen: ChangeEventHandler<HTMLInputElement> = (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setPendingFile(file)
    setErr(null)
    setMsg(null)
  }

  const onRegister = async () => {
    const name = portraitName.trim()
    if (!pendingFile || !name) return
    if (!isCloudinaryUploadConfigured()) {
      setErr(cloudinaryConfigHint())
      return
    }
    setUploadBusy(true)
    setErr(null)
    setMsg(null)
    try {
      const imageUrl = await uploadImageToCloudinary(pendingFile)
      const { error } = await supabase.rpc('admin_upsert_hero_portrait', {
        p_session_token: sessionToken,
        p_display_name: name,
        p_image_url: imageUrl,
      })
      if (error) throw new Error(error.message)
      setMsg(`저장됨: ${name} — 방어/공격/펫 등 해당 이름이 나오는 모든 카드에 반영됩니다.`)
      setPendingFile(null)
      await refresh()
      onPortraitsChanged()
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : '등록 실패')
    } finally {
      setUploadBusy(false)
    }
  }

  const onDelete = async (displayName: string) => {
    if (!window.confirm(`초상화를 삭제할까요? (${displayName})`)) return
    setErr(null)
    setMsg(null)
    try {
      const { error } = await supabase.rpc('admin_delete_hero_portrait', {
        p_session_token: sessionToken,
        p_display_name: displayName,
      })
      if (error) throw new Error(error.message)
      setMsg('삭제했습니다.')
      await refresh()
      onPortraitsChanged()
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : '삭제 실패')
    }
  }

  const cloudOk = isCloudinaryUploadConfigured()
  const canRegister = cloudOk && Boolean(pendingFile) && Boolean(portraitName.trim()) && !uploadBusy

  return (
    <div style={{ marginBottom: '1.25rem' }}>
      <h3 className="guide-section-label" style={{ marginBottom: '0.5rem' }}>
        캐릭터 초상화 (Cloudinary)
      </h3>
      {!cloudOk ? (
        <p className="form-error" role="alert" style={{ marginBottom: '0.75rem' }}>
          {cloudinaryConfigHint()} 로컬은 <code style={{ fontSize: '0.85em' }}>seven/.env</code> 에
          위 두 변수를 넣고 <code style={{ fontSize: '0.85em' }}>npm run dev</code> 를 다시 실행하세요.
        </p>
      ) : (
        <p className="register-hint" style={{ marginBottom: '0.75rem' }}>
          <strong>이름당 한 장</strong>만 등록하면 됩니다. 방어1·공격2 등 슬롯과 무관하게, 공략에 적힌
          이름과 같으면 검색·통계 카드 어디에든 같은 이미지가 표시됩니다.
        </p>
      )}

      {err ? (
        <p className="form-error" role="alert">
          {err}
        </p>
      ) : null}
      {msg ? (
        <p className="register-hint register-hint--success" role="status">
          {msg}
        </p>
      ) : null}

      <div className="guide-admin-portrait-upload">
        <AutocompleteField
          id="adm-portrait-hero"
          label="캐릭터 이름 (공략과 동일한 표기)"
          value={portraitName}
          onChange={setPortraitName}
          options={heroOptions}
          maxSuggestions={8}
          placeholder="예: 겔리두스"
        />
        <p className="register-hint" style={{ marginTop: '0.35rem', marginBottom: '0.5rem' }}>
          목록에 없으면 직접 입력해 주세요. 이미지를 고른 뒤 <strong>등록하기</strong>를 눌러야
          Cloudinary·DB에 저장됩니다.
        </p>

        <div className="guide-admin-portrait-file-row">
          <label className="guide-btn-ghost" style={{ display: 'inline-block', cursor: 'pointer' }}>
            이미지 파일 선택
            <input
              type="file"
              accept="image/*"
              hidden
              disabled={uploadBusy}
              onChange={onFileChosen}
            />
          </label>
          {pendingFile ? (
            <span className="guide-admin-portrait-file-name">{pendingFile.name}</span>
          ) : (
            <span className="guide-admin-portrait-file-hint">선택된 파일 없음</span>
          )}
        </div>

        {previewUrl ? (
          <div className="guide-admin-portrait-preview">
            <img src={previewUrl} alt="미리보기" className="guide-admin-portrait-preview-img" />
          </div>
        ) : null}

        <div className="guide-admin-portrait-actions">
          <button
            type="button"
            className="guide-btn-ghost"
            disabled={uploadBusy || !pendingFile}
            onClick={clearPendingFile}
          >
            선택 취소
          </button>
          <button
            type="button"
            className="guide-btn-sm"
            disabled={!canRegister}
            onClick={() => void onRegister()}
          >
            {uploadBusy ? '등록 중…' : '등록하기'}
          </button>
        </div>
      </div>

      <div className="guide-match-actions" style={{ padding: '0.6rem 0' }}>
        <button
          type="button"
          className="guide-btn-ghost"
          onClick={() => void refresh()}
          disabled={loading}
        >
          {loading ? '불러오는 중…' : '목록 새로고침'}
        </button>
      </div>

      <h4 className="guide-admin-portrait-slot-title">등록된 초상화 ({rows.length}명)</h4>
      {rows.length === 0 ? (
        <p className="guide-placeholder" style={{ marginTop: 0, marginBottom: '0.85rem' }}>
          아직 등록된 초상화가 없습니다.
        </p>
      ) : (
        <ul className="guide-admin-portrait-list guide-admin-portrait-list--global">
          {rows.map((row) => (
            <li key={row.hero_key} className="guide-admin-portrait-list-item">
              <img
                className="guide-admin-portrait-thumb"
                src={row.image_url}
                alt=""
                loading="lazy"
              />
              <span className="guide-admin-portrait-name">{row.display_name}</span>
              <button
                type="button"
                className="guide-btn-ghost"
                onClick={() => void onDelete(row.display_name)}
              >
                삭제
              </button>
            </li>
          ))}
        </ul>
      )}

      {missingPortraits.length > 0 ? (
        <>
          <h4 className="guide-admin-portrait-slot-title">
            아직 초상화 없음 ({missingPortraits.length}명)
          </h4>
          <p className="register-hint" style={{ marginTop: 0, marginBottom: '0.4rem' }}>
            공략 데이터에 등장한 이름입니다. 이름을 고른 뒤 이미지 선택 → 등록하기 순으로 진행하세요.
          </p>
          <ul className="guide-admin-portrait-missing-scroll">
            {missingPortraits.map((n) => (
              <li key={n}>
                <button
                  type="button"
                  className="guide-admin-missing-chip"
                  onClick={() => setPortraitName(n)}
                >
                  {n}
                </button>
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </div>
  )
}
