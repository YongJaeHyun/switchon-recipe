const DAY_MS = 24 * 60 * 60 * 1000;
const PASS_DAYS = 35;
const MAINTENANCE_WEEK = 5;

// 'yyyy-MM-dd'로 시작하는 문자열의 날짜 부분만 읽는다 (시각이 붙어 와도). 못 읽으면 null
const ymdToUtc = (value: string): number | null => {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  return match ? Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])) : null;
};

export interface PassJourney {
  endsOn: string; // 패스가 끝나는 날 ("11월 27일")
  segments: { week: number; days: number }[]; // 패스 35일을 프로그램 주차별로 (5 = 유지기, 그 뒤도 유지기)
}

// 패스 35일이 내 다이어트 일정의 어느 주차를 덮는지. from은 패스가 시작되는 KST 날짜(오늘 또는 지금 패스가 끝나는 날)
export function passJourney({
  startDate,
  from,
}: {
  startDate: string | null;
  from: string;
}): PassJourney {
  const fromMs = ymdToUtc(from) ?? Date.now();
  const startMs = (startDate ? ymdToUtc(startDate) : null) ?? fromMs;

  const segments: PassJourney['segments'] = [];
  for (let i = 0; i < PASS_DAYS; i++) {
    const programDay = Math.max(0, Math.round((fromMs + i * DAY_MS - startMs) / DAY_MS));
    const week = Math.min(MAINTENANCE_WEEK, Math.floor(programDay / 7) + 1);
    const last = segments[segments.length - 1];
    if (last?.week === week) last.days += 1;
    else segments.push({ week, days: 1 });
  }

  const end = new Date(fromMs + PASS_DAYS * DAY_MS);
  return { endsOn: `${end.getUTCMonth() + 1}월 ${end.getUTCDate()}일`, segments };
}
