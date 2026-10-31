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

export { showErrorToast, showInfoToast, showSuccessToast };
