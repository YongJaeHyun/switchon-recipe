import { describe, expect, it } from 'vitest';
import {
  formatClock,
  highlight,
  parseCookingStep,
  splitSentences,
  stepTimer,
  type Piece,
} from './cookingSteps';

// 사례는 실제 DB recipe.cooking_steps(최근 40개)에서 골랐다
const marked = (pieces: Piece[]) => pieces.filter((p) => p.mark).map((p) => `${p.mark}:${p.text}`);
const joined = (pieces: Piece[]) => pieces.map((p) => p.text).join('');

describe('splitSentences', () => {
  it('문장 끝(. ! ?) 뒤 띄어쓰기에서 나눈다', () => {
    expect(
      splitSentences(
        '닭가슴살은 한입 크기로 썰고 소금, 후추로 밑간을 합니다. 두부는 물기를 제거하고 으깨어 준비합니다. 양파와 버섯은 채 썰거나 먹기 좋게 썰어둡니다.'
      )
    ).toEqual([
      '닭가슴살은 한입 크기로 썰고 소금, 후추로 밑간을 합니다.',
      '두부는 물기를 제거하고 으깨어 준비합니다.',
      '양파와 버섯은 채 썰거나 먹기 좋게 썰어둡니다.',
    ]);
  });

  it('한 문장이면 그대로 한 줄', () => {
    expect(splitSentences('그릇에 통깨를 뿌려 마무리합니다.')).toEqual([
      '그릇에 통깨를 뿌려 마무리합니다.',
    ]);
  });

  it('소수점(1.5cm)에서는 나누지 않는다', () => {
    expect(
      splitSentences('두부는 물기를 완전히 제거한 후, 1.5cm 두께로 먹기 좋게 썰어줍니다.')
    ).toHaveLength(1);
  });

  it('마침표 없는 문장도 남긴다', () => {
    expect(splitSentences('물기를 뺍니다. 접시에 담아 완성')).toEqual([
      '물기를 뺍니다.',
      '접시에 담아 완성',
    ]);
  });

  it('괄호 안의 마침표에서는 나누지 않는다', () => {
    expect(splitSentences('소스를 붓습니다(약간. 정도) 그리고 섞습니다.')).toHaveLength(1);
  });

  it('빈 문장은 버린다', () => {
    expect(splitSentences('  ')).toEqual([]);
  });
});

describe('highlight', () => {
  it('양(숫자+단위)은 amount', () => {
    expect(
      marked(highlight('작은 그릇에 무맛 단백질 파우더 1스쿱과 물 50ml를 넣고 잘 섞어요.'))
    ).toEqual(['amount:1스쿱', 'amount:50ml']);
    expect(marked(highlight('팬에 올리브유 1/2큰술을 두르고'))).toEqual(['amount:1/2큰술']);
    expect(marked(highlight('물(또는 육수) 200ml를 붓고'))).toEqual(['amount:200ml']);
    expect(marked(highlight('레몬 1/4개를 잘라 즙을 뿌려'))).toEqual(['amount:1/4개']);
    expect(marked(highlight('물 1~2큰술을 넣어'))).toEqual(['amount:1~2큰술']);
    expect(marked(highlight('메밀국수 30g을 넣어'))).toEqual(['amount:30g']);
    expect(marked(highlight('소금 1/4작은술과 후추 약간'))).toEqual(['amount:1/4작은술']);
    expect(marked(highlight('물 2큰술을 넣고'))).toEqual(['amount:2큰술']);
  });

  it('숫자를 한글로 쓴 숟가락 양도 amount', () => {
    expect(marked(highlight('소금 두 꼬집과 후추 약간으로'))).toEqual(['amount:두 꼬집']);
    expect(marked(highlight('연두부를 한 스푼 떠서'))).toEqual(['amount:한 스푼']);
  });

  it('길이(cm)는 강조하지 않는다', () => {
    expect(marked(highlight('1.5cm 두께로 썰어요'))).toEqual([]);
    expect(marked(highlight('먹기 좋은 크기(약 3~4cm)로'))).toEqual([]);
  });

  it('불 세기·시간·온도는 heat', () => {
    expect(marked(highlight('다진 마늘과 대파를 넣고 중간 불에서 볶아'))).toEqual(['heat:중간 불']);
    expect(marked(highlight('고춧가루를 넣고 약불에서 볶아'))).toEqual(['heat:약불']);
    expect(marked(highlight('중약불에서 5~7분간 끓입니다'))).toEqual(['heat:중약불', 'heat:5~7분']);
    expect(marked(highlight('센 불로 끓이다가 센불을 유지'))).toEqual(['heat:센 불', 'heat:센불']);
    expect(marked(highlight('대파를 넣고 한소끔 더 끓여줍니다.'))).toEqual(['heat:한소끔']);
    expect(marked(highlight('30초 정도 데치고'))).toEqual(['heat:30초']);
    expect(marked(highlight('180°C로 예열된 오븐에 12~15분간 굽습니다'))).toEqual([
      'heat:180°C',
      'heat:12~15분',
    ]);
    expect(marked(highlight('에어프라이어 180도에서 10-12분'))).toEqual([
      'heat:180도',
      'heat:10-12분',
    ]);
    expect(marked(highlight('1시간 30분 동안 재워요'))).toEqual(['heat:1시간 30분']);
  });

  it('"부분"·"3분의 1"처럼 시간이 아닌 분은 강조하지 않는다', () => {
    expect(marked(highlight('대파 흰 부분을 넣고'))).toEqual([]);
    expect(marked(highlight('양념의 3분의 1을 넣어'))).toEqual([]);
  });

  it('글자는 하나도 바꾸지 않는다', () => {
    const s = '중불로 달군 팬에 올리브 오일 1/2큰술을 두르고 3-4분간 굽습니다.';
    expect(joined(highlight(s))).toBe(s);
  });
});

