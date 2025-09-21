import { UserAPI } from 'api/UserAPI';
import { Channels } from 'const/channels';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { captureError } from './sendError';

const registerForPushNotificationsAsync = async (channelId: Channels) => {
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(channelId, {
      name: channelId,
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#FF231F7C',
    });
  }

  if (Device.isDevice) {
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== 'granted') return;

    try {
      const projectId =
        Constants?.expoConfig?.extra?.eas?.projectId ?? Constants?.easConfig?.projectId;
      if (!projectId) throw new Error('Project ID not found');

      const pushToken = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
      await UserAPI.updatePushToken(pushToken);
    } catch (error) {
      captureError({ error, prefix: '[registerForPushNotificationsAsync]: ' });
    }
  } else {
    console.error('Must use physical device for push notifications');
  }
};

export { registerForPushNotificationsAsync };
