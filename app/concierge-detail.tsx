import Ionicons from "@expo/vector-icons/Ionicons";
import * as Haptics from "expo-haptics";
import { Image } from "expo-image";
import { router } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActionSheetIOS,
  ActivityIndicator,
  Alert,
  Dimensions,
  FlatList,
  KeyboardAvoidingView,
  Linking,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useThemeColors } from "../hooks/use-theme-colors";
import { buildBookingActions } from "../lib/booking-links";
import {
  clearConciergeDetailPayload,
  consumePendingConciergeDetail,
  getConciergeDetailPayload,
  setConciergeDetailPayload,
  type ConciergeDetailPayload,
} from "../lib/concierge-detail-storage";
import { getPeekDetailHandlers, setPeekDetailHandlers } from "../lib/peek-detail-handlers";
import { recordDecayNeverShow } from "../lib/suggestion-decay-storage";
import { takeCachedConciergeQuick } from "../lib/concierge-quick-cache";
import type { ConciergeSuggestion } from "../lib/concierge-types";
import { font, radius, spacing } from "../lib/theme";
import { getReadableLocation } from "../lib/location";
import {
  isConciergeMoveSaved,
  toggleSavedConciergeMove,
} from "../lib/saved-concierge-storage";

const SERVER_URL = process.env.EXPO_PUBLIC_API_URL || "http://192.168.1.154:3001";
const { width: WIN_W } = Dimensions.get("window");

type DetailApi = {
  kind?: string;
  title?: string;
  venueName?: string;
  category?: string;
  energyLevel?: string;
  timeRequired?: string;
  whyNow?: string;
  whyNowBadge?: string;
  rating?: { value: number; count: number | null } | null;
  heroImageUrls?: string[];
  cost?: { label: string; free: boolean; ticketUrl?: string };
  narrative?: {
    paragraphFriend?: string;
    paragraphWhyNow?: string;
    paragraphOrderThis?: string;
  };
  narrativePending?: boolean;
  logistics?: {
    address?: string;
    mapQuery?: string;
    timeLine?: string;
    duration?: string;
    distanceText?: string;
    driveTimeText?: string;
    parking?: string;
    weatherLine?: string;
    openNow?: boolean | null;
    hoursLine?: string;
  };
  place?: { phone?: string; websiteUri?: string; googleMapsUri?: string } | null;
  primaryCta?: { label: string; url: string; action: string };
  resale?: { stubhub: string; seatgeek: string; queryUsed?: string } | null;
  resaleUrl?: string;
  quickSnapshot?: unknown;
  error?: string;
};

async function openMapsQuery(q: string) {
  const query = String(q || "").trim();
  if (!query) return;

  const encoded = encodeURIComponent(query);

  const candidates: { label: string; url: string }[] = [
    { label: "Apple Maps", url: `maps://?q=${encoded}` },
    { label: "Google Maps", url: `comgooglemaps://?q=${encoded}` },
    { label: "Waze", url: `waze://?q=${encoded}&navigate=yes` },
  ];

  const available = (
    await Promise.all(
      candidates.map(async (c) => ({
        ...c,
        ok: await Linking.canOpenURL(c.url).catch(() => false),
      }))
    )
  ).filter((c) => c.ok);

  // If only one option, open it directly
  if (available.length === 1) {
    Linking.openURL(available[0].url).catch(() => {});
    return;
  }

  // If none available (simulator / old iOS), fall back to web Google Maps
  if (available.length === 0) {
    Linking.openURL(
      `https://www.google.com/maps/search/?api=1&query=${encoded}`
    ).catch(() => {});
    return;
  }

  const options = [...available.map((c) => c.label), "Cancel"];

  if (Platform.OS === "ios") {
    ActionSheetIOS.showActionSheetWithOptions(
      { options, cancelButtonIndex: options.length - 1, title: "Open in…" },
      (idx) => {
        if (idx < available.length) {
          Linking.openURL(available[idx].url).catch(() => {});
        }
      }
    );
  } else {
    // Android: use Alert as a simple picker
    Alert.alert(
      "Open in…",
      undefined,
      [
        ...available.map((c) => ({
          text: c.label,
          onPress: () => Linking.openURL(c.url).catch(() => {}),
        })),
        { text: "Cancel", style: "cancel" as const },
      ]
    );
  }
}

