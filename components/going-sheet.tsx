import { useEffect, useRef, useState } from "react";
import {
  Animated,
  Dimensions,
  Easing,
  Linking,
  Modal,
  Pressable,
  Share,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Image } from "expo-image";
import type { ConciergeSuggestion } from "../lib/concierge-types";
import { addGoingMove } from "../lib/going-moves-storage";
import { scheduleGoingNotification } from "../lib/schedule-notification";
import { radius, spacing, font } from "../lib/theme";

const { height: SCREEN_H } = Dimensions.get("window");
const SHEET_HEIGHT = Math.min(SCREEN_H * 0.72, 560);

type Props = {
  suggestion: ConciergeSuggestion | null;
  onConfirm: (s: ConciergeSuggestion) => void;
  onCancel: () => void;
};

function buildCalendarUrl(s: ConciergeSuggestion): string {
  const base = "https://calendar.google.com/calendar/render?action=TEMPLATE";
  const text = encodeURIComponent(s.title);
  const details = encodeURIComponent(s.description || "");
  const location = encodeURIComponent(s.address || s.venueName || s.mapQuery || "");

  // Try to build start/end from ISO
  const iso = s.showtimes?.[0]?.startIso;
  if (iso) {
    const start = new Date(iso);
    const end = new Date(start.getTime() + 2 * 60 * 60 * 1000); // +2h default
    const fmt = (d: Date) =>
      d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
    return `${base}&text=${text}&dates=${fmt(start)}/${fmt(end)}&details=${details}&location=${location}`;
  }
  return `${base}&text=${text}&details=${details}&location=${location}`;
}