describe('parseCookingStep: 괄호 팁', () => {
  it('괄호 속 문장은 팁 상자로 빼고 본문에서 지운다', () => {
    const step = parseCookingStep(
      '고춧가루를 넣고 약불에서 타지 않게 볶아 고추기름을 만듭니다. (필요시 물 1~2큰술을 넣어 타는 것을 방지할 수 있습니다.)'
    );
    expect(step.lines.map(joined)).toEqual([
      '고춧가루를 넣고 약불에서 타지 않게 볶아 고추기름을 만듭니다.',
    ]);
    expect(step.tips.map(joined)).toEqual([
      '필요시 물 1~2큰술을 넣어 타는 것을 방지할 수 있습니다.',
    ]);
    // 팁 안의 양도 강조
    expect(marked(step.tips[0])).toEqual(['amount:1~2큰술']);
  });

  it('마침표 없는 괄호 문장(~하세요)도 팁', () => {
    const step = parseCookingStep('다진 마늘을 넣고 볶아요 (마늘이 타지 않도록 주의하세요)');
    expect(step.tips.map(joined)).toEqual(['마늘이 타지 않도록 주의하세요']);
    expect(step.lines.map(joined)).toEqual(['다진 마늘을 넣고 볶아요']);
  });

  it('문장이 끝난 뒤 따로 붙은 설명 괄호도 팁', () => {
    const step = parseCookingStep(
      '달군 팬에 올리브유를 살짝 두르고 연어를 올려 껍질 쪽부터 노릇하게 굽고, 뒤집어서 속까지 익힙니다. (에어프라이어 180도에서 10-12분 조리 가능)'
    );
    expect(step.tips.map(joined)).toEqual(['에어프라이어 180도에서 10-12분 조리 가능']);
    // 다른 방법(팁) 속 시간으로 타이머를 만들지 않는다
    expect(step.timer).toBeNull();
  });

  it('짧은 대안·선택 괄호는 본문에 남긴다', () => {
    for (const s of [
      '물(또는 육수) 200ml를 붓고 국간장, 액젓을 넣어 끓입니다.',
      '작은 볼에 간장, 물, 에리스리톨(선택 사항), 다진 생강(선택 사항)을 넣어요.',
      '소금, 후추, 허브 가루(로즈마리, 타임 등)를 뿌려 10분간 마리네이드합니다.',
      '먹기 좋은 크기(약 3~4cm)로 썰어줍니다.',
      '큰 그릇에 잡곡밥을 소량 담거나 (생략 가능), 밥 없이 채소를 깔아요.',
      '양념장(간장 1큰술, 참기름 1작은술, 다진 마늘 1/2작은술, 후추 약간)을 만들어요.',
    ]) {
      const step = parseCookingStep(s);
      expect(step.tips).toEqual([]);
      expect(step.lines.map(joined).join(' ')).toBe(s);
    }
  });

  it('괄호가 여러 개면 팁도 여러 개, 남는 괄호는 본문에', () => {
    const step = parseCookingStep(
      '연어는 물기를 제거해요(또는 물). 다진 마늘을 올려요. (선택 사항으로 다진 마늘을 올려주면 풍미가 더 좋습니다.) 180°C로 굽습니다. (연어의 두께와 기기에 따라 조리 시간을 조절하세요.)'
    );
    expect(step.lines.map(joined)).toEqual([
      '연어는 물기를 제거해요(또는 물).',
      '다진 마늘을 올려요.',
      '180°C로 굽습니다.',
    ]);
    expect(step.tips.map(joined)).toEqual([
      '선택 사항으로 다진 마늘을 올려주면 풍미가 더 좋습니다.',
      '연어의 두께와 기기에 따라 조리 시간을 조절하세요.',
    ]);
  });

  it('문장 가운데의 팁 괄호를 빼도 띄어쓰기·문장부호가 어색하지 않다', () => {
    const step = parseCookingStep(
      '닭가슴살은 결대로 찢어요 (생닭가슴살은 미리 삶아도 됩니다.), 그리고 접시에 담아요.'
    );
    expect(step.lines.map(joined)).toEqual(['닭가슴살은 결대로 찢어요, 그리고 접시에 담아요.']);
  });

  it('짝이 안 맞는 괄호는 그대로 둔다', () => {
    const s = '물을 붓고 (중불에서 끓여요.';
    expect(parseCookingStep(s).lines.map(joined).join(' ')).toBe(s);
  });
});

