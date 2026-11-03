// 요리 모드: 단계마다 그 단계 문장에 나온 재료만 보여 준다 (레시피 재료 목록에서 이름으로 찾기).
// 저장된 레시피를 바꾸지 않고 앱이 찾으므로 예전 레시피·새 레시피 모두 된다.
// 규칙: 괄호 설명은 빼고 "또는"·"/"·","로 나뉜 이름을 각각 찾는다. 긴 이름부터 잡아 겹치는 짧은 이름은 건너뛴다
// (순두부 ≠ 두부). 한 글자 이름("물")은 낱말일 때만(물기·물엿 제외).
// 양: 단계 문장에 재료 바로 뒤 양이 있으면("올리브유 1/2큰술") 그 양, 없으면 재료 목록의 전체 양

export interface StepIngredient {
  name: string;
  amount: string | null;
  isOptional: boolean;
  // amount가 이 단계 문장에 적힌 양인지 (아니면 재료 목록의 전체 양)
  fromStep: boolean;
}

type RawIngredient = { name: string; amount: string; isOptional?: boolean } | string;

const JOSA = new Set([
  '을',
  '를',
  '이',
  '가',
  '은',
  '는',
  '에',
  '과',
  '와',
  '도',
  '로',
  '만',
  '의',
  '랑',
]);
const QUANTITY_WORDS = /^(약간|적당량|조금|소량|한줌|한 줌)$/;
// 재료 이름 바로 뒤에 붙은 양 ("올리브유 1/2큰술을", "물 200ml를")
const STEP_AMOUNT =
  /^\s*(\d+(?:[./]\d+)?(?:\s*[~-]\s*\d+(?:[./]\d+)?)?\s*(?:큰술|작은술|스푼|티스푼|컵|ml|mL|L|g|kg|개|알|장|쪽|줄기|모|팩|봉지|캔|스쿱|꼬집|줌|대|T|t))/;
const isHangul = (ch: string | undefined) => !!ch && ch >= '가' && ch <= '힣';

// 꾸미는 말(다진·신선한·말린·삶은…)은 첫 낱말로 쓰지 않는다
const MODIFIER = /(은|는|한|린|진|운|친|깬|썬|된|른|인)$|^(생|건조|냉동|통)$/;
// 묶음 이름: 단계에 "버섯", "밥"처럼 묶음 이름만 나올 때 (표고버섯 → 버섯, 현미밥 → 밥)
const HEADS = ['버섯', '액젓', '육수', '가루', '소스', '오일', '고기', '밥', '면'];

interface SearchKey {
  key: string;
  // 정확한 이름이 아닌 보조 낱말 (정확한 이름을 다 찾은 뒤에 찾는다)
  fallback: boolean;
}

// 재료 이름 → 찾을 낱말들
function searchKeys(name: string): SearchKey[] {
  const alternatives = [...name.matchAll(/\(([^)]*)\)/g)]
    .map((m) => m[1].trim())
    .filter((inner) => inner.startsWith('또는'))
    .map((inner) => inner.replace(/^또는\s*/, ''));
  const base = name.replace(/\([^)]*\)/g, ' ');
  // 문자열 재료("닭가슴살 100g", "소금 약간")는 양 앞까지만
  const words = base.split(/\s+/).filter(Boolean);
  const cut = words.findIndex((w) => /\d/.test(w) || QUANTITY_WORDS.test(w));
  const core = (cut === -1 ? words : words.slice(0, cut)).join(' ');
  const parts = [core, ...alternatives]
    .flatMap((part) => part.split(/\s*(?:\/|,|또는)\s*/))
    .map((k) => k.trim())
    .filter((k) => k.length > 0);

  const fallback = new Set<string>();
  for (const part of parts) {
    const ws = part.split(/\s+/);
    if (ws.length > 1) {
      // "신선한 파슬리" → 파슬리, "생 딜" → 딜 (한 글자는 낱말일 때만 잡힌다)
      fallback.add(ws[ws.length - 1]);
      // "연어 필레" → 연어, "소고기 등심" → 소고기
      if (ws[0].length >= 2 && !MODIFIER.test(ws[0])) fallback.add(ws[0]);
    }
    const last = ws[ws.length - 1];
    for (const head of HEADS) {
      if (last.length > head.length && last.endsWith(head)) fallback.add(head);
    }
  }
  const exact = new Set(parts);
  return [
    ...[...exact].map((key) => ({ key, fallback: false })),
    ...[...fallback].filter((key) => !exact.has(key)).map((key) => ({ key, fallback: true })),
  ];
}

function findAll(text: string, key: string): number[] {
  const found: number[] = [];
  let from = 0;
  for (;;) {
    const at = text.indexOf(key, from);
    if (at === -1) return found;
    from = at + key.length;
    if (key.length === 1) {
      const before = text[at - 1];
      const after = text[at + 1];
      if (isHangul(before)) continue;
      if (isHangul(after) && !JOSA.has(after)) continue;
    }
    found.push(at);
  }
}

export function ingredientsByStep(
  steps: string[],
  ingredients: RawIngredient[]
): StepIngredient[][] {
  const items = ingredients.map((raw) =>
    typeof raw === 'string'
      ? { name: raw, amount: null, isOptional: false }
      : { name: raw.name, amount: raw.amount ?? null, isOptional: raw.isOptional === true }
  );
  // 정확한 이름을 먼저(긴 것부터), 보조 낱말은 그 뒤에 (두부면이 있으면 "면"으로 다른 재료를 잡지 않게)
  const keys = items
    .flatMap((item, index) => searchKeys(item.name).map((k) => ({ ...k, index })))
    .sort((a, b) => Number(a.fallback) - Number(b.fallback) || b.key.length - a.key.length);

  const perStep = steps.map((text) => {
    const taken: [number, number][] = [];
    const firstAt = new Map<number, number>();
    const stepAmount = new Map<number, string>();
    for (const { key, index } of keys) {
      for (const at of findAll(text, key)) {
        const end = at + key.length;
        if (taken.some(([s, e]) => at < e && end > s)) continue;
        taken.push([at, end]);
        if (!firstAt.has(index) || at < firstAt.get(index)!) firstAt.set(index, at);
        const after = text.slice(end);
        const first = after.match(STEP_AMOUNT);
        // "올리브유 1큰술 중 1/2큰술" → 이 단계에 쓰는 건 뒤의 양
        const second = first ? after.slice(first[0].length).match(/^\s*중/) : null;
        const amount = second
          ? (after.slice(first![0].length + second[0].length).match(STEP_AMOUNT)?.[1] ?? first![1])
          : first?.[1];
        if (amount && !stepAmount.has(index)) stepAmount.set(index, amount.replace(/\s+/g, ''));
      }
    }
    return [...firstAt.entries()]
      .sort((a, b) => a[1] - b[1])
      .map(([index]) => {
        const amount = stepAmount.get(index);
        return amount
          ? { ...items[index], amount, fromStep: true }
          : { ...items[index], fromStep: false };
      });
  });

  return perStep;
}
