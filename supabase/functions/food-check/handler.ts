// 편의점 판정 요청 처리 본체. 외부 의존성(인증, 한도, Gemini, DB/스토리지)은 deps로 받아
// Vitest(node)에서 가짜로 테스트한다. URL import를 두지 않는다 (실제 연결은 index.ts).
// 흐름: 인증 -> 본문 크기/입력 검증 -> 패스 확인(has_premium_access_for) -> 하루 한도 차감
// -> (사진이면) 디코드·썸네일 생성 -> Gemini 판정·해석 -> 행 저장 -> (사진이면) 원본·썸네일 업로드
// -> 행에 경로 기록. 사진 디코드를 Gemini보다 먼저 해서 깨진 사진은 AI 비용 없이 실패한다.
// 한도 차감 뒤 실패(인식 실패 포함)는 모두 차감을 되돌린다(release).

import {
  buildFoodCheckPrompt,
  type FoodCheckInput,
  type FoodCheckResult,
  parseFoodCheckResponse,
} from '../_shared/foodCheck.ts';
import {
  assertPremium,
  type PremiumCheckClient,
  PremiumRequiredError,
  premiumRequiredResponse,
} from '../_shared/premium.ts';
import {
  PREMIUM_QUOTA_EXCEEDED_MESSAGE,
  type PremiumQuotaDecision,
} from '../_shared/premiumQuota.ts';
import { runWithQuota } from '../_shared/quota.ts';
import { programDayOf, programWeekOf } from '../_shared/week.ts';
import type { PreparedImages } from './images.ts';

export const MAX_BODY_BYTES = 4 * 1024 * 1024;
export const MAX_TEXT_LENGTH = 50;
export const UNRECOGNIZED_MESSAGE = '제품명이 잘 보이게 다시 찍어주세요';
const SUPPORTED_MIME_TYPES = ['image/jpeg', 'image/png'];

// food_check 테이블 행 (snake_case 그대로)
export interface FoodCheckRow {
  id: number;
  uid: string;
  input_type: FoodCheckInput['type'];
  input_text: string | null;
  image_path: string | null;
  thumb_path: string | null;
  product_name: string | null;
  score: number | null;
  verdict: 'ok' | 'avoid' | null;
  basis: 'estimate' | 'label' | null;
  reasons: string[] | null;
  alternatives: string[] | null;
  week: number | null;
  created_at: string;
}

export type FoodCheckInsert = Omit<FoodCheckRow, 'id' | 'image_path' | 'thumb_path' | 'created_at'>;

export interface FoodCheckRecord {
  id: number;
  uid: string;
  inputType: FoodCheckInput['type'];
  inputText: string | null;
  imagePath: string | null;
  thumbPath: string | null;
  productName: string | null;
  score: number | null;
  verdict: 'ok' | 'avoid' | null;
  basis: 'estimate' | 'label' | null;
  reasons: string[] | null;
  alternatives: string[] | null;
  week: number | null;
  createdAt: string;
  thumbUrl: string | null;
}

export interface ImagePaths {
  imagePath: string;
  thumbPath: string;
}

export interface FoodCheckDeps {
  // 요청 JWT로 구한 uid. 없거나 유효하지 않으면 null
  getUid(req: Request): Promise<string | null>;
  // has_premium_access_for 호출용 (service role 클라이언트)
  premiumClient: PremiumCheckClient;
  consume(uid: string): Promise<PremiumQuotaDecision>;
  release(uid: string): Promise<void>;
  getStartDate(uid: string): Promise<string | null>;
  now(): Date;
  // Gemini 응답 텍스트를 돌려준다
  askGemini(prompt: string, input: FoodCheckInput): Promise<string>;
  insertCheck(row: FoodCheckInsert): Promise<FoodCheckRow>;
  // 사진을 디코드해 원본(JPEG는 그대로, PNG는 긴 변 1280px JPEG q80)·썸네일(긴 변 200px JPEG q70)을
  // 만든다. 디코드할 수 없으면 던진다
  prepareImages(image: { imageBase64: string; mimeType: string }): Promise<PreparedImages>;
  // 준비한 원본·썸네일을 업로드하고 경로를 돌려준다
  storeImages(uid: string, id: number, images: PreparedImages): Promise<ImagePaths>;
  updateImagePaths(id: number, paths: ImagePaths): Promise<void>;
  deleteCheck(id: number): Promise<void>;
  // 썸네일 signed URL (1시간)
  signThumbUrl(path: string): Promise<string | null>;
}

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

const INTERNAL_ERROR_BODY = { error: '판정에 실패했어요. 잠시 후 다시 시도해 주세요' };

class UnrecognizedError extends Error {
  constructor() {
    super('상품을 인식하지 못했습니다');
    this.name = 'UnrecognizedError';
  }
}

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
    throw new BadRequestError('본문이 JSON이 아닙니다');
  }
};

const parseInput = (body: unknown): FoodCheckInput => {
  if (typeof body !== 'object' || body === null) throw new BadRequestError('잘못된 요청입니다');
  const b = body as Record<string, unknown>;

  if (b.type === 'text') {
    const text = typeof b.text === 'string' ? b.text.trim() : '';
    if (text.length < 1 || text.length > MAX_TEXT_LENGTH) {
      throw new BadRequestError(`상품 이름은 1~${MAX_TEXT_LENGTH}자로 입력해 주세요`);
    }
    return { type: 'text', text };
  }

  if (b.type === 'front' || b.type === 'label') {
    if (typeof b.mimeType !== 'string' || !SUPPORTED_MIME_TYPES.includes(b.mimeType)) {
      throw new BadRequestError('JPEG 또는 PNG 사진만 판정할 수 있어요');
    }
    // data URL 접두사가 붙어 와도 순수 base64만 쓴다
    const imageBase64 =
      typeof b.imageBase64 === 'string' ? b.imageBase64.replace(/^data:[^,]*,/, '').trim() : '';
    if (!imageBase64) throw new BadRequestError('사진이 없습니다');
    return { type: b.type, imageBase64, mimeType: b.mimeType };
  }

  throw new BadRequestError('알 수 없는 판정 유형입니다');
};

