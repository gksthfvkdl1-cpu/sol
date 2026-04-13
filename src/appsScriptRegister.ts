/**
 * Google Apps Script 웹 앱 — JSON POST (doPost 하나에서 분기)
 *
 * 1) 로그인: { "action": "login", "id", "password" }
 *    → users 시트 A열 id, B열 password 행과 일치 시 { "ok": true }
 *
 * 2) 공략 등록: { "action": "append", "defense1"…"comment" }
 *    → strategies 시트에 appendRow (win/lose는 0, 0 등으로 채움)
 *
 * 브라우저 CORS: 본문은 JSON이지만 Content-Type은 text/plain 으로 보냅니다.
 * doPost 에서는 그대로 JSON.parse(e.postData.contents) 하면 됩니다.
 *
 * ```js
 * function doPost(e) {
 *   const body = JSON.parse(e.postData.contents);
 *   const ss = SpreadsheetApp.openById('스프레드시트ID');
 *   if (body.action === 'login') {
 *     const sh = ss.getSheetByName('users');
 *     const rows = sh.getDataRange().getValues();
 *     for (var i = 1; i < rows.length; i++) {
 *       if (String(rows[i][0]) === String(body.id) && String(rows[i][1]) === String(body.password)) {
 *         return ContentService.createTextOutput(JSON.stringify({ ok: true }))
 *           .setMimeType(ContentService.MimeType.JSON);
 *       }
 *     }
 *     return ContentService.createTextOutput(JSON.stringify({ ok: false, error: 'ID 또는 비밀번호가 올바르지 않습니다.' }))
 *       .setMimeType(ContentService.MimeType.JSON);
 *   }
 *   if (body.action === 'append') {
 *     const sheet = ss.getSheetByName('strategies');
 *     sheet.appendRow([
 *       body.defense1, body.defense2, body.defense3,
 *       body.attack1, body.attack2, body.attack3,
 *       body.comment, 0, 0
 *     ]);
 *     return ContentService.createTextOutput(JSON.stringify({ ok: true }))
 *       .setMimeType(ContentService.MimeType.JSON);
 *   }
 *   return ContentService.createTextOutput(JSON.stringify({ ok: false, error: 'unknown action' }))
 *     .setMimeType(ContentService.MimeType.JSON);
 * }
 * ```
 */
export type RegisterGuidePayload = {
  defense1: string
  defense2: string
  defense3: string
  attack1: string
  attack2: string
  attack3: string
  comment: string
}

function parseResponseBody(text: string): void {
  const trimmed = text.trim()
  if (!trimmed) return

  let data: { ok?: boolean; success?: boolean; error?: string; message?: string }
  try {
    data = JSON.parse(trimmed) as typeof data
  } catch {
    if (/^(ok|success)$/i.test(trimmed)) return
    throw new Error('서버 응답을 해석할 수 없습니다.')
  }

  if (typeof data.error === 'string' && data.error) {
    throw new Error(data.error)
  }
  if (data.ok === false || data.success === false) {
    throw new Error(
      typeof data.message === 'string' && data.message
        ? data.message
        : '서버가 요청을 거부했습니다.',
    )
  }
}

async function postJson(
  webAppUrl: string,
  body: Record<string, unknown>,
  signal?: AbortSignal,
): Promise<void> {
  let res: Response
  try {
    // application/json 은 CORS preflight(OPTIONS)를 유발해 Apps Script에서
    // "Failed to fetch"로 끊기는 경우가 많음. text/plain 은 simple request.
    res = await fetch(webAppUrl, {
      method: 'POST',
      mode: 'cors',
      redirect: 'follow',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(body),
      signal,
    })
  } catch (err) {
    if (err instanceof TypeError) {
      throw new Error(
        '서버에 연결하지 못했습니다. Apps Script 웹 앱을 "배포"했는지, 실행 권한·액세스가 "모든 사용자(익명 포함)"인지 확인하세요.',
      )
    }
    throw err instanceof Error ? err : new Error('네트워크 오류')
  }

  const text = await res.text()
  if (!res.ok) {
    const hint = text ? `: ${text.slice(0, 200)}` : ''
    throw new Error(`요청 실패 (${res.status} ${res.statusText})${hint}`)
  }

  parseResponseBody(text)
}

export async function postLoginToAppsScript(
  webAppUrl: string,
  creds: { id: string; password: string },
  signal?: AbortSignal,
): Promise<void> {
  await postJson(
    webAppUrl,
    { action: 'login', id: creds.id, password: creds.password },
    signal,
  )
}

export async function postGuideToAppsScript(
  webAppUrl: string,
  payload: RegisterGuidePayload,
  signal?: AbortSignal,
): Promise<void> {
  await postJson(webAppUrl, { action: 'append', ...payload }, signal)
}
