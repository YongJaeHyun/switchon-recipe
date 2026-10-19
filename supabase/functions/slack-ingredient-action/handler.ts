import {
  markRestored,
  markRolledBack,
  RESTORE_ACTION_ID,
  ROLLBACK_ACTION_ID,
  type SlackBlock,
  verifySlackSignature,
} from '../process-ingredient-request/slack.ts';

export interface SlackActionDeps {
  signingSecret: string;
  nowSec: () => number;
  // 재료 표시 여부 변경. 재료가 없으면 null
  setIngredientActive: (id: number, active: boolean) => Promise<{ name: string } | null>;
  respond: (responseUrl: string, payload: Record<string, unknown>) => Promise<void>;
}

interface SlackActionRequest {
  body: string;
  timestamp: string | null;
  signature: string | null;
}

interface BlockActionsPayload {
  type: string;
  user: { id: string };
  response_url: string;
  message: { text?: string; blocks: SlackBlock[] };
  actions: { action_id: string; value: string }[];
}

const ACTIONS = {
  [ROLLBACK_ACTION_ID]: { active: false, mark: markRolledBack },
  [RESTORE_ACTION_ID]: { active: true, mark: markRestored },
} as const;

const parsePayload = (body: string): BlockActionsPayload | null => {
  try {
    const raw = new URLSearchParams(body).get('payload');
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

// Slack 버튼(롤백 / 다시 추가) 처리. Slack은 3초 안에 200을 받아야 함
export const handleSlackAction = async (
  deps: SlackActionDeps,
  request: SlackActionRequest
): Promise<{ status: number }> => {
  const isValid = await verifySlackSignature({
    ...request,
    secret: deps.signingSecret,
    nowSec: deps.nowSec(),
  });
  if (!isValid) return { status: 401 };

  const payload = parsePayload(request.body);
  if (!payload) return { status: 400 };
  if (payload.type !== 'block_actions') return { status: 200 };

  const action = payload.actions?.[0];
  const config = action ? ACTIONS[action.action_id as keyof typeof ACTIONS] : undefined;
  const ingredientId = Number(action?.value);
  if (!config || !Number.isInteger(ingredientId)) return { status: 200 };

  const ingredient = await deps.setIngredientActive(ingredientId, config.active);

  if (!ingredient) {
    await deps.respond(payload.response_url, {
      replace_original: false,
      response_type: 'ephemeral',
      text: `재료(id ${ingredientId})를 찾을 수 없어요. 대시보드에서 확인해주세요.`,
    });
    return { status: 200 };
  }

  await deps.respond(payload.response_url, {
    replace_original: true,
    text: payload.message.text ?? '',
    blocks: config.mark(payload.message.blocks, {
      ingredientId,
      name: ingredient.name,
      userId: payload.user.id,
      at: new Date(deps.nowSec() * 1000),
    }),
  });
  return { status: 200 };
};
