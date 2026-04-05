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
  const updateReady = useRef(false); // 다운로드 완료 여부를 ref로 추적

  const [isUpdated, setIsUpdated] = useState(false);

  useEffect(() => {
    // ── 네이티브 버전 체크 (스토어 업데이트 유도) ──────────────────
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
            [{ text: '업데이트하기', onPress: () => Linking.openURL(STORE_URL) }],
            { cancelable: false }
          );
        }
      } catch (error) {
        captureError({ error, prefix: '[useAutoUpdate]: ', level: 'fatal' });
      }
    };

    // ── OTA 업데이트 다운로드 ──────────────────────────────────────
    const fetchUpdate = async () => {
      // DEV 환경이거나 embedded launch(스탠드얼론 빌드가 아님)면 스킵
      if (__DEV__ || Updates.isEmbeddedLaunch) return;

      try {
        const update = await Updates.checkForUpdateAsync();
        if (update.isAvailable) {
          await Updates.fetchUpdateAsync();
          updateReady.current = true; // 다운로드 완료 마킹
        }
      } catch (error) {
        captureError({ error, prefix: '[OTA 업데이트 다운로드 실패]: ', level: 'fatal' });
      } finally {
        setIsUpdated(true);
      }
    };

    // ── 포그라운드 복귀 시 업데이트 적용 ──────────────────────────
    const applyUpdateIfReady = async () => {
      if (__DEV__ || Updates.isEmbeddedLaunch) return;

      // 다운로드된 업데이트가 있을 때만 reload
      if (updateReady.current) {
        try {
          await Updates.reloadAsync();
        } catch (error) {
          captureError({ error, prefix: '[OTA 업데이트 적용 실패]: ', level: 'fatal' });
        }
      }
    };

    // ── AppState 구독 (단일) ───────────────────────────────────────
    const subscription = AppState.addEventListener('change', (nextAppState) => {
      const prevState = appState.current;
      appState.current = nextAppState;

      if (prevState === 'active' && nextAppState.match(/inactive|background/)) {
        // 포그라운드 → 백그라운드: 버전 체크 + 다운로드
        checkCurrentVersion();
        fetchUpdate();
      } else if (prevState.match(/inactive|background/) && nextAppState === 'active') {
        // 백그라운드 → 포그라운드: 다운받은 업데이트 적용
        applyUpdateIfReady();
      }
    });

    // 앱 최초 실행 시에도 체크
    checkCurrentVersion();
    fetchUpdate();

    return () => subscription.remove();
  }, []);

  return isUpdated;
};
