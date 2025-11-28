import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { StyleSheet, ViewStyle } from 'react-native';
import { ErrorToast, InfoToast, SuccessToast, ToastProps } from 'react-native-toast-message';
import colors from 'tailwindcss/colors';

export const toastConfig = {
  success: (props: ToastProps) => (
    <SuccessToast
      {...props}
      style={toastStyle.successToast}
      contentContainerStyle={toastStyle.toastContent}
      text1Style={toastStyle.toastText1}
      text2Style={toastStyle.toastText2}
      renderLeadingIcon={() => (
        <MaterialIcons name="check-circle" size={28} color={colors.green[600]} />
      )}
    />
  ),
  error: (props: ToastProps) => (
    <ErrorToast
      {...props}
      style={toastStyle.errorToast}
      contentContainerStyle={toastStyle.toastContent}
      text1Style={toastStyle.toastText1}
      text2Style={toastStyle.toastText2}
      renderLeadingIcon={() => <MaterialIcons name="cancel" size={28} color={colors.red[500]} />}
    />
  ),
  info: (props: ToastProps) => (
    <InfoToast
      {...props}
      style={toastStyle.infoToast}
      contentContainerStyle={toastStyle.toastContent}
      text1Style={toastStyle.toastText1}
      text2Style={toastStyle.toastText2}
      renderLeadingIcon={() => <MaterialIcons name="info" size={28} color={'#5bc0de'} />}
    />
  ),
};

const baseToastConfig = {
  borderLeftWidth: 6,
  display: 'flex',
  alignItems: 'center',
  paddingLeft: 12,
} satisfies ViewStyle;

const toastStyle = StyleSheet.create({
  successToast: {
    ...baseToastConfig,
    borderLeftColor: colors.green[600],
  },
  errorToast: {
    ...baseToastConfig,
    borderLeftColor: colors.red[500],
  },
  infoToast: {
    ...baseToastConfig,
    borderLeftColor: '#5bc0de',
  },
  toastContent: {
    paddingHorizontal: 12,
  },
  toastText1: {
    color: colors.black,
    fontSize: 14,
  },
  toastText2: {
    fontSize: 12,
  },
});
