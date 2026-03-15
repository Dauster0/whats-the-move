import { Alert, Linking, Platform } from "react-native";

export type QuickAction = { label: string; url: string } | null;

function encode(text: string) {
  return encodeURIComponent(text);
}

export function getQuickActionForMove(move: string): QuickAction {
  const lower = move.toLowerCase();

  if (lower.includes("coffee")) {
    const mapsUrl =
      Platform.OS === "ios"
        ? `http://maps.apple.com/?q=${encode(move)}`
        : `geo:0,0?q=${encode(move)}`;

    return {
      label: "Open in Maps",
      url: mapsUrl,
    };
  }

  if (
    lower.includes("walk") ||
    lower.includes("park") ||
    lower.includes("explore") ||
    lower.includes("outside") ||
    lower.includes("beach")
  ) {
    const mapsUrl =
      Platform.OS === "ios"
        ? `http://maps.apple.com/?q=${encode(move)}`
        : `geo:0,0?q=${encode(move)}`;

    return {
      label: "Open in Maps",
      url: mapsUrl,
    };
  }

  if (lower.includes("text")) {
    return {
      label: "Open Messages",
      url: "sms:",
    };
  }

  if (lower.includes("call")) {
    return {
      label: "Call now",
      url: "tel:",
    };
  }

  return null;
}

export async function openQuickAction(url: string) {
  try {
    const supported = await Linking.canOpenURL(url);

    if (supported) {
      await Linking.openURL(url);
      return;
    }

    Alert.alert(
      "Not available here",
      "This action may not work in the simulator. Try it on a real device."
    );
  } catch {
    Alert.alert(
      "Not available here",
      "This action may not work in the simulator. Try it on a real device."
    );
  }
}