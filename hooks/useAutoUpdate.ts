import { VersionAPI } from 'api/VersionAPI';
import { STORE_URL } from 'const/const';
import Constants from 'expo-constants';
import * as Updates from 'expo-updates';
import { useEffect, useRef, useState } from 'react';
import { Alert, AppState, Linking } from 'react-native';
import semver from 'semver';
import { captureError } from 'utils/sendError';

export const useAutoUpdate = () => {
  const appState = useRef(AppState.currentState);

  const [isUpdated, setIsUpdated] = useState(false);

  const redirectToStore = () => {
    Linking.openURL(STORE_URL);
  };

  useEffect(() => {
    const checkCurrentVersion = async () => {
      try {
        const appVersion = Constants.expoConfig?.version;
        const latestVersion = (await VersionAPI.selectLatestVersion()) ?? '1.0.0';

        if (!appVersion) throw new Error('appVersion을 찾을 수 없습니다.');

        const currentMajor = semver.major(appVersion);
        const latestMajor = semver.major(latestVersion);
        if (latestMajor > currentMajor) {
          Alert.alert(
            '업데이트 알림',
            '새로운 버전이 출시되었어요. 업데이트를 진행해주세요.',
            [
              {
                text: '업데이트하기',
                onPress: redirectToStore,
              },
            ],
            { cancelable: false }
          );
        }
      } catch (error) {
        captureError({ error, prefix: '[useAutoUpdate]: ', level: 'fatal' });
      }
    };

    const subscription = AppState.addEventListener('change', (nextAppState) => {
      if (appState.current.match(/inactive|background/) && nextAppState === 'active') {
        checkCurrentVersion();
      }
      appState.current = nextAppState;
    });

    checkCurrentVersion();
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    const checkAndApplyUpdate = async () => {
      if (__DEV__ || !Constants.manifest2) {
        setIsUpdated(true);
        return;
      }

      try {
        const update = await Updates.checkForUpdateAsync();
        if (update.isAvailable) {
          await Updates.fetchUpdateAsync();
          await Updates.reloadAsync();
        }
      } catch (error) {
        captureError({ error, prefix: '[OTA 업데이트 실패]: ', level: 'fatal' });
      } finally {
        setIsUpdated(true);
      }
    };

    checkAndApplyUpdate();
  }, []);

  return isUpdated;
};
