import * as Sentry from '@sentry/react-native';
import axios, { isCancel } from 'axios';
import { RecipeDB } from 'types/database';
import { showErrorToast } from 'utils/showToast';
import { UserAPI } from './UserAPI';

interface CreateRecipeProps {
  command: string;
  week: number;
  isZeroCarb: boolean;
  signal?: AbortSignal;
}

export const createRecipe = async ({
  command,
  week,
  isZeroCarb: is_zero_carb,
  signal,
}: CreateRecipeProps): Promise<RecipeDB | undefined> => {
  try {
    const session = await UserAPI.getSession();
    const response = await axios.post<RecipeDB>(
      `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/create-recipe-by-gemini`,
      { command, week, is_zero_carb },
      {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        signal,
      }
    );

    return response.data;
  } catch (error: unknown) {
    if (isCancel(error)) {
      showErrorToast({
        text1: '레시피 생성 취소',
        text2: '레시피 생성 요청이 취소되었습니다.',
        error: error as Error,
      });
    } else {
      Sentry.captureException(error, { level: 'warning' });
      showErrorToast({
        text1: '일시적인 에러 발생',
        text2: '레시피 생성에 실패했습니다. 다시 시도해주세요.',
        error: error as Error,
      });
    }
  }
};
