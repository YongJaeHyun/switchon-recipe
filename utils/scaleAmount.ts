// 레시피 재료 양 문구("1/2모 (약 150g)", "3-4개", "1 큰술")를 인분 배율만큼 바꾸는 순수 함수.
//
// 규칙
// - 배율 1(또는 0 이하·NaN)이면 입력을 그대로 돌려준다.
// - 문구 안의 수량을 모두 바꾼다: 괄호 속 무게("(약 150g)"), 범위 양 끝("3-4개", "2~3장"), "각 1/2개",
//   대분수("1과 1/2큰술"), 단위 앞 띄어쓰기("1 큰술")를 그대로 지킨다.
// - 숫자가 없는 문구("약간", "적당량", "기호에 따라")는 그대로 둔다. "1꼬집"은 숫자라 바꾼다.
// - 한글 수("한 꼬집", "두 꼬집", "밥 반 공기")는 단위 앞에 띄어 쓴 경우만 숫자로 바꿔 계산한다 ("두부"는 건드리지 않음).
// - 크기 표시("5x5cm", "10x15cm", "5cm x 5cm")와 %는 양이 아니므로 그대로 둔다.
//
// 표기 (주방에서 읽기 쉬운 쪽으로 하나로 맞춘다)
// - g·ml·mg·cc·kg·l: 10 이상은 정수, 10 미만은 소수 첫째 자리 ("23g", "2.5ml", "1.5kg").
// - 그 밖의 단위(큰술·작은술·개·장·쪽·모·컵·팩·캔·꼬집, 단위 없음):
//   1 미만은 가장 가까운 분수 1/8·1/4·1/3·1/2·2/3·3/4 ("1/2큰술", "2/3개"), 1/8보다 작으면 1/8,
//   1 이상은 0.5 단위 소수 ("1.5큰술", "3개"). "1과 1/2"처럼 쓰지 않는다.
// - 범위 양 끝이 같아지면 하나로 줄인다.

const METRIC_UNITS = new Set(['g', 'mg', 'kg', 'ml', 'l', 'cc']);

// 한글 수가 붙는 단위 (띄어 쓴 경우만)
const HANGUL_NUMBER_UNITS =
  '꼬집|줌|공기|스푼|숟가락|큰술|작은술|컵|개|장|쪽|모|대|팩|봉지|봉|캔|마리|줄|조각|덩이|통';
const HANGUL_NUMBERS: Record<string, string> = { 한: '1', 두: '2', 세: '3', 네: '4', 반: '0.5' };
const HANGUL_NUMBER_RE = new RegExp(
  `(^|[\\s(])(한|두|세|네|반)(?=\\s(?:${HANGUL_NUMBER_UNITS}))`,
  'g'
);

const NUM = '\\d+\\s*과\\s*\\d+\\/\\d+|\\d+(?:\\.\\d+)?(?:\\/\\d+)?';
const QUANTITY_RE = new RegExp(`(${NUM})(?:(\\s*[-~]\\s*)(${NUM}))?`, 'g');

// "1과 1/2", "1/2", "1.5", "3" → 수 (분모 0 등은 null)
const parseNumber = (text: string): number | null => {
  const mixed = text.match(/^(\d+)\s*과\s*(\d+)\/(\d+)$/);
  if (mixed) {
    const den = Number(mixed[3]);
    return den === 0 ? null : Number(mixed[1]) + Number(mixed[2]) / den;
  }
  const frac = text.match(/^(\d+(?:\.\d+)?)\/(\d+)$/);
  if (frac) {
    const den = Number(frac[2]);
    return den === 0 ? null : Number(frac[1]) / den;
  }
  const n = Number(text);
  return Number.isFinite(n) ? n : null;
};

const trimDecimal = (n: number): string => String(Number(n.toFixed(1)));

const formatMetric = (n: number): string => {
  if (n >= 10) return String(Math.round(n));
  const rounded = Math.round(n * 10) / 10;
  return trimDecimal(rounded > 0 ? rounded : 0.1);
};

const KITCHEN_FRACTIONS: [number, string][] = [
  [1 / 8, '1/8'],
  [1 / 4, '1/4'],
  [1 / 3, '1/3'],
  [1 / 2, '1/2'],
  [2 / 3, '2/3'],
  [3 / 4, '3/4'],
  [1, '1'],
];

const formatKitchen = (n: number): string => {
  if (n < 1) {
    let best = KITCHEN_FRACTIONS[0];
    for (const candidate of KITCHEN_FRACTIONS) {
      if (Math.abs(candidate[0] - n) < Math.abs(best[0] - n)) best = candidate;
    }
    return best[1];
  }
  return trimDecimal(Math.round(n * 2) / 2);
};

// 수량 바로 뒤 단위 (띄어쓰기 허용)
const unitAfter = (rest: string): string => rest.match(/^\s*([a-zA-Z]+|[가-힣]+)/)?.[1] ?? '';

// 크기·비율 표시인지: 앞이 x/×/*, 또는 뒤가 x/×/*, cm/mm, %
const isDimension = (before: string, rest: string): boolean =>
  /[x×*]\s*$/i.test(before) || /^\s*([x×*]|cm|mm|㎝|㎜|%)/i.test(rest);

export function scaleAmount(amount: string, factor: number): string {
  if (!Number.isFinite(factor) || factor <= 0 || factor === 1) return amount;

  const normalized = amount.replace(
    HANGUL_NUMBER_RE,
    (_m, prefix: string, word: string) => `${prefix}${HANGUL_NUMBERS[word]}`
  );

  return normalized.replace(
    QUANTITY_RE,
    (
      match: string,
      first: string,
      sep: string | undefined,
      second: string | undefined,
      offset: number
    ) => {
      const before = normalized.slice(0, offset);
      const rest = normalized.slice(offset + match.length);
      if (isDimension(before, rest)) return match;

      const unit = unitAfter(rest).toLowerCase();
      const format = METRIC_UNITS.has(unit) ? formatMetric : formatKitchen;

      const a = parseNumber(first);
      if (a === null) return match;
      const scaledA = format(a * factor);
      if (sep === undefined || second === undefined) return scaledA;

      const b = parseNumber(second);
      if (b === null) return match;
      const scaledB = format(b * factor);
      return scaledA === scaledB ? scaledA : `${scaledA}${sep}${scaledB}`;
    }
  );
}

// 레시피 행의 기준 인분. 1~10 정수가 아니면 null (인분 조절을 숨긴다)
export function baseServingsOf(recipe: unknown): number | null {
  if (typeof recipe !== 'object' || recipe === null) return null;
  const servings = (recipe as { servings?: unknown }).servings;
  return typeof servings === 'number' &&
    Number.isInteger(servings) &&
    servings >= 1 &&
    servings <= 10
    ? servings
    : null;
}

// 레시피 상세 인분 조절 범위: 1 ~ 6인분 (기준 인분이 6보다 크면 기준 인분까지)
export const SERVINGS_STEPPER_MIN = 1;
export const servingsStepperMax = (base: number): number => Math.max(6, base);