describe('stepTimer: 단계의 타이머 시간', () => {
  it('본문의 첫 번째 시간 표현', () => {
    expect(stepTimer('두부·곤약면을 넣고 5분간 더 끓입니다.')).toEqual({
      seconds: 300,
      label: '5분',
    });
    expect(stepTimer('연어를 올려 3-4분간 굽습니다. 뒤집어서 다른 면도 2-3분간 굽습니다.')).toEqual(
      { seconds: 240, label: '4분' }
    );
  });

  it('범위면 큰 쪽', () => {
    expect(stepTimer('약 7~10분간 볶아줍니다.')?.seconds).toBe(600);
    expect(stepTimer('10~20초간 불립니다.')).toEqual({ seconds: 20, label: '20초' });
  });

  it('시간+분, 소수', () => {
    expect(stepTimer('1시간 30분 재워요')).toEqual({ seconds: 5400, label: '1시간 30분' });
    expect(stepTimer('1.5분 볶아요')).toEqual({ seconds: 90, label: '1분 30초' });
    expect(stepTimer('2시간 재워요')).toEqual({ seconds: 7200, label: '2시간' });
  });

  it('시간이 없으면(한소끔 포함) null', () => {
    expect(stepTimer('대파를 넣고 한소끔 더 끓여줍니다.')).toBeNull();
    expect(stepTimer('그릇에 담아요.')).toBeNull();
  });

  it('parseCookingStep은 본문(팁 제외)에서 타이머를 찾는다', () => {
    expect(
      parseCookingStep(
        '수프가 끓으면 약 20분간 끓입니다. (닭가슴살을 넣을 경우 5분 먼저 넣어 익힙니다.)'
      ).timer
    ).toEqual({ seconds: 1200, label: '20분' });
  });
});

describe('formatClock', () => {
  it('분:초, 한 시간 넘으면 시:분:초', () => {
    expect(formatClock(252)).toBe('04:12');
    expect(formatClock(0)).toBe('00:00');
    expect(formatClock(5400)).toBe('1:30:00');
    expect(formatClock(-3)).toBe('00:00');
  });
});
