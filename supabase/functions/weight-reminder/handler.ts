// 체중 기록 알림 배치 본체. 외부 의존성(DB)은 deps로 받아 Vitest(node)에서 가짜로 테스트한다.
// URL import를 두지 않는다 (실제 연결은 index.ts).
// 매일 09:00 KST cron이 service role로 호출한다. 알림을 켠 유저(user_setting.weight_reminder) 중
// 오늘(KST) weight_log가 없고 푸시 토큰이 있는 유저에게 notifications를 넣는다 (기존 push 함수가 발송).
// 같은 날 다시 실행해도 오늘 이미 WEIGHT_REMINDER를 받은 유저는 건너뛴다.

import { kstMidnightIso, resolveToday } from '../_shared/kstToday.ts';
import { isServiceRoleRequest } from '../_shared/serviceRole.ts';

export const CHUNK_SIZE = 100;
export const REMINDER_CHANNEL = 'REPORT';

export interface ReminderNotificationRow {
  uid: string;
  title: string;
  body: string;
  href: string;
  channel_id: string;
  type: 'WEIGHT_REMINDER';
}

export interface WeightReminderDeps {
  now(): Date;
  // weight_reminder = true인 유저 (전부, 페이지 처리는 구현이)
  fetchReminderUids(): Promise<string[]>;
  // uids(최대 CHUNK_SIZE) 중 day에 weight_log가 있는 유저
  fetchLoggedUids(uids: string[], day: string): Promise<Set<string>>;
  // uids 중 push_token이 있는 유저
  fetchPushableUids(uids: string[]): Promise<Set<string>>;
  // uids 중 sinceIso 이후 WEIGHT_REMINDER 알림을 받은 유저
  fetchRemindedUids(uids: string[], sinceIso: string): Promise<Set<string>>;
  insertNotifications(rows: ReminderNotificationRow[]): Promise<void>;
}

export interface ReminderResult {
  today: string;
  enabled: number; // 알림을 켠 유저
  sent: number;
}

const notificationFor = (uid: string): ReminderNotificationRow => ({
  uid,
  title: '오늘 체중을 기록해볼까요?',
  body: '아침 공복 체중을 기록하면 주간 리포트에서 변화를 볼 수 있어요.',
  href: '/weight',
  channel_id: REMINDER_CHANNEL,
  type: 'WEIGHT_REMINDER',
});

export async function sendWeightReminders(
  deps: WeightReminderDeps,
  today: string
): Promise<ReminderResult> {
  const uids = [...new Set(await deps.fetchReminderUids())];
  const since = kstMidnightIso(today);

  let sent = 0;
  for (let i = 0; i < uids.length; i += CHUNK_SIZE) {
    const chunk = uids.slice(i, i + CHUNK_SIZE);
    const logged = await deps.fetchLoggedUids(chunk, today);
    let targets = chunk.filter((uid) => !logged.has(uid));
    if (targets.length === 0) continue;

    const pushable = await deps.fetchPushableUids(targets);
    targets = targets.filter((uid) => pushable.has(uid));
    if (targets.length === 0) continue;

    const reminded = await deps.fetchRemindedUids(targets, since);
    targets = targets.filter((uid) => !reminded.has(uid));
    if (targets.length === 0) continue;

    await deps.insertNotifications(targets.map(notificationFor));
    sent += targets.length;
  }
  return { today, enabled: uids.length, sent };
}

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

export async function handleWeightReminder(
  req: Request,
  deps: WeightReminderDeps
): Promise<Response> {
  try {
    // ?today= 지정도 service role 확인을 통과한 뒤에만 읽는다
    if (!isServiceRoleRequest(req.headers.get('Authorization'))) {
      return json({ error: 'forbidden' }, 403);
    }
    const today = resolveToday(req, deps.now());
    if (!today) return json({ error: 'today는 yyyy-MM-dd 형식이어야 합니다' }, 400);
    return json(await sendWeightReminders(deps, today), 200);
  } catch (error) {
    // 오류 상세는 로그에만 남긴다
    console.error('체중 알림 발송 실패:', error);
    return json({ error: 'internal error' }, 500);
  }
}
