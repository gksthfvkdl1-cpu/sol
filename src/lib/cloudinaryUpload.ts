const cloud = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME?.trim()
const preset = import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET?.trim()

export function isCloudinaryUploadConfigured(): boolean {
  return Boolean(cloud && preset)
}

export function cloudinaryConfigHint(): string {
  return (
    'VITE_CLOUDINARY_CLOUD_NAME 과 VITE_CLOUDINARY_UPLOAD_PRESET 을 .env 에 설정하세요. ' +
    'Cloudinary 대시보드 → Settings → Upload → Upload presets 에서 Unsigned preset 을 만드세요.'
  )
}

/** Unsigned preset 으로 이미지 업로드 → secure URL */
export async function uploadImageToCloudinary(file: File): Promise<string> {
  if (!cloud || !preset) {
    throw new Error(cloudinaryConfigHint())
  }
  const body = new FormData()
  body.append('file', file)
  body.append('upload_preset', preset)
  body.append('folder', 'guild-war-portraits')

  const res = await fetch(`https://api.cloudinary.com/v1_1/${cloud}/image/upload`, {
    method: 'POST',
    body,
  })
  const json = (await res.json()) as {
    secure_url?: string
    error?: { message?: string }
  }
  if (!res.ok) {
    throw new Error(json.error?.message ?? `Cloudinary 업로드 실패 (${res.status})`)
  }
  const url = json.secure_url
  if (!url) throw new Error('Cloudinary 응답에 secure_url 이 없습니다.')
  return url
}
