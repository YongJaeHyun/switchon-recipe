import { ErrorToastText, InfoToastText, SuccessToastText } from 'const/toastText';
import Toast from 'react-native-toast-message';
import { ErrorToastTextProps, InfoToastTextProps, SuccessToastTextProps } from 'types/toast';

const showSuccessToast = ({ title, subtitle, textType }: SuccessToastTextProps) => {
  if (textType !== 'CUSTOM') {
    const { title: templateTitle, subtitle: templateSubtitle } = SuccessToastText[textType];
    title = templateTitle;
    subtitle = templateSubtitle;
  }

  Toast.show({
    type: 'success',
    text1: title,
    text2: subtitle,
  });
};

const showErrorToast = ({ title, subtitle, textType }: ErrorToastTextProps) => {
  if (textType !== 'CUSTOM') {
    const { title: templateTitle, subtitle: templateSubtitle } = ErrorToastText[textType];
    title = templateTitle;
    subtitle = templateSubtitle;
  }

  Toast.show({
    type: 'error',
    text1: title,
    text2: subtitle,
  });
};

const showInfoToast = ({ title, subtitle, textType }: InfoToastTextProps) => {
  if (textType !== 'CUSTOM') {
    const { title: templateTitle, subtitle: templateSubtitle } = InfoToastText[textType];
    title = templateTitle;
    subtitle = templateSubtitle;
  }

  Toast.show({
    type: 'info',
    text1: title,
    text2: subtitle,
  });
};

// 화면을 떠난 뒤 레시피가 다 만들어졌을 때: 누르면 그 레시피로 (레시피 만들기 뒤로 가기 = 기다리지 않기)
const showRecipeReadyToast = ({
  recipeName,
  onPress,
}: {
  recipeName: string;
  onPress: () => void;
}) => {
  Toast.show({
    type: 'success',
    text1: `🍳 ${recipeName} 레시피가 완성됐어요`,
    text2: '눌러서 보러 가기',
    visibilityTime: 6000,
    onPress: () => {
      Toast.hide();
      onPress();
    },
  });
};

export { showErrorToast, showInfoToast, showRecipeReadyToast, showSuccessToast };
