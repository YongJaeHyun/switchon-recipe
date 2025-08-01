import Constants from 'expo-constants';
import * as Updates from 'expo-updates';
import { useEffect, useState } from 'react';

export const useAutoUpdate = () => {
  const [isUpdated, setIsUpdated] = useState(false);

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
        console.error('OTA 업데이트 실패:', error);
      } finally {
        setIsUpdated(true);
      }
    };

    checkAndApplyUpdate();
  }, []);

  return isUpdated;
};
