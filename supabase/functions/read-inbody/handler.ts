// 인바디 결과지 읽기 요청 처리 본체. 외부 의존성(인증, 한도 저장소, Gemini)은 deps로 받아
// Vitest(node)에서 가짜로 테스트한다. URL import를 두지 않는다 (실제 연결은 index.ts).
// 흐름: 인증(로그인 사용자만) -> 본문 크기/입력 검증 -> 하루 한도 차감 -> Gemini 읽기·정규화.
// 사진은 Gemini에 넘기기만 하고 저장하지 않는다. 결과도 저장하지 않는다 (앱이 칸에 채우고 사용자가 저장).
// 한도 차감 뒤 Gemini 호출·응답 해석이 실패하면 차감을 되돌린다. 결과지가 아니라 값이 전부 null인
// 경우는 Gemini 비용이 들었으므로 되돌리지 않는다.

import { kstToday } from '../_shared/kstToday.ts';
import { runWithQuota } from '../_shared/quota.ts';
import { buildInbodyPrompt, parseInbodyResponse } from './result.ts';
import { consumeDailyUsage, releaseDailyUsage, type UsageStore } from './usage.ts';

export const MAX_BODY_BYTES = 4 * 1024 * 1024;
export const INBODY_DAILY_LIMIT = 10;
export const INBODY_QUOTA_EXCEEDED_MESSAGE =
  '오늘 결과지 읽기를 모두 사용했어요 · 자정에 다시 채워져요';
const SUPPORTED_MIME_TYPES = ['image/jpeg', 'image/png'];

export interface InbodyImage {
  imageBase64: string;
  mimeType: string;
}

export interface ReadInbodyDeps {
  // 요청 JWT로 구한 uid. 없거나 유효하지 않으면 null
  getUid(req: Request): Promise<string | null>;
  now(): Date;
  // uid의 그날(KST) 사용량 행
  usageStore(uid: string, day: string): UsageStore;
  // Gemini 응답 텍스트를 돌려준다
  askGemini(prompt: string, image: InbodyImage): Promise<string>;
}

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

const INTERNAL_ERROR_BODY = { error: '결과지를 읽지 못했어요. 잠시 후 다시 시도해 주세요' };

class BadRequestError extends Error {}
class PayloadTooLargeError extends Error {}

const readBody = async (req: Request): Promise<unknown> => {
  const declared = Number(req.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) throw new PayloadTooLargeError();

  // 헤더가 없거나(청크 전송) 틀릴 수 있으므로 실제 길이도 확인한다
  const buffer = await req.arrayBuffer();
  if (buffer.byteLength > MAX_BODY_BYTES) throw new PayloadTooLargeError();

  try {
    return JSON.parse(new TextDecoder().decode(buffer));
  } catch {
    throw new BadRequestError('잘못된 요청입니다');
  }
};

const parseInput = (body: unknown): InbodyImage => {
  if (typeof body !== 'object' || body === null) throw new BadRequestError('잘못된 요청입니다');
  const b = body as Record<string, unknown>;
  if (typeof b.mimeType !== 'string' || !SUPPORTED_MIME_TYPES.includes(b.mimeType)) {
    throw new BadRequestError('JPEG 또는 PNG 사진만 읽을 수 있어요');
  }
  // data URL 접두사가 붙어 와도 순수 base64만 쓴다
  const imageBase64 =
    typeof b.imageBase64 === 'string' ? b.imageBase64.replace(/^data:[^,]*,/, '').trim() : '';
  if (!imageBase64) throw new BadRequestError('사진이 없어요');
  return { imageBase64, mimeType: b.mimeType };
};

export async function handleReadInbody(req: Request, deps: ReadInbodyDeps): Promise<Response> {
  try {
    const uid = await deps.getUid(req);
    if (!uid) return json({ error: 'unauthorized' }, 401);

    let image: InbodyImage;
    try {
      image = parseInput(await readBody(req));
    } catch (error) {
      if (error instanceof PayloadTooLargeError)
        return json({ error: '사진 용량이 너무 커요' }, 413);
      if (error instanceof BadRequestError) return json({ error: error.message }, 400);
      throw error;
    }

    // 차감과 되돌림이 같은 날 행을 쓰도록 날짜를 한 번만 정한다
    const today = kstToday(deps.now());
    const store = deps.usageStore(uid, today);
    const outcome = await runWithQuota(
      {
        consume: () => consumeDailyUsage(store, INBODY_DAILY_LIMIT),
        release: () => releaseDailyUsage(store),
      },
      async () => {
        const text = await deps.askGemini(buildInbodyPrompt(), image);
        const parsed = parseInbodyResponse(text, today);
        if (parsed.status === 'invalid') {
          throw new Error(`Gemini 응답 형식이 올바르지 않습니다: ${text.slice(0, 200)}`);
        }
        return parsed.result;
      }
    );

    if (outcome.status === 'exceeded') {
      return json(
        { code: 'INBODY_QUOTA_EXCEEDED', error: INBODY_QUOTA_EXCEEDED_MESSAGE, remaining: 0 },
        429
      );
    }
    return json({ status: 'ok', result: outcome.value }, 200);
  } catch (error) {
    // 오류 상세는 로그에만 남긴다
    console.error('인바디 결과지 읽기 실패:', error);
    return json(INTERNAL_ERROR_BODY, 500);
  }
}
