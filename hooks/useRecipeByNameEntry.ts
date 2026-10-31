import type { PassOnlyModalView } from 'components/common/PassOnlyModal';
import { router } from 'expo-router';
import { useState } from 'react';
import { passBadgeState } from 'utils/passFeatureLabel';
import { isPassOnSale } from 'utils/passScreen';
import {
  RECIPE_BY_NAME_DESCRIPTION,
  RECIPE_BY_NAME_TITLE,
  RECIPE_BY_NAME_TRIAL_LIMIT,
  recipeByNameEntryState,
} from 'utils/recipeByName';
import { useBillingAvailable } from './useBillingAvailable';
import { usePass } from './usePass';

// 먹고 싶은 음식으로 만들기 입구(레시피 탭 카드, 탐색 결과 없음)의 공통 동작.
// 패스 상태를 알면 입구는 늘 보인다. 패스·무료 체험이 있으면 입력 화면(app/recipeByName)으로 가고, 없으면 결제 화면으로 바로
// 보내지 않고 "패스 기능이에요" 창으로 먼저 묻는다 (판매 중이 아니면 살 수 없다는 안내만)
export const useRecipeByNameEntry = () => {
  const { status } = usePass();
  const billingAvailable = useBillingAvailable();
  const entry = recipeByNameEntryState(status, billingAvailable);
  const [passModal, setPassModal] = useState<PassOnlyModalView | null>(null);

  const canUse = entry.kind === 'open' || entry.kind === 'trial';

  const press = (name = '', isZeroCarb = false) => {
    if (canUse) {
      router.push({
        pathname: '/recipeByName',
        params: { ...(name ? { name } : {}), ...(isZeroCarb ? { zero: '1' } : {}) },
      });
      return;
    }
    setPassModal({
      feature: RECIPE_BY_NAME_TITLE,
      description: RECIPE_BY_NAME_DESCRIPTION,
      trialNote: `무료 체험 ${RECIPE_BY_NAME_TRIAL_LIMIT}번을 모두 썼어요`,
      canBuy: isPassOnSale(status?.sales, billingAvailable),
    });
  };

  return {
    // 패스 상태를 모르면(로딩·오프라인) 아직 보이지 않는다
    visible: status !== undefined,
    entry,
    // 입구 배지 (패스 사용 중 / 무료 체험 N번 남음 / 잠김)
    badge: passBadgeState(status?.hasAccess === true, entry),
    press,
    passModalProps: { view: passModal, onClose: () => setPassModal(null) },
  };
};
