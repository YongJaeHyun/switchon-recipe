import { ToastTextProps } from 'types/toast';

const INGREDIENT_REQUEST_SUCCESS: ToastTextProps = {
  title: '재료 요청 성공',
  subtitle: '소중한 의견 감사합니다 :)',
};
const DELETE_ACCOUNT_SUCCESS: ToastTextProps = {
  title: '회원탈퇴 성공',
  subtitle: '다시 오실 날을 기다리고 있을게요 :)',
};
const MAKE_INQUIRY_SUCCESS: ToastTextProps = {
  title: '문의사항이 등록되었습니다.',
  subtitle: '문의 남겨주셔서 감사합니다 :)',
};

const LOGIN_ERROR: ToastTextProps = {
  title: '로그인 실패',
  subtitle: '로그인에 실패했습니다.',
};
const DB_REQUEST_ERROR: ToastTextProps = {
  title: 'DB 에러 발생',
  subtitle: '에러 정보가 관리자에게 전달되었습니다. 빠른 시일 내에 조치하겠습니다.',
};
const NETWORK_ERROR: ToastTextProps = {
  title: '네트워크 에러 발생',
  subtitle: '인터넷 연결 상태를 확인해주세요.',
};
const INGREDIENT_REQUEST_ERROR: ToastTextProps = {
  title: '요청 에러 발생',
  subtitle: '에러 정보가 관리자에게 전달되었습니다. 빠른 시일 내에 조치하겠습니다 :)',
};
const RECIPE_CREATION_TEMPORARY_ERROR: ToastTextProps = {
  title: '일시적인 에러 발생',
  subtitle: '레시피 생성에 실패했습니다. 다시 시도해주세요.',
};
const RECIPE_CREATION_CANCELED: ToastTextProps = {
  title: '레시피 생성 취소',
  subtitle: '레시피 생성 요청이 취소되었습니다.',
};

const EXCEED_MAXIMUM_INGREDIENT_SELECTED: ToastTextProps = {
  title: '최대 선택 갯수 초과',
  subtitle: '재료는 최대 10개까지 선택할 수 있어요!',
};

export const SuccessToastText = {
  INGREDIENT_REQUEST_SUCCESS,
  DELETE_ACCOUNT_SUCCESS,
  MAKE_INQUIRY_SUCCESS,
};
export const ErrorToastText = {
  DB_REQUEST_ERROR,
  INGREDIENT_REQUEST_ERROR,
  RECIPE_CREATION_TEMPORARY_ERROR,
  RECIPE_CREATION_CANCELED,
  NETWORK_ERROR,
  LOGIN_ERROR,
};
export const InfoToastText = { EXCEED_MAXIMUM_INGREDIENT_SELECTED };
