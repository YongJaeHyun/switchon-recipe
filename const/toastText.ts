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

const PASS_ACTIVATED: ToastTextProps = {
  title: '패스가 활성화됐어요',
  subtitle: '스위치온 패스를 이용해보세요 :)',
};

const PASS_PRICE_CHANGED: ToastTextProps = {
  title: '결제가 취소됐어요',
  subtitle: '가격이 바뀌어 결제가 취소됐어요. 다시 시도해주세요',
};
const PASS_INVALID: ToastTextProps = {
  title: '결제 확인 실패',
  subtitle: '결제를 확인하지 못했어요. 문의사항으로 알려주세요.',
};
const PASS_VERIFY_DELAYED: ToastTextProps = {
  title: '결제 확인이 늦어지고 있어요',
  subtitle: '결제는 안전하게 저장됐어요. 잠시 후 자동으로 다시 확인할게요.',
};
const PASS_BILLING_UNAVAILABLE: ToastTextProps = {
  title: '결제를 사용할 수 없어요',
  subtitle: 'Google Play 결제를 사용할 수 없는 환경이에요. 잠시 후 다시 시도해주세요.',
};
const PASS_PURCHASE_ERROR: ToastTextProps = {
  title: '결제 실패',
  subtitle: '결제 중 문제가 생겼어요. 다시 시도해주세요.',
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
const GATEWAY_TIMEOUT_ERROR: ToastTextProps = {
  title: '서버 에러 발생',
  subtitle: '잠시 후에 다시 시도해주세요.',
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

const INGREDIENT_REQUEST_LIMIT: ToastTextProps = {
  title: '요청 한도 초과',
  subtitle: '재료 요청은 하루 5번까지 가능해요.',
};
const EXCEED_MAXIMUM_INGREDIENT_SELECTED: ToastTextProps = {
  title: '최대 선택 갯수 초과',
  subtitle: '재료는 최대 10개까지 선택할 수 있어요!',
};

export const SuccessToastText = {
  INGREDIENT_REQUEST_SUCCESS,
  DELETE_ACCOUNT_SUCCESS,
  MAKE_INQUIRY_SUCCESS,
  PASS_ACTIVATED,
};
export const ErrorToastText = {
  DB_REQUEST_ERROR,
  INGREDIENT_REQUEST_ERROR,
  RECIPE_CREATION_TEMPORARY_ERROR,
  RECIPE_CREATION_CANCELED,
  NETWORK_ERROR,
  LOGIN_ERROR,
  GATEWAY_TIMEOUT_ERROR,
  PASS_PRICE_CHANGED,
  PASS_INVALID,
  PASS_VERIFY_DELAYED,
  PASS_BILLING_UNAVAILABLE,
  PASS_PURCHASE_ERROR,
};
export const InfoToastText = { EXCEED_MAXIMUM_INGREDIENT_SELECTED, INGREDIENT_REQUEST_LIMIT };
