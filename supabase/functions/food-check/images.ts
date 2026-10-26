// 편의점 판정 사진 가공: 원본(스토리지 보관용)과 썸네일(긴 변 200px)을 만든다.
// 이미지 코덱(imagescript)은 인자로 받아 Vitest(node)에서 가짜로 테스트한다. URL import를 두지 않는다.
// - JPEG(바이트도 JPEG일 때): 원본 바이트를 그대로 저장한다 (다시 인코딩하지 않아 CPU를 아낌). 디코드는 썸네일용으로만 한다.
// - PNG: 긴 변 1280px 이하로 줄여 JPEG(q80)로 다시 인코딩한다.
// 디코드 실패는 그대로 던진다 (handler가 Gemini 호출 전에 불러 차감을 되돌림).

export const ORIGINAL_LONGEST_SIDE = 1280;
export const THUMB_LONGEST_SIDE = 200;
const ORIGINAL_QUALITY = 80;
const THUMB_QUALITY = 70;

export interface CodecImage {
  width: number;
  height: number;
  // 제자리에서 크기를 바꾼다. 한쪽을 RESIZE_AUTO로 주면 비율 유지
  resize(width: number, height: number): unknown;
  encodeJPEG(quality: number): Promise<Uint8Array>;
}

export interface ImageCodec {
  decode(bytes: Uint8Array): Promise<CodecImage>;
  RESIZE_AUTO: number;
}

export interface PreparedImages {
  original: Uint8Array;
  thumb: Uint8Array;
}

const decodeBase64 = (base64: string) => Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));

// JPEG 파일 시그니처(FF D8 FF). mimeType만 믿고 PNG 바이트를 .jpg로 저장하지 않도록 바이트도 확인한다
const isJpegBytes = (bytes: Uint8Array) =>
  bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;

// 긴 변이 max보다 크면 비율을 유지해 줄인다 (키우지 않음)
const fitLongestSide = (image: CodecImage, max: number, auto: number) => {
  if (Math.max(image.width, image.height) <= max) return;
  if (image.width >= image.height) image.resize(max, auto);
  else image.resize(auto, max);
};

export async function prepareFoodCheckImages(
  codec: ImageCodec,
  input: { imageBase64: string; mimeType: string }
): Promise<PreparedImages> {
  const bytes = decodeBase64(input.imageBase64);
  const image = await codec.decode(bytes);

  let original: Uint8Array;
  if (input.mimeType === 'image/jpeg' && isJpegBytes(bytes)) {
    original = bytes;
  } else {
    fitLongestSide(image, ORIGINAL_LONGEST_SIDE, codec.RESIZE_AUTO);
    original = await image.encodeJPEG(ORIGINAL_QUALITY);
  }

  fitLongestSide(image, THUMB_LONGEST_SIDE, codec.RESIZE_AUTO);
  const thumb = await image.encodeJPEG(THUMB_QUALITY);
  return { original, thumb };
}
