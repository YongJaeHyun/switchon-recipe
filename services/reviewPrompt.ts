import { RecipeAPI } from 'api/RecipeAPI';
import { STORE_URL } from 'const/const';
import { Linking } from 'react-native';
import { useReviewPromptStore } from 'stores/reviewPromptStore';
import { shouldAskAfterSave } from 'utils/reviewPrompt';
import { captureError } from 'utils/sendError';

// 레시피 저장(별) 결과를 받는다. 새로 저장에 성공해 저장한 레시피가 딱 3개가 됐으면 리뷰를 묻는다
export async function askReviewAfterSave(inserted: boolean | undefined) {
  if (inserted !== true) return;
  // 개수를 세기 전에 먼저 물어도 되는지 본다 (대부분 여기서 끝나 DB를 부르지 않는다)
  const state = useReviewPromptStore.getState();
  if (state.askedThisSession || state.failedThisSession) return;
  const count = await RecipeAPI.countSaved().catch(() => null);
  if (shouldAskAfterSave({ saved: true, count })) state.request('saved3');
}

// [좋아요]: Play 인앱 리뷰. 이 기기 빌드에 모듈이 없거나 쓸 수 없으면 스토어 페이지를 연다.
// 모듈은 네이티브라 새 스토어 빌드에만 들어 있다 → 미리 import하지 않고 누를 때 불러온다
export async function openStoreReview() {
  try {
    const StoreReview = await import('expo-store-review');
    if (await StoreReview.isAvailableAsync()) {
      await StoreReview.requestReview();
      return;
    }
  } catch (error) {
    captureError({ error, prefix: '[openStoreReview]: ' });
  }
  Linking.openURL(STORE_URL).catch(() => {});
}
