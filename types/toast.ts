import { ErrorToastText, InfoToastText, SuccessToastText } from '../const/toastText';
interface ToastTextProps {
  title?: string;
  subtitle?: string;
}

type SuccessTextType = 'CUSTOM' | keyof typeof SuccessToastText;
type ErrorTextType = 'CUSTOM' | keyof typeof ErrorToastText;
type InfoTextType = 'CUSTOM' | keyof typeof InfoToastText;

interface SuccessToastTextProps extends ToastTextProps {
  textType: SuccessTextType;
}
interface ErrorToastTextProps extends ToastTextProps {
  textType: ErrorTextType;
}
interface InfoToastTextProps extends ToastTextProps {
  textType: InfoTextType;
}

export { ErrorToastTextProps, InfoToastTextProps, SuccessToastTextProps, ToastTextProps };