export function GoingSheet({ suggestion, onConfirm, onCancel }: Props) {
  const translateY = useRef(new Animated.Value(SHEET_HEIGHT)).current;
  const [calendarAdded, setCalendarAdded] = useState(false);
  const [goingSaved, setGoingSaved] = useState(false);

  // Animate in when suggestion appears
  useEffect(() => {
    if (suggestion) {
      setCalendarAdded(false);
      setGoingSaved(false);
      Animated.spring(translateY, {
        toValue: 0,
        damping: 22,
        stiffness: 200,
        useNativeDriver: true,
      }).start();
    } else {
      Animated.timing(translateY, {
        toValue: SHEET_HEIGHT,
        duration: 240,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start();
    }
  }, [!!suggestion]);

  function dismiss() {
    Animated.timing(translateY, {
      toValue: SHEET_HEIGHT,
      duration: 220,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start(() => onCancel());
  }

  function handleConfirm() {
    if (!suggestion) return;
    Animated.timing(translateY, {
      toValue: SHEET_HEIGHT,
      duration: 220,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start(() => onConfirm(suggestion));
  }

  async function handleAddCalendar() {
    if (!suggestion) return;
    const url = buildCalendarUrl(suggestion);
    await Linking.openURL(url).catch(() => {});
    // Also schedule push notification
    const startIso = suggestion.showtimes?.[0]?.startIso ?? null;
    const logisticsHint = suggestion.venueName
      ? `Head to ${suggestion.venueName}.`
      : undefined;
    void scheduleGoingNotification(suggestion.title, startIso, suggestion.startTime, logisticsHint);
    setCalendarAdded(true);
  }

  async function handleShare() {
    if (!suggestion) return;
    const time = suggestion.startTime || "";
    const venue = suggestion.venueName || suggestion.address || "";
    const parts = [
      `Anyone down for ${suggestion.title} tonight?`,
      time && venue ? `${time} at ${venue}.` : time || venue || "",
      "– via What's the Move",
    ].filter(Boolean);
    await Share.share({ message: parts.join(" ") });
  }

  async function handleSaveGoing() {
    if (!suggestion) return;
    await addGoingMove(suggestion);
    setGoingSaved(true);
  }

  if (!suggestion) return null;

  const hasTicket = Boolean(suggestion.ticketUrl?.trim());
  const confirmLine = `You're going to ${suggestion.title} tonight.`;
  const timeLabel = suggestion.startTime || suggestion.dateBadge || "";

  return (
    <Modal visible={true} transparent animationType="none" onRequestClose={dismiss}>
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={dismiss} />
        <Animated.View style={[styles.sheet, { transform: [{ translateY }] }]}>
          {/* Drag handle */}
          <View style={styles.handle} />

          {/* Zone 1 — identity */}
          <View style={styles.zone1}>
            {suggestion.photoUrl ? (
              <Image
                source={{ uri: suggestion.photoUrl }}
                style={styles.thumb}
                contentFit="cover"
              />
            ) : (
              <View style={[styles.thumb, styles.thumbFallback]} />
            )}
            <View style={styles.zone1Text}>
              <Text style={styles.confirmLine} numberOfLines={2}>{confirmLine}</Text>
              {timeLabel ? (
                <Text style={styles.timeLabel} numberOfLines={1}>{timeLabel}</Text>
              ) : null}
            </View>
          </View>

          {/* Zone 2 — actions */}
          <View style={styles.zone2}>
            <Pressable style={styles.primaryBtn} onPress={handleConfirm}>
              <Text style={styles.primaryBtnText}>
                {hasTicket ? "Get Tickets ↗" : "Get Directions ↗"}
              </Text>
            </Pressable>
            <View style={styles.secondaryRow}>
              <Pressable style={styles.secondaryBtn} onPress={handleAddCalendar}>
                <Text style={styles.secondaryBtnText}>
                  {calendarAdded ? "Added ✓" : "Add to Calendar"}
                </Text>
              </Pressable>
              <Pressable style={styles.secondaryBtn} onPress={handleShare}>
                <Text style={styles.secondaryBtnText}>Share</Text>
              </Pressable>
            </View>
          </View>

          {/* Zone 3 — save / cancel */}
          <View style={styles.zone3}>
            <Pressable style={styles.saveGoingBtn} onPress={handleSaveGoing}>
              <Text style={styles.saveGoingText}>
                {goingSaved ? "Saved to Going ✓" : "Save to Going"}
              </Text>
            </Pressable>
            <Pressable style={styles.notSureBtn} onPress={dismiss}>
              <Text style={styles.notSureText}>Actually, not sure yet</Text>
            </Pressable>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0,0,0,0.52)",
  },
  sheet: {
    height: SHEET_HEIGHT,
    backgroundColor: "#1C1916",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: spacing.md,
    paddingBottom: 36,
    paddingTop: 12,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: "rgba(255,255,255,0.18)",
    alignSelf: "center",
    marginBottom: 20,
  },
  // Zone 1
  zone1: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    marginBottom: 24,
  },
  thumb: {
    width: 64,
    height: 64,
    borderRadius: 10,
    flexShrink: 0,
  },
  thumbFallback: {
    backgroundColor: "#2E2B28",
  },
  zone1Text: {
    flex: 1,
  },
  confirmLine: {
    fontSize: font.sizeLg,
    fontWeight: "700",
    color: "#F5F0E8",
    lineHeight: 24,
  },
  timeLabel: {
    fontSize: font.sizeSm,
    color: "#A8A09A",
    marginTop: 4,
  },
  // Zone 2
  zone2: {
    gap: 10,
    marginBottom: 20,
  },
  primaryBtn: {
    height: 52,
    borderRadius: radius.lg,
    backgroundColor: "#F5F0E8",
    alignItems: "center",
    justifyContent: "center",
  },
  primaryBtnText: {
    fontSize: font.sizeMd,
    fontWeight: "700",
    color: "#1C1916",
  },
  secondaryRow: {
    flexDirection: "row",
    gap: 10,
  },
  secondaryBtn: {
    flex: 1,
    height: 46,
    borderRadius: radius.lg,
    backgroundColor: "#2E2B28",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  secondaryBtnText: {
    fontSize: font.sizeSm,
    fontWeight: "600",
    color: "#F5F0E8",
  },
  // Zone 3
  zone3: {
    gap: 4,
  },
  saveGoingBtn: {
    height: 48,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderColor: "#F5F0E8",
    alignItems: "center",
    justifyContent: "center",
  },
  saveGoingText: {
    fontSize: font.sizeSm,
    fontWeight: "600",
    color: "#F5F0E8",
  },
  notSureBtn: {
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  notSureText: {
    fontSize: font.sizeSm,
    fontWeight: "500",
    color: "#6B6560",
  },
});
