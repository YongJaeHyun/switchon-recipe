// 조리 순서 한 단계(문단)를 따라 하기 좋게 나눈다: 문장별 줄, 양·불 세기·시간 강조, 괄호 속 팁 분리, 타이머 시간.
// 레시피 문장 자체는 바꾸지 않는다 (나누기·강조만). 사례는 cookingSteps.test.ts (실제 DB 문장)

export type Mark = 'amount' | 'heat';
export type Piece = { text: string; mark?: Mark };
export type StepTimer = { seconds: number; label: string };
export type CookingStep = {
  // 본문 문장마다 한 줄
  lines: Piece[][];
  // 괄호에서 뺀 팁 (💡 상자)
  tips: Piece[][];
  // 본문의 첫 시간 표현 (팁 속 시간은 다른 방법·참고라서 쓰지 않는다)
  timer: StepTimer | null;
};

const NUM = String.raw`\d+(?:[./]\d+)?`;
const NUM_RANGE = String.raw`${NUM}(?:\s?[~\-–]\s?${NUM})?`;
// "1시간 30분", "2시간"
const HOURS = String.raw`${NUM}\s?시간(?:\s?\d+\s?분(?!의))?`;
// "5분", "3-4분", "30초" ("3분의 1"은 시간이 아니다)
const MIN_SEC = String.raw`${NUM_RANGE}\s?(?:분(?!의)|초)`;
const TIME = `${HOURS}|${MIN_SEC}`;
// 오븐·에어프라이어 온도
const TEMPERATURE = String.raw`\d{2,3}\s?(?:°C|℃|도)(?=에서|로|$|[\s,.)])`;
const HEAT_WORDS = String.raw`중약불|약중불|중강불|중불|강불|약불|(?:센|약한|강한|중간)\s?불|한소끔`;
// 길이(cm)는 양이 아니라서 뺀다
const AMOUNT = String.raw`${NUM_RANGE}\s?(?:ml|mL|ML|kg|g|L|cc|큰술|작은술|티스푼|스푼|숟가락|스쿱|컵|꼬집|줌|개|장|쪽|알|조각|봉지|팩|캔|모)(?![A-Za-z])`;
const WORD_AMOUNT = String.raw`(?<![가-힣])(?:한|두|세|네|반)\s?(?:큰술|작은술|스푼|숟가락|스쿱|컵|꼬집|줌|장|개)(?![월소면])`;

// 첫 번째 묶음 = 불 세기·시간, 두 번째 = 양. 이름 붙은 묶음(?<name>)은 Hermes에서 groups가 비어 쓰지 않는다
const MARK_RE = new RegExp(
  `(${TIME}|${TEMPERATURE}|${HEAT_WORDS})|(${AMOUNT}|${WORD_AMOUNT})`,
  'g'
);
const TIME_RE = new RegExp(TIME);

export function highlight(text: string): Piece[] {
  const pieces: Piece[] = [];
  let last = 0;
  for (const match of text.matchAll(MARK_RE)) {
    const start = match.index ?? 0;
    if (start > last) pieces.push({ text: text.slice(last, start) });
    pieces.push({ text: match[0], mark: match[1] !== undefined ? 'heat' : 'amount' });
    last = start + match[0].length;
  }
  if (last < text.length) pieces.push({ text: text.slice(last) });
  return pieces;
}

// 문장 끝(. ! ?) 뒤에 띄어쓰기가 오면 나눈다. 괄호 안·소수점(1.5cm)에서는 나누지 않는다
export function splitSentences(text: string): string[] {
  const sentences: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '(') depth++;
    else if (ch === ')') depth = Math.max(0, depth - 1);
    else if (depth === 0 && /[.!?]/.test(ch) && /\s/.test(text[i + 1] ?? '')) {
      sentences.push(text.slice(start, i + 1));
      start = i + 1;
    }
  }
  sentences.push(text.slice(start));
  return sentences.map((s) => s.trim()).filter(Boolean);
}

// 괄호를 팁으로 뺄지: 괄호 속이 문장("~합니다", "~하세요")이거나, 문장이 끝난 뒤 따로 붙은 설명("익힙니다. (각 면 3-4분)").
// "(또는 육수)", "(선택 사항)", "(약 3~4cm)", "(간장 1큰술, …)"처럼 낱말에 붙은 짧은 대안·설명은 본문에 남긴다
function isTip(content: string, before: string) {
  const inner = content.trim();
  if (/[다요][.!]?$/.test(inner)) return true;
  return /[.!?]$/.test(before.trimEnd()) && /\s/.test(inner);
}

function splitTips(step: string): { body: string; tips: string[] } {
  const tips: string[] = [];
  let body = '';
  let i = 0;
  while (i < step.length) {
    const open = step.indexOf('(', i);
    if (open < 0) break;
    let depth = 0;
    let close = -1;
    for (let j = open; j < step.length; j++) {
      if (step[j] === '(') depth++;
      else if (step[j] === ')' && --depth === 0) {
        close = j;
        break;
      }
    }
    // 짝이 안 맞으면 그대로 둔다
    if (close < 0) break;
    const before = body + step.slice(i, open);
    const content = step.slice(open + 1, close);
    if (isTip(content, before)) {
      tips.push(content.trim());
      const after = step.slice(close + 1);
      body = before.trimEnd();
      // 빼낸 자리 뒤가 문장부호면 붙이고, 아니면 한 칸 띄운다
      if (after.trim() && !/^\s*[,.!?)]/.test(after)) body += ' ';
      i = close + 1;
      while (i < step.length && /\s/.test(step[i])) i++;
    } else {
      body = before + step.slice(open, close + 1);
      i = close + 1;
    }
  }
  body += step.slice(i);
  return { body, tips };
}

const parseNumber = (raw: string) => {
  if (raw.includes('/')) {
    const [a, b] = raw.split('/').map(Number);
    return b ? a / b : Number.NaN;
  }
  return Number(raw);
};

export function formatDuration(totalSeconds: number) {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return [h && `${h}시간`, m && `${m}분`, s && `${s}초`].filter(Boolean).join(' ') || '0초';
}

// 글의 첫 번째 시간 표현을 타이머 시간으로. 범위("3-4분")면 큰 쪽. "한소끔"처럼 숫자가 없으면 null
export function stepTimer(text: string): StepTimer | null {
  const match = TIME_RE.exec(text);
  if (!match) return null;
  const expr = match[0];
  let seconds: number;
  const hours = /^([\d./]+)\s?시간(?:\s?(\d+)\s?분)?/.exec(expr);
  if (hours) {
    seconds = parseNumber(hours[1]) * 3600 + Number(hours[2] ?? 0) * 60;
  } else {
    const numbers = expr.match(/\d+(?:[./]\d+)?/g) ?? [];
    const upper = Math.max(...numbers.map(parseNumber));
    seconds = upper * (expr.trimEnd().endsWith('초') ? 1 : 60);
  }
  seconds = Math.round(seconds);
  if (!Number.isFinite(seconds) || seconds <= 0) return null;
  return { seconds, label: formatDuration(seconds) };
}

export function parseCookingStep(step: string): CookingStep {
  const { body, tips } = splitTips(String(step ?? ''));
  return {
    lines: splitSentences(body).map(highlight),
    tips: tips.map(highlight),
    timer: stepTimer(body),
  };
}

// 타이머 표시: "04:12", 한 시간 넘으면 "1:30:00"
export function formatClock(totalSeconds: number) {
  const t = Math.max(0, Math.ceil(totalSeconds));
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const s = t % 60;
  const mmss = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return h ? `${h}:${mmss}` : mmss;
}
