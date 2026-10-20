// 보상형 광고 계층. 광고 라이브러리(react-native-google-mobile-ads) 의존은 이 파일에만 둔다.
//
// 네이티브 모듈이 없는 빌드(구 dev 빌드, Vitest)에서도 import만으로 앱이 죽지 않도록
// 라이브러리는 처음 쓸 때 동적으로 불러온다.
// 보상은 서버가 AdMob SSV 콜백(user_id = Supabase uid)으로 지급한다. 앱은 지급하지 않는다.

import { REWARDED_AD_UNIT_ID } from 'const/ads';
import { Platform } from 'react-native';

type AdsLib = typeof import('react-native-google-mobile-ads');

export class AdsUnavailableError extends Error {
  constructor(cause?: unknown) {
    super('ads unavailable');
    this.name = 'AdsUnavailableError';
    this.cause = cause;
  }
}

let libPromise: Promise<AdsLib> | null = null;

const loadLib = (): Promise<AdsLib> => {
  if (!libPromise) {
    libPromise =
      Platform.OS === 'android' && REWARDED_AD_UNIT_ID
        ? import('react-native-google-mobile-ads')
        : Promise.reject(new Error('광고는 Android + 광고 단위 ID가 있을 때만 사용'));
    // 실패는 캐시하지 않는다(다음 호출에서 재시도)
    libPromise.catch(() => {
      libPromise = null;
    });
  }
  return libPromise;
};

// 모듈이 import돼도 네이티브 쪽이 없으면 실제 사용 시 throw하므로, 광고 객체 생성까지 확인한다
const createAd = async (lib: AdsLib, uid: string) => {
  try {
    return lib.RewardedAd.createForAdRequest(REWARDED_AD_UNIT_ID as string, {
      serverSideVerificationOptions: { userId: uid },
    });
  } catch (error) {
    throw new AdsUnavailableError(error);
  }
};

// 이 바이너리에서 광고를 쓸 수 있는지. 모듈이 없거나 운영 광고 ID가 없으면 false
export async function isAdsAvailable(): Promise<boolean> {
  try {
    const lib = await loadLib();
    return typeof lib.RewardedAd?.createForAdRequest === 'function';
  } catch {
    return false;
  }
}

// 보상형 광고를 불러와 보여준다.
// 'earned': 보상(EARNED_REWARD)을 받고 광고를 닫음, 'closed': 보상 없이 닫음.
// 모듈이 없으면 AdsUnavailableError, 광고 로드 실패는 해당 오류로 reject
export async function showRewardedAd(uid: string): Promise<'earned' | 'closed'> {
  let lib: AdsLib;
  try {
    lib = await loadLib();
  } catch (error) {
    throw new AdsUnavailableError(error);
  }

  const ad = await createAd(lib, uid);
  const { RewardedAdEventType, AdEventType } = lib;

  return new Promise<'earned' | 'closed'>((resolve, reject) => {
    let earned = false;
    const unsubscribes: (() => void)[] = [];
    const cleanup = () => unsubscribes.forEach((off) => off());

    unsubscribes.push(
      ad.addAdEventListener(RewardedAdEventType.LOADED, () => {
        ad.show().catch((error: unknown) => {
          cleanup();
          reject(error);
        });
      }),
      ad.addAdEventListener(RewardedAdEventType.EARNED_REWARD, () => {
        earned = true;
      }),
      ad.addAdEventListener(AdEventType.CLOSED, () => {
        cleanup();
        resolve(earned ? 'earned' : 'closed');
      }),
      ad.addAdEventListener(AdEventType.ERROR, (error: unknown) => {
        cleanup();
        reject(error);
      })
    );

    ad.load();
  });
}
