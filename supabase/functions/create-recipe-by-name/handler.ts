// 먹고 싶은 음식 이름으로 레시피 만들기 요청 처리 본체. 외부 의존성(인증, 패스, 체험·한도 rpc, Gemini, 저장)은
// deps로 받아 Vitest(node)에서 가짜로 테스트한다. URL import를 두지 않는다 (실제 연결은 index.ts).
//
// 흐름: 인증 → 입력 정리(1~30자, 따옴표·줄바꿈 제거) → 패스 확인(has_premium_access_for)
// → (패스가 없으면) 무료 체험 차감 (평생 2번, 다 썼으면 402)
// → 이름 확인 하루 10번 차감 (넘으면 429 NAME_CHECK_LIMIT, Gemini를 부르지 않음)
// → 레시피 하루 한도 차감 (consume_recipe_quota, 넘으면 429 QUOTA_EXCEEDED)
// → Gemini 텍스트로 이름 판정 (ok / adapt / reject)
//    - reject: 체험·하루 한도를 되돌리고 200 rejected. 확인 카운터는 남긴다 (= 오늘 거절된 수)
//    - ok·adapt: 확인 카운터를 되돌리고 기존 레시피 생성(텍스트·이미지·저장)
// → 생성(또는 판정)이 실패하면 체험은 되돌리고, 하루 한도는 패스 사용자만 되돌린다
//   (음식 판정 체험과 같은 규칙: 패스 없는 계정이 실패를 되풀이해 Gemini를 끝없이 부르지 못하게).
// 차감은 모두 Gemini 호출 전에 서버에서 한다.

import {
  type PremiumCheckClient,
  assertPremium,
  PremiumRequiredError,
} from '../_shared/premium.ts';
import type { PremiumQuotaDecision } from '../_shared/premiumQuota.ts';
import { type QuotaDecision, quotaExceededBody } from '../_shared/quota.ts';
import {
  buildNameCheckPrompt,
  buildRecipeByNameCommand,
  DISH_NAME_MAX,
  parseNameCheckResponse,
  recipeWeekOf,
  sanitizeDishName,
} from '../_shared/recipeNameCheck.ts';
import { programDayOf, programWeekOf } from '../_shared/week.ts';

export const MAX_BODY_BYTES = 4 * 1024;
export const NAME_CHECK_LIMIT_MESSAGE = '오늘은 더 확인할 수 없어요. 내일 다시 해 주세요';
const INVALID_NAME_MESSAGE = `음식 이름을 1~${DISH_NAME_MAX}자로 적어 주세요`;
const PASS_REQUIRED_MESSAGE = '무료 체험을 모두 썼어요. 패스로 계속 만들 수 있어요';
const INTERNAL_ERROR_BODY = { error: '레시피를 만들지 못했어요. 잠시 후 다시 시도해 주세요' };

export interface RecipeByNameInput {
  command: string;
  // 저장할 레시피 주차 (3주차까지)
  week: number;
  isZeroCarb: boolean;
  // 이름 판정이 정한 레시피 이름 (생성 결과 이름 대신 저장)
  recipeName: string;
  // adapt일 때 "이렇게 바꿨어요" 안내 (줄바꿈 구분), 그 밖에는 null
  adaptNote: string | null;
}

export interface RecipeByNameDeps {
  getUid(req: Request): Promise<string | null>;
  // has_premium_access_for 호출용 (service role 클라이언트)
  premiumClient: PremiumCheckClient;
  // 무료 체험 1번. 쓴 뒤 남은 횟수, 이미 다 썼으면 -1
  consumeTrial(uid: string): Promise<number>;
  releaseTrial(uid: string): Promise<void>;
  // 이름 확인 하루 카운터 (consume_premium_quota 'recipe_name_check')
  consumeNameCheck(uid: string): Promise<PremiumQuotaDecision>;
  releaseNameCheck(uid: string): Promise<void>;
  // 레시피 하루 한도 (consume_recipe_quota)
  consumeQuota(uid: string): Promise<QuotaDecision>;
  releaseQuota(uid: string): Promise<void>;
  getStartDate(uid: string): Promise<string | null>;
  now(): Date;
  // 이름 판정 Gemini 응답 텍스트
  checkName(prompt: string): Promise<string>;
  // 기존 레시피 생성·이미지·저장. 저장된 recipe 행을 돌려준다
  generate(input: RecipeByNameInput): Promise<unknown>;
}

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

class BadRequestError extends Error {}

const readInput = async (req: Request): Promise<{ name: string; isZeroCarb: boolean }> => {
  const declared = Number(req.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) {
    throw new BadRequestError('요청이 너무 커요');
  }
  const buffer = await req.arrayBuffer();
  if (buffer.byteLength > MAX_BODY_BYTES) throw new BadRequestError('요청이 너무 커요');

  let body: unknown;
  try {
    body = JSON.parse(new TextDecoder().decode(buffer));
  } catch {
    throw new BadRequestError('잘못된 요청입니다');
  }
  if (typeof body !== 'object' || body === null) throw new BadRequestError('잘못된 요청입니다');
  const b = body as Record<string, unknown>;

  const name = sanitizeDishName(b.name);
  if (!name) throw new BadRequestError(INVALID_NAME_MESSAGE);
  if (typeof b.isZeroCarb !== 'boolean') throw new BadRequestError('저탄수·무탄수를 골라 주세요');
  return { name, isZeroCarb: b.isZeroCarb };
};

