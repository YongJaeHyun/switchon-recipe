import Toast from 'react-native-toast-message';

interface ToastTextProps {
  text1: string;
  text2: string;
  error: Error;
}

const showSuccessToast = ({ text1, text2 }: ToastTextProps) => {
  Toast.show({
    type: 'success',
    text1,
    text2,
  });
};
const showErrorToast = ({ text1, text2 }: ToastTextProps) => {
  Toast.show({
    type: 'error',
    text1,
    text2,
  });
};
const showInfoToast = ({ text1, text2 }: ToastTextProps) => {
  Toast.show({
    type: 'info',
    text1,
    text2,
  });
};

export { showErrorToast, showInfoToast, showSuccessToast };
