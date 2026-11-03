// 문의 Slack 알림 문구 만들기 (순수). Deno 엣지 함수와 Vitest(node) 양쪽에서 로드되므로 URL import를 두지 않는다.

export const INQUIRY_IMAGE_BUCKET = 'inquiry-images';
export const INQUIRY_IMAGE_MAX = 3;
export const INQUIRY_IMAGE_LINK_DAYS = 7;
export const INQUIRY_IMAGE_LINK_SECONDS = INQUIRY_IMAGE_LINK_DAYS * 24 * 60 * 60;

// 트리거가 보낸 image_paths를 믿을 수 있는 모양으로. 옛 앱 행이나 이상한 값은 빈 배열
export const toImagePaths = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === 'string' && item.length > 0)
    .slice(0, INQUIRY_IMAGE_MAX);
};

export interface InquirySlackTextInput {
  uid: string;
  title: string;
  message: string;
  category: string | null;
  createdAtText: string;
  link: string;
  // 사진 순서대로. 서명에 실패한 사진은 null
  imageUrls: (string | null)[];
}

export const buildInquirySlackText = ({
  uid,
  title,
  message,
  category,
  createdAtText,
  link,
  imageUrls,
}: InquirySlackTextInput): string => {
  const lines = [
    '📩 새 문의가 도착했습니다!',
    '',
    `UUID: ${uid}`,
    `카테고리: ${category || '없음'}`,
    `제목: ${title}`,
    `내용: ${message}`,
    `접수일자: ${createdAtText}`,
    `링크: ${link}`,
  ];

  if (imageUrls.length > 0) {
    lines.push(
      '',
      `사진 ${imageUrls.length}장 (링크는 ${INQUIRY_IMAGE_LINK_DAYS}일 동안 열려요)`,
      ...imageUrls.map((url, i) => `사진 ${i + 1}: ${url ?? '(링크를 만들지 못했어요)'}`)
    );
  }

  return lines.join('\n');
};