// 되돌리기는 실패해도 로그만 남긴다 (원래 응답·오류를 가리지 않게)
const bestEffort = async (label: string, run: () => Promise<void>) => {
  try {
    await run();
  } catch (error) {
    console.error(`${label} 실패:`, error);
  }
};

export async function handleRecipeByName(req: Request, deps: RecipeByNameDeps): Promise<Response> {
  try {
    const uid = await deps.getUid(req);
    if (!uid) return json({ error: 'unauthorized' }, 401);

    let input: { name: string; isZeroCarb: boolean };
    try {
      input = await readInput(req);
    } catch (error) {
      if (error instanceof BadRequestError) return json({ error: error.message }, 400);
      throw error;
    }

    // 패스가 없으면 무료 체험을 쓴다 (남은 횟수, 패스 사용자는 null)
    let trialRemaining: number | null = null;
    try {
      await assertPremium(deps.premiumClient, uid);
    } catch (error) {
      if (!(error instanceof PremiumRequiredError)) throw error;
      const remaining = await deps.consumeTrial(uid);
      if (remaining < 0) {
        return json({ code: 'PASS_REQUIRED', error: PASS_REQUIRED_MESSAGE }, 402);
      }
      trialRemaining = remaining;
    }

    // 레시피가 저장되기 전에 끝나면 무료 체험을 되돌린다
    let saved = false;
    try {
      const result = await createWithLimits(deps, uid, input, trialRemaining);
      saved = result.saved;
      return result.response;
    } finally {
      if (trialRemaining !== null && !saved) {
        await bestEffort('무료 체험 되돌리기', () => deps.releaseTrial(uid));
      }
    }
  } catch (error) {
    // 오류 상세는 로그에만 남긴다
    console.error('음식 이름 레시피 만들기 실패:', error);
    return json(INTERNAL_ERROR_BODY, 500);
  }
}

async function createWithLimits(
  deps: RecipeByNameDeps,
  uid: string,
  input: { name: string; isZeroCarb: boolean },
  trialRemaining: number | null
): Promise<{ response: Response; saved: boolean }> {
  const nameCheck = await deps.consumeNameCheck(uid);
  if (!nameCheck.allowed) {
    return {
      response: json({ code: 'NAME_CHECK_LIMIT', error: NAME_CHECK_LIMIT_MESSAGE }, 429),
      saved: false,
    };
  }

  // 확인 카운터는 판정이 통과했거나 Gemini를 부르지 않았을 때 되돌린다
  let checkCalled = false;
  const releaseNameCheck = () =>
    bestEffort('이름 확인 카운터 되돌리기', () => deps.releaseNameCheck(uid));

  let decision: QuotaDecision;
  try {
    decision = await deps.consumeQuota(uid);
  } catch (error) {
    await releaseNameCheck();
    throw error;
  }
  if (!decision.allowed) {
    await releaseNameCheck();
    return { response: json(quotaExceededBody(decision), 429), saved: false };
  }

  const isPassUser = trialRemaining === null;
  try {
    const startDate = await deps.getStartDate(uid);
    const now = deps.now();
    const week = programWeekOf(startDate, now);
    const day = programDayOf(startDate, now);

    checkCalled = true;
    const text = await deps.checkName(
      buildNameCheckPrompt({ name: input.name, week, day, isZeroCarb: input.isZeroCarb })
    );
    const check = parseNameCheckResponse(text, input.name);
    if (check.status === 'invalid') {
      throw new Error(`이름 판정 응답 형식이 올바르지 않습니다: ${text.slice(0, 200)}`);
    }

    if (check.status === 'reject') {
      // 거절은 체험·하루 한도를 쓰지 않는다 (체험은 바깥 finally가 되돌림)
      await bestEffort('레시피 한도 되돌리기', () => deps.releaseQuota(uid));
      return { response: json({ status: 'rejected', reason: check.reason }, 200), saved: false };
    }

    await releaseNameCheck();

    const recipe = await deps.generate({
      command: buildRecipeByNameCommand({ check, isZeroCarb: input.isZeroCarb, week }),
      week: recipeWeekOf(week),
      isZeroCarb: input.isZeroCarb,
      recipeName: check.recipeName,
      adaptNote: check.status === 'adapt' ? check.changes.join('\n') : null,
    });

    const body =
      trialRemaining === null
        ? { status: 'ok', verdict: check.status, recipe }
        : { status: 'ok', verdict: check.status, recipe, trialRemaining };
    return { response: json(body, 200), saved: true };
  } catch (error) {
    if (!checkCalled) await releaseNameCheck();
    if (isPassUser) await bestEffort('레시피 한도 되돌리기', () => deps.releaseQuota(uid));
    throw error;
  }
}
