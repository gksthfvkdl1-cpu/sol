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
  icon_url: string
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

  // 큰 일러스트(image_url) 업로드 상태
  const [portraitName, setPortraitName] = useState('')
  const [pendingFile, setPendingFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [uploadBusy, setUploadBusy] = useState(false)

  // 인게임 아이콘(icon_url) 업로드 상태
  const [iconName, setIconName] = useState('')
  const [iconFile, setIconFile] = useState<File | null>(null)
  const [iconPreviewUrl, setIconPreviewUrl] = useState<string | null>(null)
  const [iconUploadBusy, setIconUploadBusy] = useState(false)
  const [iconErr, setIconErr] = useState<string | null>(null)
  const [iconMsg, setIconMsg] = useState<string | null>(null)

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

  useEffect(() => {
    if (!iconFile) {
      setIconPreviewUrl(null)
      return
    }
    const url = URL.createObjectURL(iconFile)
    setIconPreviewUrl(url)
    return () => {
      URL.revokeObjectURL(url)
    }
  }, [iconFile])

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

  const missingIcons = heroOptions
    .filter((n) => {
      const trimmed = n.trim()
      if (!trimmed) return false
      const k = portraitKey(trimmed)
      const row = rowByKey.get(k)
      return !row || !row.icon_url
    })
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

  const onIconFileChosen: ChangeEventHandler<HTMLInputElement> = (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setIconFile(file)
    setErr(null)
    setMsg(null)
    setIconErr(null)
    setIconMsg(null)
  }

  const clearIconFile = () => {
    setIconFile(null)
    setIconErr(null)
    setIconMsg(null)
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
      setMsg(`초상화 저장됨: ${name}`)
      setPendingFile(null)
      await refresh()
      onPortraitsChanged()
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : '등록 실패')
    } finally {
      setUploadBusy(false)
    }
  }

  const onRegisterIcon = async () => {
    setIconErr(null)
    setIconMsg(null)
    if (!isCloudinaryUploadConfigured()) {
      setIconErr(cloudinaryConfigHint())
      return
    }
    const name = iconName.trim()
    if (!name) {
      setIconErr('캐릭터 이름을 먼저 입력하세요.')
      return
    }
    if (!iconFile) {
      setIconErr('아이콘 이미지 파일을 먼저 선택하세요.')
      return
    }
    const ok = window.confirm(
      `아이콘을 등록하시겠습니까?\n캐릭터: ${name}\n파일: ${iconFile.name}`,
    )
    if (!ok) return
    setIconUploadBusy(true)
    setErr(null)
    setMsg(null)
    try {
      const url = await uploadImageToCloudinary(iconFile)
      const { error } = await supabase.rpc('upsert_hero_portrait_icon', {
        p_session_token: sessionToken,
        p_display_name: name,
        p_icon_url: url,
      })
      if (error) throw new Error(error.message)
      const okMsg = `아이콘 저장됨: ${name} — 자동 등록(스샷)에서 이 아이콘으로 캐릭터를 찾습니다.`
      setMsg(okMsg)
      setIconMsg(okMsg)
      setIconFile(null)
      await refresh()
      onPortraitsChanged()
    } catch (ex) {
      const m = ex instanceof Error ? ex.message : '아이콘 등록 실패'
      setErr(m)
      setIconErr(m)
    } finally {
      setIconUploadBusy(false)
    }
  }

  const onDelete = async (displayName: string) => {
    if (!window.confirm(`초상화/아이콘을 삭제할까요? (${displayName})`)) return
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

  const onDeleteIcon = async (displayName: string) => {
    if (!window.confirm(`아이콘만 삭제할까요? (${displayName})`)) return
    setErr(null)
    setMsg(null)
    try {
      const { error } = await supabase.rpc('clear_hero_portrait_icon', {
        p_session_token: sessionToken,
        p_display_name: displayName,
      })
      if (error) throw new Error(error.message)
      setMsg('아이콘을 삭제했습니다.')
      await refresh()
      onPortraitsChanged()
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : '아이콘 삭제 실패')
    }
  }

  const cloudOk = isCloudinaryUploadConfigured()
  const canRegister =
    cloudOk && Boolean(pendingFile) && Boolean(portraitName.trim()) && !uploadBusy
  // 아이콘 버튼은 클릭은 항상 가능하게 두고(클라우디너리 미설정/업로드 중 제외), 검증/확인 모달은 핸들러에서 처리
  const canRegisterIcon = cloudOk && !iconUploadBusy

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
          <strong>이름당 한 장</strong>만 등록하면 됩니다. 검색·통계 카드에 표시되는 큰 일러스트입니다.
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

      {/* ── 인게임 아이콘 업로드 ── */}
      <h3 className="guide-section-label" style={{ marginBottom: '0.5rem', marginTop: '1.1rem' }}>
        캐릭터 인게임 아이콘 (전적 자동 등록용)
      </h3>
      <p className="register-hint" style={{ marginBottom: '0.4rem' }}>
        인게임에서 보이는 <strong>작은 헥사 아이콘</strong>(얼굴 클로즈업)을 등록하면 스크린샷 자동
        등록의 인식 정확도가 올라갑니다. 위의 큰 일러스트와 다른 이미지로 따로 올려주세요.
      </p>
      <p className="register-hint" style={{ marginBottom: '0.75rem' }}>
        <strong>꼭 지켜주세요:</strong> ① <strong>얼굴만</strong> 잘라서 올리세요 (하단 별·레벨·LV
        숫자는 제외). ② 가능하면 <strong>정사각</strong> 비율로 자르세요. 자동 인식은 슬롯의 윗부분
        얼굴만 비교하므로, 이 두 가지가 맞으면 같은 캐릭터일 때 점수가 잘 올라옵니다.
      </p>

      <div className="guide-admin-portrait-upload guide-admin-portrait-upload--icon">
        <AutocompleteField
          id="adm-portrait-icon-hero"
          label="캐릭터 이름"
          value={iconName}
          onChange={setIconName}
          options={heroOptions}
          maxSuggestions={8}
          placeholder="예: 여포"
        />
        <p className="register-hint" style={{ marginTop: '0.35rem', marginBottom: '0.5rem' }}>
          인게임 화면을 캡쳐 후 캐릭터 헥사/원형 아이콘 부분만 잘라서 업로드하세요.
        </p>

        <div className="guide-admin-portrait-file-row">
          <label className="guide-btn-ghost" style={{ display: 'inline-block', cursor: 'pointer' }}>
            아이콘 파일 선택
            <input
              type="file"
              accept="image/*"
              hidden
              disabled={iconUploadBusy}
              onChange={onIconFileChosen}
            />
          </label>
          {iconFile ? (
            <span className="guide-admin-portrait-file-name">{iconFile.name}</span>
          ) : (
            <span className="guide-admin-portrait-file-hint">선택된 파일 없음</span>
          )}
        </div>

        {iconPreviewUrl ? (
          <div className="guide-admin-portrait-preview">
            <img
              src={iconPreviewUrl}
              alt="아이콘 미리보기"
              className="guide-admin-portrait-preview-img guide-admin-portrait-preview-img--icon"
            />
          </div>
        ) : null}

        {iconErr ? (
          <p className="form-error" role="alert" style={{ marginTop: '0.35rem' }}>
            {iconErr}
          </p>
        ) : null}
        {iconMsg ? (
          <p
            className="register-hint register-hint--success"
            role="status"
            style={{ marginTop: '0.35rem' }}
          >
            {iconMsg}
          </p>
        ) : null}

        <div className="guide-admin-portrait-actions">
          <button
            type="button"
            className="guide-btn-ghost"
            disabled={iconUploadBusy || !iconFile}
            onClick={clearIconFile}
          >
            선택 취소
          </button>
          <button
            type="button"
            className="guide-btn-sm"
            disabled={!canRegisterIcon}
            onClick={() => void onRegisterIcon()}
          >
            {iconUploadBusy ? '등록 중…' : '아이콘 등록'}
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
              {row.image_url ? (
                <img
                  className="guide-admin-portrait-thumb"
                  src={row.image_url}
                  alt=""
                  loading="lazy"
                  title="큰 일러스트"
                />
              ) : (
                <span
                  className="guide-admin-portrait-thumb guide-admin-portrait-thumb--empty"
                  title="일러스트 없음"
                  aria-hidden="true"
                />
              )}
              {row.icon_url ? (
                <img
                  className="guide-admin-portrait-thumb guide-admin-portrait-thumb--icon"
                  src={row.icon_url}
                  alt=""
                  loading="lazy"
                  title="인게임 아이콘"
                />
              ) : (
                <span
                  className="guide-admin-portrait-thumb guide-admin-portrait-thumb--icon guide-admin-portrait-thumb--empty"
                  title="아이콘 없음"
                  aria-hidden="true"
                />
              )}
              <span className="guide-admin-portrait-name">{row.display_name}</span>
              {row.icon_url ? (
                <button
                  type="button"
                  className="guide-btn-ghost"
                  onClick={() => void onDeleteIcon(row.display_name)}
                  title="아이콘만 삭제"
                >
                  아이콘 삭제
                </button>
              ) : null}
              <button
                type="button"
                className="guide-btn-ghost"
                onClick={() => void onDelete(row.display_name)}
              >
                전체 삭제
              </button>
            </li>
          ))}
        </ul>
      )}

      {missingPortraits.length > 0 ? (
        <>
          <h4 className="guide-admin-portrait-slot-title">
            아직 일러스트 없음 ({missingPortraits.length}명)
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

      {missingIcons.length > 0 ? (
        <>
          <h4 className="guide-admin-portrait-slot-title">
            아직 아이콘 없음 ({missingIcons.length}명)
          </h4>
          <p className="register-hint" style={{ marginTop: 0, marginBottom: '0.4rem' }}>
            자동 등록 정확도를 높이려면 인게임 아이콘을 추가해주세요. 이름을 누르면 위 “아이콘”
            입력란에 채워집니다.
          </p>
          <ul className="guide-admin-portrait-missing-scroll">
            {missingIcons.map((n) => (
              <li key={n}>
                <button
                  type="button"
                  className="guide-admin-missing-chip"
                  onClick={() => setIconName(n)}
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
