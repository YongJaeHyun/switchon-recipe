import { formatSlackReport } from './core.ts';
import type { ProcessReport } from './types.ts';

export const ROLLBACK_ACTION_ID = 'rollback_ingredient';
export const RESTORE_ACTION_ID = 'restore_ingredient';

const MAX_REQUEST_AGE_SEC = 5 * 60;
const SECTION_TEXT_LIMIT = 3000;

// deno-lint-ignore no-explicit-any
export type SlackBlock = Record<string, any>;

const toHex = (buffer: ArrayBuffer) =>
  [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, '0')).join('');

const timingSafeEqual = (a: string, b: string) => {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
};

// https://api.slack.com/authentication/verifying-requests-from-slack
export const verifySlackSignature = async ({
  body,
  timestamp,
  signature,
  secret,
  nowSec = Math.floor(Date.now() / 1000),
}: {
  body: string;
  timestamp: string | null;
  signature: string | null;
  secret: string;
  nowSec?: number;
}) => {
  if (!timestamp || !signature) return false;
  if (Math.abs(nowSec - Number(timestamp)) > MAX_REQUEST_AGE_SEC) return false;

  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const mac = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(`v0:${timestamp}:${body}`)
  );
  return timingSafeEqual(`v0=${toHex(mac)}`, signature);
};

// 결과 보고 + 자동 추가된 재료마다 롤백 버튼
export const buildSlackMessage = (report: ProcessReport) => {
  const text = formatSlackReport(report);
  const blocks: SlackBlock[] = [
    { type: 'section', text: { type: 'mrkdwn', text: text.slice(0, SECTION_TEXT_LIMIT) } },
  ];

  const added = report.outcomes.filter((o) => o.status === 'added' && o.ingredientId != null);
  if (added.length > 0) {
    blocks.push({
      type: 'actions',
      elements: added.map((o) => ({
        type: 'button',
        action_id: ROLLBACK_ACTION_ID,
        value: String(o.ingredientId),
        style: 'danger',
        text: { type: 'plain_text', text: `↩️ '${o.candidate.name}' 롤백` },
        confirm: {
          title: { type: 'plain_text', text: '재료 롤백' },
          text: {
            type: 'mrkdwn',
            text: `'${o.candidate.name}'을(를) 앱에서 숨길까요? 대시보드에서 is_active를 켜면 다시 살릴 수 있어요.`,
          },
          confirm: { type: 'plain_text', text: '롤백' },
          deny: { type: 'plain_text', text: '취소' },
        },
      })),
    });
  }

  if (report.hiddenIngredient) {
    const { id, name } = report.hiddenIngredient;
    blocks.push({
      type: 'actions',
      elements: [
        {
          type: 'button',
          action_id: RESTORE_ACTION_ID,
          value: String(id),
          style: 'primary',
          text: { type: 'plain_text', text: `'${name}' 다시 추가` },
          confirm: {
            title: { type: 'plain_text', text: '재료 다시 추가' },
            text: { type: 'mrkdwn', text: `숨긴 '${name}'을(를) 앱에 다시 보이게 할까요?` },
            confirm: { type: 'plain_text', text: '다시 추가' },
            deny: { type: 'plain_text', text: '취소' },
          },
        },
      ],
    });
  }

  return { text, blocks };
};

const formatKst = (date: Date) => {
  const kst = new Date(date.getTime() + 9 * 60 * 60 * 1000);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${kst.getUTCFullYear()}-${pad(kst.getUTCMonth() + 1)}-${pad(kst.getUTCDate())} ${pad(kst.getUTCHours())}:${pad(kst.getUTCMinutes())} KST`;
};

interface ActionRecord {
  ingredientId: number;
  name: string;
  userId: string;
  at: Date;
}

// 처리한 버튼만 없애고, 누가 언제 처리했는지 남김 (이미 처리됐으면 그대로)
const markActionDone = (
  blocks: SlackBlock[],
  actionId: string,
  { ingredientId, userId, at }: ActionRecord,
  label: string
): SlackBlock[] => {
  const value = String(ingredientId);
  const isTarget = (e: SlackBlock) => e.action_id === actionId && e.value === value;
  const hasButton = blocks.some((b) => b.type === 'actions' && b.elements?.some(isTarget));
  if (!hasButton) return blocks;

  const updated = blocks
    .map((b) =>
      b.type === 'actions'
        ? { ...b, elements: b.elements.filter((e: SlackBlock) => !isTarget(e)) }
        : b
    )
    .filter((b) => b.type !== 'actions' || b.elements.length > 0);

  return [
    ...updated,
    {
      type: 'context',
      elements: [{ type: 'mrkdwn', text: `${label} · <@${userId}> · ${formatKst(at)}` }],
    },
  ];
};

export const markRolledBack = (blocks: SlackBlock[], record: ActionRecord) =>
  markActionDone(blocks, ROLLBACK_ACTION_ID, record, `↩️ *${record.name}* 롤백됨`);

export const markRestored = (blocks: SlackBlock[], record: ActionRecord) =>
  markActionDone(blocks, RESTORE_ACTION_ID, record, `✅ *${record.name}* 다시 추가됨`);
