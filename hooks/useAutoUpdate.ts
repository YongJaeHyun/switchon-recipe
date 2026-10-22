import { VersionAPI } from 'api/VersionAPI';
import { STORE_URL } from 'const/const';
import Constants from 'expo-constants';
import * as Updates from 'expo-updates';
import { useEffect, useRef, useState } from 'react';
import { Alert, AppState, Linking } from 'react-native';
import semver from 'semver';
import { isUpdateNetworkError, runStartupUpdate } from 'utils/otaUpdate';
import { captureError } from 'utils/sendError';

const STARTUP_UPDATE_TIMEOUT_MS = 5000;

export const useAutoUpdate = () => {
  const appState = useRef(AppState.currentState);
  const updateReady = useRef(false); // 다운로드 완료 여부를 ref로 추적

  const [isUpdated, setIsUpdated] = useState(false);

  useEffect(() => {
    // ── 네이티브 버전 체크 (스토어 업데이트 유도) ──────────────────
    const checkCurrentVersion = async () => {
      try {
        const appVersion = Constants.expoConfig?.version;
        const latestVersion = (await VersionAPI.selectLatestVersion()) ?? '1.0.0';

        if (__DEV__ || !Constants.manifest2) return;
        if (!appVersion) throw new Error('appVersion을 찾을 수 없습니다.');

        const currentMajor = semver.major(appVersion);
        const latestMajor = semver.major(latestVersion);

        if (latestMajor > currentMajor) {
          Alert.alert(
            '업데이트 알림',
            '새로운 버전이 출시되었어요. 업데이트를 진행해주세요.',
            [{ text: '업데이트하기', onPress: () => Linking.openURL(STORE_URL) }],
            { cancelable: false }
          );
        }
      } catch (error) {
        captureError({ error, prefix: '[useAutoUpdate]: ', level: 'fatal' });
      }
    };

    // ── OTA 업데이트 ─────────────────────────────────────────────
    // isEmbeddedLaunch(스토어에서 받은 그대로의 번들)도 업데이트 대상이므로 건너뛰지 않음
    const canUpdate = !__DEV__ && Updates.isEnabled;

    const markReady = () => {
      updateReady.current = true;
    };

    // 앱 시작: 스플래시를 유지한 채 최대 5초 안에 받으면 바로 재시작해 최신 버전으로 열기
    const updateOnStartup = async () => {
      try {
        if (!canUpdate) return;

        const result = await runStartupUpdate(
          {
            checkForUpdate: async () => (await Updates.checkForUpdateAsync()).isAvailable,
            fetchUpdate: async () => {
              await Updates.fetchUpdateAsync();
            },
            reload: () => Updates.reloadAsync(),
            onReadyLater: markReady,
          },
          STARTUP_UPDATE_TIMEOUT_MS
        );
        if (result === 'error') {
          captureError({ error: new Error('startup OTA failed'), prefix: '[OTA 업데이트]: ' });
        }
      } finally {
        setIsUpdated(true);
      }
    };

    // 백그라운드로 갈 때: 받아 두기만 하고 (사용 중 재시작 방지) 다음 복귀 때 적용
    const downloadInBackground = async () => {
      if (!canUpdate || updateReady.current) return;
      try {
        const update = await Updates.checkForUpdateAsync();
        if (update.isAvailable) {
          await Updates.fetchUpdateAsync();
          markReady();
        }
      } catch (error) {
        if (isUpdateNetworkError(error)) return; // 다음 백그라운드 전환 때 다시 시도
        captureError({ error, prefix: '[OTA 업데이트 다운로드 실패]: ' });
      }
    };

    const applyUpdateIfReady = async () => {
      if (!canUpdate || !updateReady.current) return;
      try {
        await Updates.reloadAsync();
      } catch (error) {
        captureError({ error, prefix: '[OTA 업데이트 적용 실패]: ', level: 'fatal' });
      }
    };

    // ── AppState 구독 (단일) ───────────────────────────────────────
    const subscription = AppState.addEventListener('change', (nextAppState) => {
      const prevState = appState.current;
      appState.current = nextAppState;

      if (prevState === 'active' && nextAppState.match(/inactive|background/)) {
        // 포그라운드 → 백그라운드: 버전 체크 + 다운로드
        checkCurrentVersion();
        downloadInBackground();
      } else if (prevState.match(/inactive|background/) && nextAppState === 'active') {
        // 백그라운드 → 포그라운드: 다운받은 업데이트 적용
        applyUpdateIfReady();
      }
    });

    // 앱 최초 실행 시에도 체크
    checkCurrentVersion();
    updateOnStartup();

    return () => subscription.remove();
  }, []);

  return isUpdated;
};
