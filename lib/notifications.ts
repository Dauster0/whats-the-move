import * as Notifications from "expo-notifications";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

export async function requestNotificationPermission() {
  const settings = await Notifications.requestPermissionsAsync();
  return settings.status === "granted";
}

export async function scheduleDailyReminders() {
  const granted = await requestNotificationPermission();

  if (!granted) {
    return false;
  }

  await Notifications.cancelAllScheduledNotificationsAsync();

  await Notifications.scheduleNotificationAsync({
    content: {
      title: "Save your time",
      body: "Afternoon drift? One quick move is enough.",
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DAILY,
      hour: 16,
      minute: 30,
    },
  });

  await Notifications.scheduleNotificationAsync({
    content: {
      title: "Replace scrolling with living",
      body: "Evening rescue: pick one move before the scroll spiral starts.",
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DAILY,
      hour: 20,
      minute: 30,
    },
  });

  return true;
}