function pickSimilar(others: ConciergeSuggestion[], current: ConciergeSuggestion, n = 3) {
  const seen = new Set<string>();
  const out: ConciergeSuggestion[] = [];
  for (const o of others) {
    if (o.title === current.title) continue;
    if (out.length >= n) break;
    const key = o.category + o.title;
    if (!seen.has(key)) {
      seen.add(key);
      out.push(o);
    }
  }
  return out.slice(0, n);
}

export default function ConciergeDetailScreen() {
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(colors, insets.bottom), [colors, insets.bottom]);

  const [payload, setPayload] = useState<ConciergeDetailPayload | null>(null);
  const [detail, setDetail] = useState<DetailApi | null>(null);
  const [loadingQuick, setLoadingQuick] = useState(true);
  const [narrativeLoading, setNarrativeLoading] = useState(true);
  const [err, setErr] = useState("");
  const [heroIdx, setHeroIdx] = useState(0);
  const [saved, setSaved] = useState(false);

  type ChatMessage = { role: "user" | "assistant"; content: string };
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);

  const load = useCallback(async () => {
    setLoadingQuick(true);
    setNarrativeLoading(true);
    setErr("");
    const pending = consumePendingConciergeDetail();
    const p = pending ?? (await getConciergeDetailPayload());
    setPayload(p);
    if (!p?.suggestion) {
      setErr("Nothing to show.");
      setLoadingQuick(false);
      setNarrativeLoading(false);
      return;
    }
    try {
      const loc = await getReadableLocation();
      if (loc.lat == null || loc.lon == null) {
        setErr("Turn on location for distances and full detail.");
        setLoadingQuick(false);
        setNarrativeLoading(false);
        return;
      }
      const nowIso = new Date().toISOString();
      const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      const body = {
        lat: loc.lat,
        lng: loc.lon,
        nowIso,
        timeZone,
        suggestion: p.suggestion,
      };

      const cached = takeCachedConciergeQuick(p.suggestion) as (DetailApi & { error?: string }) | null;
      let dataQ = cached && !cached.error ? cached : null;

      if (!dataQ) {
        const resQ = await fetch(`${SERVER_URL}/concierge-detail/quick`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-app-secret": process.env.EXPO_PUBLIC_APP_SECRET || "" },
          body: JSON.stringify(body),
        });
        dataQ = (await resQ.json().catch(() => ({}))) as DetailApi & { error?: string };
        if (!resQ.ok) {
          setErr(typeof dataQ.error === "string" ? dataQ.error : "Couldn’t load details.");
          setDetail(null);
          setLoadingQuick(false);
          setNarrativeLoading(false);
          return;
        }
      }
      if (!dataQ) {
        setErr("Couldn’t load details.");
        setLoadingQuick(false);
        setNarrativeLoading(false);
        return;
      }
      setDetail(dataQ);
      setLoadingQuick(false);

      try {
        const resN = await fetch(`${SERVER_URL}/concierge-detail/narrative`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-app-secret": process.env.EXPO_PUBLIC_APP_SECRET || "" },
          body: JSON.stringify({
            suggestion: p.suggestion,
            quickSnapshot: dataQ.quickSnapshot,
          }),
        });
        const dataN = (await resN.json().catch(() => ({}))) as {
          narrative?: DetailApi["narrative"];
          cost?: DetailApi["cost"];
          primaryCta?: DetailApi["primaryCta"];
          logisticsPatch?: { parking?: string };
          error?: string;
        };
        if (!resN.ok) {
          setDetail((prev) => (prev ? { ...prev, narrativePending: false } : prev));
          return;
        }
        setDetail((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            narrative: dataN.narrative ?? prev.narrative,
            narrativePending: false,
            cost: dataN.cost ?? prev.cost,
            primaryCta: dataN.primaryCta ?? prev.primaryCta,
            logistics: {
              ...prev.logistics,
              parking: dataN.logisticsPatch?.parking ?? prev.logistics?.parking,
            },
          };
        });
      } catch {
        setDetail((prev) => (prev ? { ...prev, narrativePending: false } : prev));
      }
    } catch {
      setErr("Network error.");
      setDetail(null);
    } finally {
      setLoadingQuick(false);
      setNarrativeLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    return () => setPeekDetailHandlers(null);
  }, []);

  const suggestion = payload?.suggestion;
  const isPeek = Boolean(payload?.peek);

  useEffect(() => {
    if (!suggestion) return;
    void isConciergeMoveSaved(suggestion).then(setSaved);
  }, [suggestion]);
  const similar = useMemo(
    () => (payload ? pickSimilar(payload.others, payload.suggestion) : []),
    [payload]
  );

  const heroUrls = detail?.heroImageUrls?.length
    ? detail.heroImageUrls
    : suggestion?.photoUrl
      ? [suggestion.photoUrl]
      : [];

  const title = detail?.title || suggestion?.title || "Details";
  const primary = detail?.primaryCta;

  async function onShare() {
    try {
      await Share.share({
        message: `${title}\n${suggestion?.description || ""}`.slice(0, 280),
        title,
      });
    } catch {
      /* */
    }
  }

  function onPrimaryCta() {
    if (!primary) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (primary.action === "tickets" && primary.url) {
      Linking.openURL(primary.url).catch(() => {});
      return;
    }
    openMapsQuery(detail?.logistics?.mapQuery || suggestion?.mapQuery || title);
  }

  const bookingActions = useMemo(() => {
    if (!suggestion) return [];
    return buildBookingActions({
      venueName: title,
      address: detail?.logistics?.address || suggestion.address,
      category: suggestion.category,
      websiteUri: detail?.place?.websiteUri,
      phoneNumber: detail?.place?.phone,
    });
  }, [detail, suggestion, title]);

  async function sendChat() {
    const msg = chatInput.trim();
    if (!msg || chatLoading) return;
    setChatInput("");
    const userMsg: ChatMessage = { role: "user", content: msg };
    setChatMessages((prev) => [...prev, userMsg]);
    setChatLoading(true);
    try {
      const res = await fetch(`${SERVER_URL}/concierge-chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-app-secret": process.env.EXPO_PUBLIC_APP_SECRET || "" },
        body: JSON.stringify({
          suggestion,
          detail,
          messages: chatMessages,
          userMessage: msg,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { reply?: string; error?: string };
      const reply = data.reply || "Something went wrong — try again.";
      setChatMessages((prev) => [...prev, { role: "assistant", content: reply }]);
    } catch {
      setChatMessages((prev) => [
        ...prev,
        { role: "assistant", content: "Couldn't reach the server — check your connection." },
      ]);
    } finally {
      setChatLoading(false);
    }
  }

  if (!suggestion && !loadingQuick) {
    return (
      <View style={styles.center}>
        <Text style={styles.muted}>{err || "Open this from a suggestion card."}</Text>
        <Pressable style={styles.backBtn} onPress={() => router.back()}>
          <Text style={styles.backBtnText}>Back</Text>
        </Pressable>
      </View>
    );
  }

  const showFullSkeleton = loadingQuick;

  async function onToggleSave() {
    if (!suggestion) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    const res = await toggleSavedConciergeMove(suggestion, { plusUnlimited: true });
    setSaved(res.saved);
  }

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.hero, { height: WIN_W * 0.42 }]}>
          {showFullSkeleton ? (
            <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.bgMuted }]} />
          ) : heroUrls.length > 0 ? (
            <FlatList
              data={heroUrls}
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              keyExtractor={(u, i) => `${i}-${u}`}
              onMomentumScrollEnd={(e: NativeSyntheticEvent<NativeScrollEvent>) => {
                const x = e.nativeEvent.contentOffset.x;
                const i = Math.round(x / WIN_W);
                setHeroIdx(Math.max(0, Math.min(i, heroUrls.length - 1)));
              }}
              renderItem={({ item }) => (
                <View style={{ width: WIN_W, height: WIN_W * 0.42 }}>
                  <Image
                    source={{ uri: item }}
                    style={StyleSheet.absoluteFill}
                    contentFit="cover"
                    cachePolicy="memory-disk"
                  />
                </View>
              )}
            />
          ) : (
            <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.bgMuted }]} />
          )}
          <View style={[styles.heroBar, { paddingTop: insets.top + 6 }]}>
            <Pressable
              style={styles.iconBtn}
              onPress={() => {
                void clearConciergeDetailPayload();
                router.back();
              }}
            >
              <Ionicons name="chevron-back" size={26} color="#fff" />
            </Pressable>
            <View style={styles.heroBarRight}>
              {suggestion ? (
                <Pressable style={styles.iconBtn} onPress={() => void onToggleSave()}>
                  <Ionicons
                    name={saved ? "bookmark" : "bookmark-outline"}
                    size={22}
                    color="#fff"
                  />
                </Pressable>
              ) : null}
              <Pressable style={styles.iconBtn} onPress={() => void onShare()}>
                <Ionicons name="share-outline" size={22} color="#fff" />
              </Pressable>
            </View>
          </View>
          {!showFullSkeleton && heroUrls.length > 1 ? (
            <View style={styles.dots}>
              <Text style={styles.dotText}>
                {heroIdx + 1} / {heroUrls.length}
              </Text>
            </View>
          ) : null}
        </View>

        <View style={styles.body}>
          {err ? <Text style={styles.errorText}>{err}</Text> : null}

          {showFullSkeleton ? (
            <>
              <View style={[styles.skLine, { width: "78%", height: 28, marginBottom: 10 }]} />
              <View style={[styles.skLine, { width: "52%", height: 18, marginBottom: spacing.md }]} />
              <View style={styles.metaRow}>
                <View style={[styles.skLine, { width: 72, height: 14 }]} />
                <View style={[styles.skLine, { width: 64, height: 14 }]} />
                <View style={[styles.skLine, { width: 56, height: 14 }]} />
              </View>
              <View style={[styles.skBlock, { height: 72, marginTop: spacing.md }]} />
              <View style={[styles.skBlock, { height: 88, marginTop: spacing.md }]} />
              <View style={[styles.skLine, { width: 120, height: 12, marginTop: spacing.lg }]} />
              <View style={[styles.skBlock, { height: 56, marginTop: spacing.sm }]} />
              <View style={[styles.skBlock, { height: 56, marginTop: 4 }]} />
              <View style={[styles.skBlock, { height: 56, marginTop: 4 }]} />
              <View style={[styles.skLine, { width: 100, height: 12, marginTop: spacing.lg }]} />
              <View style={[styles.skBlock, { height: 40, marginTop: spacing.sm }]} />
            </>
          ) : null}

          {!showFullSkeleton ? (
            <>
          <Text style={styles.title}>{title}</Text>
          {detail?.venueName || suggestion?.theaterSubtitle ? (
            <Text style={styles.venue}>
              {detail?.venueName || suggestion?.theaterSubtitle || suggestion?.venueName}
            </Text>
          ) : null}

          <View style={styles.metaRow}>
            <Text style={styles.metaChip}>{detail?.category || suggestion?.category}</Text>
            <Text style={styles.metaChip}>{detail?.energyLevel || suggestion?.energyLevel}</Text>
            <Text style={styles.metaChip}>{detail?.timeRequired || suggestion?.timeRequired}</Text>
          </View>

          {detail?.rating != null ? (
            <Text style={styles.rating}>
              ★ {detail.rating.value.toFixed(1)}
              {detail.rating.count != null ? ` · ${detail.rating.count.toLocaleString()} reviews` : ""}
            </Text>
          ) : null}

          {detail?.whyNow || suggestion?.whyNow ? (
            <View style={styles.badgeWhy}>
              <Text style={styles.badgeWhyLabel}>Why now</Text>
              <Text style={styles.badgeWhyText}>{detail?.whyNow || suggestion?.whyNow}</Text>
            </View>
          ) : null}

          <View style={styles.costBox}>
            <Text style={styles.costLabel}>Cost</Text>
            <Text
              style={[
                styles.costValue,
                detail?.cost?.free ? { color: "#4ade80" } : null,
              ]}
            >
              {loadingQuick
                ? "Looking up..."
                : detail?.cost?.label ||
                  (detail?.cost?.free ? "Free" : suggestion?.ticketUrl ? "Check prices" : "Varies")}
            </Text>
            {detail?.cost?.ticketUrl && !detail.cost.free ? (
              <Pressable
                style={[styles.tmBtn, { backgroundColor: colors.accent }]}
                onPress={() => Linking.openURL(detail.cost!.ticketUrl!).catch(() => {})}
              >
                <Text style={[styles.tmBtnText, { color: colors.textInverse }]}>Buy tickets</Text>
              </Pressable>
            ) : null}
          </View>

          {suggestion?.kind === "movie" && suggestion.showtimes && suggestion.showtimes.length > 0 ? (
            <>
              <Text style={styles.sectionTitle}>{"Tonight's showtimes"}</Text>
              <View style={styles.showtimePillRow}>
                {suggestion.showtimes.map((p, i) => (
                  <Pressable
                    key={`${p.label}-${i}`}
                    style={[styles.showtimePill, { borderColor: colors.accent + "66" }]}
                    onPress={() => {
                      const u =
                        (p.bookingUrl || "").trim() ||
                        (suggestion.ticketUrl || "").trim() ||
                        (suggestion.fandangoFallbackUrl || "").trim();
                      if (u) Linking.openURL(u).catch(() => {});
                    }}
                  >
                    <Text style={[styles.showtimePillText, { color: colors.accent }]}>{p.label}</Text>
                  </Pressable>
                ))}
              </View>
            </>
          ) : null}

          <View style={styles.sectionTitleRow}>
            <Text style={[styles.sectionTitle, { marginTop: 0 }]}>The vibe</Text>
            {narrativeLoading ? <ActivityIndicator size="small" color={colors.accent} /> : null}
          </View>
          <Text style={styles.paragraph}>
            {detail?.narrative?.paragraphFriend || suggestion?.description || "—"}
          </Text>
          {detail?.narrative?.paragraphWhyNow ? (
            <>
              <Text style={styles.sectionTitle}>Why tonight</Text>
              <Text style={styles.paragraph}>{detail.narrative.paragraphWhyNow}</Text>
            </>
          ) : null}
          {detail?.narrative?.paragraphOrderThis ? (
            <>
              <Text style={styles.sectionTitle}>What to do</Text>
              <Text style={styles.paragraph}>{detail.narrative.paragraphOrderThis}</Text>
            </>
          ) : null}

          <Text style={styles.sectionTitle}>Logistics</Text>
          {detail?.logistics?.address ? (
            <Pressable
              onPress={() => openMapsQuery(detail.logistics?.mapQuery || detail.logistics!.address!)}
            >
              <Text style={styles.logLine}>{detail.logistics.address}</Text>
            </Pressable>
          ) : null}
          {detail?.logistics?.hoursLine ? (
            <Text style={styles.logLine}>{detail.logistics.hoursLine}</Text>
          ) : null}
          {detail?.logistics?.timeLine || suggestion?.startTime ? (
            <Text style={styles.logLine}>{detail?.logistics?.timeLine || suggestion?.startTime}</Text>
          ) : null}
          {detail?.logistics?.duration || suggestion?.timeRequired ? (
            <Text style={styles.logLine}>{detail?.logistics?.duration || suggestion?.timeRequired}</Text>
          ) : null}
          {detail?.logistics?.distanceText ? (
            <Text style={styles.logLine}>{detail.logistics.distanceText}</Text>
          ) : null}
          {detail?.logistics?.driveTimeText ? (
            <Text style={styles.logLine}>{detail.logistics.driveTimeText}</Text>
          ) : null}
          {detail?.logistics?.parking ? (
            <Text style={styles.logLine}>{detail.logistics.parking}</Text>
          ) : null}
          {detail?.logistics?.weatherLine ? (
            <Text style={styles.logLine}>{detail.logistics.weatherLine}</Text>
          ) : null}

          {detail?.resale?.stubhub && detail?.resale?.seatgeek ? (
            <View style={styles.resaleRow}>
              <Pressable
                style={[styles.secondaryOutline, styles.resaleBtn]}
                onPress={() => Linking.openURL(detail.resale!.stubhub).catch(() => {})}
              >
                <Text style={styles.secondaryOutlineText}>StubHub</Text>
              </Pressable>
              <Pressable
                style={[styles.secondaryOutline, styles.resaleBtn]}
                onPress={() => Linking.openURL(detail.resale!.seatgeek).catch(() => {})}
              >
                <Text style={styles.secondaryOutlineText}>SeatGeek</Text>
              </Pressable>
            </View>
          ) : detail?.resaleUrl ? (
            <Pressable
              style={styles.secondaryOutline}
              onPress={() => Linking.openURL(detail.resaleUrl!).catch(() => {})}
            >
              <Text style={styles.secondaryOutlineText}>Check resale (web)</Text>
            </Pressable>
          ) : null}

          {detail?.place?.phone ? (
            <Pressable
              style={styles.actionRow}
              onPress={() => {
                const p = detail.place?.phone;
                if (p) Linking.openURL(`tel:${p}`).catch(() => {});
              }}
            >
              <Text style={styles.actionRowText}>Call</Text>
              <Ionicons name="call-outline" size={20} color={colors.accent} />
            </Pressable>
          ) : null}

          {bookingActions.slice(0, 3).map((a) => (
            <Pressable
              key={a.id}
              style={styles.actionRow}
              onPress={() => Linking.openURL(a.url).catch(() => {})}
            >
              <Text style={styles.actionRowText}>{a.label}</Text>
              <Ionicons name="open-outline" size={18} color={colors.accent} />
            </Pressable>
          ))}

          {similar.length > 0 ? (
            <>
              <Text style={[styles.sectionTitle, { marginTop: spacing.lg }]}>Other moves</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.simRow}>
                {similar.map((s) => (
                  <Pressable
                    key={s.title}
                    style={[styles.simCard, { borderColor: colors.border, backgroundColor: colors.bgCard }]}
                    onPress={async () => {
                      await setConciergeDetailPayload({
                        suggestion: s,
                        others: (payload?.others || []).filter((x) => x.title !== s.title),
                        peek: payload?.peek,
                      });
                      setHeroIdx(0);
                      setDetail(null);
                      await load();
                    }}
                  >
                    {s.photoUrl ? (
                      <Image
                        source={{ uri: s.photoUrl }}
                        style={styles.simImg}
                        contentFit="cover"
                      />
                    ) : (
                      <View style={[styles.simImg, { backgroundColor: colors.bgMuted }]} />
                    )}
                    <Text style={styles.simTitle} numberOfLines={2}>
                      {s.title}
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>
            </>
          ) : null}

          {/* Chat */}
          {!loadingQuick && suggestion ? (
            <>
              <Text style={[styles.sectionTitle, { marginTop: spacing.lg }]}>Ask about this move</Text>
              {chatMessages.map((m, i) => (
                <View
                  key={i}
                  style={[
                    styles.chatBubble,
                    m.role === "user" ? styles.chatBubbleUser : styles.chatBubbleAssistant,
                    { backgroundColor: m.role === "user" ? colors.accent : colors.bgCard },
                  ]}
                >
                  <Text
                    style={[
                      styles.chatBubbleText,
                      { color: m.role === "user" ? colors.textInverse : colors.text },
                    ]}
                  >
                    {m.content}
                  </Text>
                </View>
              ))}
              {chatLoading ? (
                <View style={[styles.chatBubble, styles.chatBubbleAssistant, { backgroundColor: colors.bgCard }]}>
                  <ActivityIndicator size="small" color={colors.textMuted} />
                </View>
              ) : null}
              <View style={[styles.chatInputRow, { borderColor: colors.border, backgroundColor: colors.bgCard }]}>
                <TextInput
                  style={[styles.chatInput, { color: colors.text }]}
                  placeholder="Ask anything about this move…"
                  placeholderTextColor={colors.textMuted}
                  value={chatInput}
                  onChangeText={setChatInput}
                  onSubmitEditing={() => void sendChat()}
                  returnKeyType="send"
                  multiline={false}
                />
                <Pressable
                  style={[styles.chatSendBtn, { backgroundColor: colors.accent, opacity: chatInput.trim() ? 1 : 0.4 }]}
                  onPress={() => void sendChat()}
                  disabled={!chatInput.trim() || chatLoading}
                >
                  <Ionicons name="arrow-up" size={18} color={colors.textInverse} />
                </Pressable>
              </View>
            </>
          ) : null}

          <View style={{ height: 140 }} />
            </>
          ) : null}
        </View>
      </ScrollView>

      <View style={[styles.bottomBar, { paddingBottom: Math.max(insets.bottom, 12) }]}>
        {isPeek && suggestion ? (
          <>
            <View style={styles.peekRow}>
              <Pressable
                style={[styles.peekBtnNah, { borderColor: colors.border, backgroundColor: colors.bgCard }]}
                disabled={showFullSkeleton}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                  void clearConciergeDetailPayload();
                  getPeekDetailHandlers()?.onNah();
                }}
              >
                <Text style={[styles.peekBtnNahText, { color: colors.text }]}>Not for me</Text>
              </Pressable>
              <Pressable
                style={[
                  styles.peekBtnGo,
                  { backgroundColor: colors.accent },
                  showFullSkeleton ? { opacity: 0.45 } : null,
                ]}
                disabled={showFullSkeleton}
                onPress={() => {
                  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                  void clearConciergeDetailPayload();
                  getPeekDetailHandlers()?.onCommit();
                }}
              >
                <Text style={[styles.peekBtnGoText, { color: colors.textInverse }]}>I’m going</Text>
              </Pressable>
            </View>
            <Pressable
              style={styles.neverShowBtn}
              hitSlop={8}
              onPress={() => {
                void (async () => {
                  await recordDecayNeverShow(suggestion);
                  void clearConciergeDetailPayload();
                  const h = getPeekDetailHandlers();
                  if (h?.onNeverShow) h.onNeverShow();
                  else router.back();
                })();
              }}
            >
              <Text style={[styles.neverShowText, { color: colors.textMuted }]}>Don’t show again</Text>
            </Pressable>
          </>
        ) : (
          <Pressable
            style={[
              styles.bottomCta,
              { backgroundColor: colors.accent },
              showFullSkeleton ? { opacity: 0.45 } : null,
            ]}
            disabled={showFullSkeleton}
            onPress={onPrimaryCta}
          >
            <Text style={[styles.bottomCtaText, { color: colors.textInverse }]}>
              {primary?.label || "Get directions"}
            </Text>
            <Ionicons
              name={primary?.action === "tickets" ? "ticket-outline" : "map-outline"}
              size={20}
              color={colors.textInverse}
            />
          </Pressable>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

function createStyles(colors: ReturnType<typeof useThemeColors>, insetBottom: number) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.bg },
    scroll: { flex: 1 },
    scrollContent: { paddingBottom: insetBottom + 8 },
    center: { flex: 1, justifyContent: "center", alignItems: "center", padding: spacing.lg },
    hero: { width: WIN_W, backgroundColor: "#000" },
    heroBar: {
      position: "absolute",
      left: 0,
      right: 0,
      top: 0,
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      paddingHorizontal: spacing.sm,
    },
    heroBarRight: { flexDirection: "row", alignItems: "center", gap: 8 },
    skLine: {
      backgroundColor: colors.bgCard,
      borderRadius: radius.sm,
      opacity: 0.9,
    },
    skBlock: {
      backgroundColor: colors.bgCard,
      borderRadius: radius.md,
      opacity: 0.9,
    },
    iconBtn: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: "rgba(0,0,0,0.45)",
      alignItems: "center",
      justifyContent: "center",
    },
    dots: {
      position: "absolute",
      bottom: 10,
      alignSelf: "center",
      backgroundColor: "rgba(0,0,0,0.5)",
      paddingHorizontal: 12,
      paddingVertical: 4,
      borderRadius: 999,
    },
    dotText: { color: "#fff", fontSize: 12, fontWeight: "700" },
    body: { paddingHorizontal: spacing.md, paddingTop: spacing.md },
    loadingRow: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: spacing.sm },
    muted: { color: colors.textMuted, fontSize: font.sizeSm },
    errorText: { color: colors.warning, marginBottom: spacing.sm },
    title: {
      fontSize: font.sizeXl,
      fontWeight: "800",
      color: colors.text,
      letterSpacing: -0.3,
    },
    venue: { fontSize: font.sizeMd, color: colors.textSub, marginTop: 4, fontWeight: "600" },
    metaRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: spacing.sm },
    metaChip: {
      fontSize: 12,
      fontWeight: "700",
      color: colors.textSub,
      textTransform: "lowercase",
    },
    rating: { marginTop: spacing.sm, fontSize: font.sizeMd, color: colors.text, fontWeight: "600" },
    badgeWhy: {
      marginTop: spacing.md,
      padding: spacing.sm,
      borderRadius: radius.md,
      borderLeftWidth: 3,
      borderLeftColor: colors.accent,
      backgroundColor: colors.bgCard,
    },
    badgeWhyLabel: { fontSize: 10, fontWeight: "800", color: colors.textMuted, marginBottom: 4 },
    badgeWhyText: { fontSize: font.sizeSm, color: colors.text, lineHeight: 20 },
    costBox: {
      marginTop: spacing.md,
      padding: spacing.md,
      borderRadius: radius.md,
      backgroundColor: colors.bgCard,
      borderWidth: 1,
      borderColor: colors.border,
    },
    costLabel: { fontSize: 11, fontWeight: "800", color: colors.textMuted, marginBottom: 4 },
    costValue: { fontSize: font.sizeLg, fontWeight: "800", color: colors.text },
    tmBtn: {
      marginTop: spacing.sm,
      alignSelf: "flex-start",
      paddingVertical: 10,
      paddingHorizontal: 18,
      borderRadius: radius.sm,
    },
    tmBtnText: { fontWeight: "800", fontSize: font.sizeMd },
    sectionTitle: {
      marginTop: spacing.lg,
      fontSize: 13,
      fontWeight: "800",
      color: colors.textMuted,
      textTransform: "uppercase",
      letterSpacing: 0.6,
    },
    sectionTitleRow: {
      marginTop: spacing.lg,
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
    },
    showtimePillRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 8,
      marginTop: spacing.sm,
    },
    showtimePill: {
      paddingVertical: 8,
      paddingHorizontal: 12,
      borderRadius: radius.sm,
      borderWidth: 1.5,
      backgroundColor: colors.bgCard,
    },
    showtimePillText: {
      fontSize: 13,
      fontWeight: "800",
    },
    paragraph: {
      marginTop: spacing.sm,
      fontSize: font.sizeMd,
      lineHeight: 24,
      color: colors.text,
      fontWeight: "500",
    },
    logLine: { marginTop: 10, fontSize: font.sizeMd, color: colors.text, lineHeight: 22 },
    secondaryOutline: {
      marginTop: spacing.md,
      alignSelf: "flex-start",
      paddingVertical: 10,
      paddingHorizontal: 14,
      borderRadius: radius.sm,
      borderWidth: 1,
      borderColor: colors.border,
    },
    secondaryOutlineText: { fontWeight: "700", color: colors.text },
    resaleRow: {
      marginTop: spacing.md,
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 10,
    },
    resaleBtn: { flex: 1, minWidth: 120, alignItems: "center" },
    actionRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginTop: spacing.sm,
      paddingVertical: 12,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    actionRowText: { fontSize: font.sizeMd, fontWeight: "700", color: colors.text },
    simRow: { marginTop: spacing.sm, marginHorizontal: -spacing.md },
    simCard: {
      width: 140,
      marginLeft: spacing.md,
      borderRadius: radius.md,
      borderWidth: 1,
      overflow: "hidden",
    },
    simImg: { width: "100%", height: 88 },
    simTitle: { padding: 8, fontSize: 12, fontWeight: "700", color: colors.text },
    bottomBar: {
      position: "absolute",
      left: 0,
      right: 0,
      bottom: 0,
      paddingHorizontal: spacing.md,
      paddingTop: 10,
      backgroundColor: colors.bg,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border,
    },
    bottomCta: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 10,
      paddingVertical: 16,
      borderRadius: radius.md,
    },
    bottomCtaText: { fontSize: 17, fontWeight: "800" },
    peekRow: {
      flexDirection: "row",
      gap: 10,
      alignItems: "stretch",
    },
    peekBtnNah: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      paddingVertical: 16,
      borderRadius: radius.md,
      borderWidth: 1,
    },
    peekBtnNahText: { fontSize: 16, fontWeight: "800" },
    peekBtnGo: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      paddingVertical: 16,
      borderRadius: radius.md,
    },
    peekBtnGoText: { fontSize: 16, fontWeight: "800" },
    neverShowBtn: { alignItems: "center", paddingVertical: 12, marginTop: 4 },
    neverShowText: { fontSize: 13, fontWeight: "600" },
    backBtn: { marginTop: spacing.md, padding: 12 },
    backBtnText: { fontWeight: "700", color: colors.accent },
    chatBubble: {
      marginTop: spacing.sm,
      padding: 12,
      borderRadius: radius.md,
      maxWidth: "85%",
    },
    chatBubbleUser: {
      alignSelf: "flex-end",
      borderBottomRightRadius: 4,
    },
    chatBubbleAssistant: {
      alignSelf: "flex-start",
      borderBottomLeftRadius: 4,
    },
    chatBubbleText: {
      fontSize: font.sizeSm,
      lineHeight: 20,
      fontWeight: "500",
    },
    chatInputRow: {
      flexDirection: "row",
      alignItems: "center",
      borderRadius: radius.md,
      borderWidth: 1,
      marginTop: spacing.md,
      paddingLeft: 14,
      paddingRight: 6,
      paddingVertical: 6,
      gap: 8,
    },
    chatInput: {
      flex: 1,
      fontSize: font.sizeMd,
      paddingVertical: 8,
    },
    chatSendBtn: {
      width: 34,
      height: 34,
      borderRadius: 17,
      alignItems: "center",
      justifyContent: "center",
    },
  });
}
