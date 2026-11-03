// 문의 사진 첨부 규칙. 버킷(inquiry-images) 설정과 맞춘다: 5MB, JPEG·PNG·WebP, 문의당 3장
export const INQUIRY_IMAGE_BUCKET = 'inquiry-images';
export const INQUIRY_IMAGE_MAX_COUNT = 3;
export const INQUIRY_IMAGE_MAX_BYTES = 5 * 1024 * 1024;

export type InquiryImageMimeType = 'image/jpeg' | 'image/png' | 'image/webp';

const EXTENSIONS: Record<InquiryImageMimeType, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

// 피커가 알려준 형식을 버킷이 받는 형식으로. 모르면 JPEG (quality < 1이면 피커가 JPEG로 다시 저장한다)
export function resolveInquiryImageMimeType(
  mimeType: string | null | undefined
): InquiryImageMimeType | null {
  if (!mimeType) return 'image/jpeg';
  const lower = mimeType.toLowerCase();
  if (lower === 'image/jpeg' || lower === 'image/jpg') return 'image/jpeg';
  if (lower === 'image/png' || lower === 'image/webp') return lower;
  return null;
}

// 저장 경로: {uid}/{id}.{확장자}. storage RLS가 첫 폴더를 본인 uid로 검사한다
export function makeInquiryImagePath(
  uid: string,
  id: string,
  mimeType: InquiryImageMimeType
): string {
  return `${uid}/${id}.${EXTENSIONS[mimeType]}`;
}

// 겹치지 않을 만큼의 임의 id (Hermes에는 crypto.randomUUID가 없다)
export function randomImageId(): string {
  const rand = () => Math.random().toString(36).slice(2, 10);
  return `${Date.now().toString(36)}-${rand()}${rand()}`;
}

export function isInquiryImageTooLarge(base64: string): boolean {
  const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0;
  return (base64.length / 4) * 3 - padding > INQUIRY_IMAGE_MAX_BYTES;
}

export function remainingInquiryImageSlots(selected: number): number {
  return Math.max(0, INQUIRY_IMAGE_MAX_COUNT - selected);
}