const toRecord = (row: FoodCheckRow, thumbUrl: string | null): FoodCheckRecord => ({
  id: row.id,
  uid: row.uid,
  inputType: row.input_type,
  inputText: row.input_text,
  imagePath: row.image_path,
  thumbPath: row.thumb_path,
  productName: row.product_name,
  score: row.score,
  verdict: row.verdict,
  basis: row.basis,
  reasons: row.reasons,
  alternatives: row.alternatives,
  week: row.week,
  createdAt: row.created_at,
  thumbUrl,
});

const toInsert = (
  uid: string,
  input: FoodCheckInput,
  result: FoodCheckResult,
  week: number
): FoodCheckInsert => ({
  uid,
  input_type: input.type,
  input_text: input.type === 'text' ? input.text : null,
  product_name: result.productName,
  score: result.score,
  verdict: result.verdict,
  basis: result.basis,
  reasons: result.reasons,
  alternatives: result.alternatives,
  week,
});

// 행 저장 + 사진 업로드 + 경로 기록. 사진 단계가 실패하면 방금 만든 행을 지우고(최선 노력)
// 같은 오류를 던진다 (차감 되돌림은 runWithQuota가 한다).
const save = async (
  deps: FoodCheckDeps,
  uid: string,
  input: FoodCheckInput,
  result: FoodCheckResult,
  week: number,
  images: PreparedImages | null
): Promise<FoodCheckRow> => {
  const row = await deps.insertCheck(toInsert(uid, input, result, week));
  if (!images) return row;

  try {
    const paths = await deps.storeImages(uid, row.id, images);
    await deps.updateImagePaths(row.id, paths);
    return { ...row, image_path: paths.imagePath, thumb_path: paths.thumbPath };
  } catch (error) {
    try {
      await deps.deleteCheck(row.id);
    } catch (deleteError) {
      console.error('food_check 행 삭제 실패:', deleteError);
    }
    throw error;
  }
};

export async function handleFoodCheck(req: Request, deps: FoodCheckDeps): Promise<Response> {
  try {
    const uid = await deps.getUid(req);
    if (!uid) return json({ error: 'unauthorized' }, 401);

    let input: FoodCheckInput;
    try {
      input = parseInput(await readBody(req));
    } catch (error) {
      if (error instanceof PayloadTooLargeError) {
        return json({ error: '사진 용량이 너무 커요' }, 413);
      }
      if (error instanceof BadRequestError) return json({ error: error.message }, 400);
      throw error;
    }

    try {
      await assertPremium(deps.premiumClient, uid);
    } catch (error) {
      if (error instanceof PremiumRequiredError) return premiumRequiredResponse(error);
      throw error;
    }

    let outcome;
    try {
      outcome = await runWithQuota(
        { consume: () => deps.consume(uid), release: () => deps.release(uid) },
        async () => {
          // 깨진 사진은 Gemini 호출 전에 실패시킨다 (차감은 runWithQuota가 되돌림)
          const images =
            input.type === 'text'
              ? null
              : await deps.prepareImages({
                  imageBase64: input.imageBase64,
                  mimeType: input.mimeType,
                });
          const startDate = await deps.getStartDate(uid);
          const now = deps.now();
          const week = programWeekOf(startDate, now);
          const day = programDayOf(startDate, now);
          const text = await deps.askGemini(buildFoodCheckPrompt(input, week, day), input);
          const parsed = parseFoodCheckResponse(text, input.type, week);
          if (parsed.status === 'unrecognized') throw new UnrecognizedError();
          if (parsed.status === 'invalid') {
            throw new Error(`Gemini 응답 형식이 올바르지 않습니다: ${text.slice(0, 200)}`);
          }
          return save(deps, uid, input, parsed.result, week, images);
        }
      );
    } catch (error) {
      if (error instanceof UnrecognizedError) {
        return json({ status: 'unrecognized', message: UNRECOGNIZED_MESSAGE }, 200);
      }
      throw error;
    }

    if (outcome.status === 'exceeded') {
      return json(
        { code: 'PREMIUM_QUOTA_EXCEEDED', error: PREMIUM_QUOTA_EXCEEDED_MESSAGE, remaining: 0 },
        429
      );
    }

    const row = outcome.value;
    let thumbUrl: string | null = null;
    if (row.thumb_path) {
      // 판정·저장은 끝났으므로 URL 실패로 차감을 되돌리지 않는다 (앱은 경로로 다시 받을 수 있음)
      try {
        thumbUrl = await deps.signThumbUrl(row.thumb_path);
      } catch (error) {
        console.error('썸네일 signed URL 생성 실패:', error);
      }
    }

    return json({ status: 'ok', check: toRecord(row, thumbUrl) }, 200);
  } catch (error) {
    // 오류 상세는 로그에만 남긴다
    console.error('편의점 판정 실패:', error);
    return json(INTERNAL_ERROR_BODY, 500);
  }
}
