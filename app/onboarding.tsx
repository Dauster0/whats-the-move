import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Location from "expo-location";
import { router } from "expo-router";
import Ionicons from "@expo/vector-icons/Ionicons";
import { LinearGradient } from "expo-linear-gradient";
import { ConciergeHeroCard } from "../components/concierge-hero-card";
import { ConciergeSwipeDeck } from "../components/concierge-swipe-deck";
import type { ConciergeSuggestion } from "../lib/concierge-types";
import { getColors } from "../lib/theme";
import { USER_INTEREST_SECTIONS, type InterestSection } from "../lib/user-interests";
import React, { useEffect, useRef, useState } from "react";
import {
  Animated,
  Dimensions,
  PanResponder,
  Pressable,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { UserPreferences, useMoveStore } from "../store/move-context";

const { width: W, height: H } = Dimensions.get("window");

const PEACH = "#E8A87C";
const BG = "#111111";
const CARD = "#1C1C1E";
const WHITE = "#FFFFFF";
const MUTED = "#6B6B6B";
const MUTED_LIGHT = "#9A9A9A";
const TOTAL_STEPS = 18;
const DEMO_DECK_H = Math.round(H * 0.52);

const DEMO_DECK: ConciergeSuggestion[] = [
  {
    title: "Clairo at The Wiltern",
    description: "Indie pop — small venue, intimate show",
    category: "event",
    timeRequired: "2 hrs",
    energyLevel: "medium",
    address: "",
    startTime: "",
    venueName: "",
    mapQuery: "",
    unsplashQuery: "",
    whyNow: "",
    ticketUrl: "",
    ticketEventId: "",
    sourcePlaceName: "",
    photoUrl: "https://picsum.photos/seed/wtm-concert/700/420",
    deckRole: "event",
    kind: "event",
  },
  {
    title: "Birrieria Chalio",
    description: "Best birria in Koreatown, open until 3am",
    category: "eat",
    timeRequired: "45 min",
    energyLevel: "low",
    address: "",
    startTime: "",
    venueName: "",
    mapQuery: "",
    unsplashQuery: "",
    whyNow: "",
    ticketUrl: "",
    ticketEventId: "",
    sourcePlaceName: "",
    photoUrl: "https://picsum.photos/seed/wtm-tacos/700/420",
    deckRole: "food",
    kind: "place",
  },
  {
    title: "Meteor Shower at Griffith",
    description: "Peaks at 11pm, free, rare",
    category: "experience",
    timeRequired: "2 hrs",
    energyLevel: "low",
    address: "",
    startTime: "",
    venueName: "",
    mapQuery: "",
    unsplashQuery: "",
    whyNow: "",
    ticketUrl: "",
    ticketEventId: "",
    sourcePlaceName: "",
    photoUrl: "https://picsum.photos/seed/wtm-stars/700/420",
    deckRole: "experience",
    kind: "experience",
  },
];

// ─── Shared Shell ────────────────────────────────────────────────────────────

type ShellProps = {
  step: number;
  canContinue: boolean;
  continueLabel?: string;
  onContinue: () => void;
  onBack?: () => void;
  onSkip?: () => void;
  children: React.ReactNode;
  scrollable?: boolean;
};

function Shell({
  step,
  canContinue,
  continueLabel = "Continue",
  onContinue,
  onBack,
  onSkip,
  children,
  scrollable = false,
}: ShellProps) {
  const insets = useSafeAreaInsets();
  const progressAnim = useRef(new Animated.Value(step / TOTAL_STEPS)).current;

  useEffect(() => {
    Animated.timing(progressAnim, {
      toValue: step / TOTAL_STEPS,
      duration: 350,
      useNativeDriver: false,
    }).start();
  }, [step]);

  const inner = (
    <>
      {/* Progress bar area */}
      <View style={[sh.progressArea, { paddingTop: insets.top + 12 }]}>
        <View style={sh.progressTrack}>
          <Animated.View
            style={[
              sh.progressFill,
              {
                width: progressAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: ["0%", "100%"],
                }),
              },
            ]}
          />
        </View>
        <Text style={sh.stepLabel}>Step {step} of {TOTAL_STEPS}</Text>
      </View>

      {/* Content */}
      <View style={sh.content}>{children}</View>

      {/* Bottom buttons */}
      <View style={[sh.bottom, { paddingBottom: Math.max(insets.bottom, 24) }]}>
        {onBack && (
          <Pressable onPress={onBack} style={sh.backLink} hitSlop={12}>
            <Text style={sh.backText}>← Back</Text>
          </Pressable>
        )}
        {onSkip && (
          <Pressable onPress={onSkip} style={sh.skipLink} hitSlop={12}>
            <Text style={sh.skipText}>Skip this</Text>
          </Pressable>
        )}
        <Pressable
          onPress={canContinue ? onContinue : undefined}
          style={[sh.continueBtn, !canContinue && sh.continueBtnDisabled]}
          activeOpacity={canContinue ? 0.8 : 1}
        >
          <Text style={[sh.continueBtnText, !canContinue && sh.continueBtnTextDisabled]}>
            {continueLabel}
          </Text>
        </Pressable>
      </View>
    </>
  );

  if (scrollable) {
    return (
      <View style={sh.root}>
        <StatusBar barStyle="light-content" />
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ flexGrow: 1 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {inner}
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={sh.root}>
      <StatusBar barStyle="light-content" />
      {inner}
    </View>
  );
}

const sh = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: BG,
  },
  progressArea: {
    paddingHorizontal: 24,
    paddingBottom: 12,
  },
  progressTrack: {
    height: 3,
    backgroundColor: "#2A2A2A",
    borderRadius: 2,
    overflow: "hidden",
    marginBottom: 10,
  },
  progressFill: {
    height: "100%",
    backgroundColor: PEACH,
    borderRadius: 2,
  },
  stepLabel: {
    fontSize: 12,
    color: MUTED,
    fontWeight: "500",
    letterSpacing: 0.3,
  },
  content: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 8,
  },
  bottom: {
    paddingHorizontal: 24,
    paddingTop: 16,
    gap: 0,
  },
  backLink: {
    alignSelf: "flex-start",
    marginBottom: 12,
  },
  backText: {
    fontSize: 14,
    color: MUTED,
    fontWeight: "500",
  },
  skipLink: {
    alignSelf: "center",
    marginBottom: 10,
  },
  skipText: {
    fontSize: 13,
    color: MUTED,
    fontWeight: "500",
  },
  continueBtn: {
    backgroundColor: PEACH,
    borderRadius: 16,
    height: 56,
    alignItems: "center",
    justifyContent: "center",
  },
  continueBtnDisabled: {
    opacity: 0.35,
  },
  continueBtnText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#1A1A1A",
    letterSpacing: -0.2,
  },
  continueBtnTextDisabled: {
    color: "#1A1A1A",
  },
});

// ─── Screen 1 — Splash ───────────────────────────────────────────────────────

function Splash({ onContinue }: { onContinue: () => void }) {
  const insets = useSafeAreaInsets();

  return (
    <View style={sp.root}>
      <StatusBar barStyle="light-content" />

      <View style={[sp.upper, { paddingTop: insets.top + 24 }]}>
        <View style={sp.textPad}>
          <Text style={sp.eyebrow}>SOMETHING GOOD IS HAPPENING TONIGHT</Text>
          <Text style={sp.headline}>
            {"Something good\nis happening\nnear you tonight."}
          </Text>
          <Text style={sp.body}>
            {"What's the Move finds the best things happening in your city right now — and makes it effortless to just go."}
          </Text>
        </View>
      </View>

      <View style={[sp.bottom, { paddingBottom: Math.max(insets.bottom + 16, 36) }]}>
        <Pressable onPress={onContinue} style={sp.btn} activeOpacity={0.85}>
          <Text style={sp.btnText}>Show me what's out there →</Text>
        </Pressable>
        <Text style={sp.hint}>Takes 3 minutes. Worth it.</Text>
      </View>
    </View>
  );
}

const sp = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: BG,
  },
  upper: {
    flex: 1,
    overflow: "hidden",
  },
  textPad: {
    paddingHorizontal: 24,
  },
  eyebrow: {
    fontSize: 10,
    fontWeight: "700",
    color: PEACH,
    letterSpacing: 1.4,
  },
  headline: {
    fontSize: 36,
    fontWeight: "800",
    color: WHITE,
    lineHeight: 42,
    letterSpacing: -0.5,
    marginTop: 16,
    marginBottom: 10,
  },
  body: {
    fontSize: 15,
    color: MUTED_LIGHT,
    lineHeight: 22,
    marginBottom: 14,
  },
  previewLabel: {
    fontSize: 10,
    fontWeight: "700",
    color: PEACH,
    letterSpacing: 1.4,
    marginBottom: 10,
  },
  swipeHint: {
    fontSize: 12,
    color: MUTED,
    fontWeight: "500",
    textAlign: "center",
    marginTop: 10,
    paddingHorizontal: 24,
  },
  bottom: {
    paddingHorizontal: 24,
    paddingTop: 16,
  },
  btn: {
    backgroundColor: PEACH,
    borderRadius: 16,
    height: 56,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 14,
  },
  btnText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#1A1A1A",
    letterSpacing: -0.2,
  },
  hint: {
    fontSize: 13,
    color: MUTED,
    textAlign: "center",
    fontWeight: "500",
  },
});

// ─── Screen 2 — Quick Question ───────────────────────────────────────────────

const FREE_NIGHT_OPTIONS = [
  "I end up on my phone",
  "I scroll until I fall asleep",
  "I go out but it takes forever to decide",
  "I usually figure something out",
] as const;

type FreeNightStyle = (typeof FREE_NIGHT_OPTIONS)[number] | null;

function QuickQuestion({
  value,
  onSelect,
  onContinue,
  onBack,
}: {
  value: FreeNightStyle;
  onSelect: (v: FreeNightStyle) => void;
  onContinue: () => void;
  onBack: () => void;
}) {
  return (
    <Shell
      step={1}
      canContinue={value !== null}
      continueLabel="That's me →"
      onContinue={onContinue}
      onBack={onBack}
    >
      <Text style={sc.headline}>Quick question.</Text>
      <Text style={sc.subhead}>
        When you have a free night and nothing planned, what usually happens?
      </Text>

      <View style={sc.options}>
        {FREE_NIGHT_OPTIONS.map((opt) => {
          const active = value === opt;
          return (
            <Pressable
              key={opt}
              onPress={() => onSelect(opt)}
              style={[sc.pill, active && sc.pillActive]}
              activeOpacity={0.75}
            >
              <Text style={[sc.pillText, active && sc.pillTextActive]}>
                {opt}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </Shell>
  );
}

// ─── Screen 3 — Personalized Response ────────────────────────────────────────

function personalizedCopy(style: FreeNightStyle): { headline: string; body: string } {
  if (style === "I end up on my phone" || style === "I scroll until I fall asleep") {
    return {
      headline: "There's always\nsomething worth doing.",
      body: "You just never had anything making it easy to find. That changes now.",
    };
  }
  if (style === "I go out but it takes forever to decide") {
    return {
      headline: "Decision made.\nIn seconds.",
      body: "What's the Move does the finding so you can skip straight to the going.",
    };
  }
  return {
    headline: "Imagine figuring\nit out instantly.",
    body: "You're already good at this. What's the Move makes you great at it.",
  };
}

// ─── Screen 3 — Demo Preview (combined) ──────────────────────────────────────

function DemoPreview({
  onContinue,
  onBack,
}: {
  onContinue: () => void;
  onBack: () => void;
}) {
  const [demoDeck, setDemoDeck] = useState<ConciergeSuggestion[]>(DEMO_DECK);
  const colors = getColors(true);
  const deckColors = {
    accent: colors.accent,
    text: colors.text,
    textMuted: colors.textMuted,
    textInverse: colors.textInverse,
  };

  function cycleCard() {
    setDemoDeck((prev) => {
      const [first, ...rest] = prev;
      return [...rest, first];
    });
  }

  return (
    <Shell
      step={2}
      canContinue={true}
      continueLabel="Keep going"
      onContinue={onContinue}
      onBack={onBack}
    >
      <Text style={sc.headline}>Imagine figuring it out instantly.</Text>
      <Text style={sc.body}>{"You're already good at this.\nWhat's the Move makes you great at it."}</Text>

      <View style={dv.deckWrap}>
        <ConciergeSwipeDeck
          suggestions={demoDeck}
          width={W}
          height={DEMO_DECK_H}
          colors={deckColors}
          onSwipeRight={cycleCard}
          onSwipeLeft={cycleCard}
          renderCard={(s) => (
            <ConciergeHeroCard
              suggestion={s}
              width={W}
              deckMaxHeight={DEMO_DECK_H}
              imageGradientBottomColor={colors.bgCard}
              colors={colors}
              swipeMode
              onOpenMaps={() => {}}
              onOpenTickets={() => {}}
            />
          )}
        />
      </View>
      <Text style={dv.swipeHint}>Swipe to explore</Text>
    </Shell>
  );
}

const dv = StyleSheet.create({
  deckWrap: {
    marginHorizontal: -24,
    height: DEMO_DECK_H,
    marginTop: 20,
  },
  swipeHint: {
    fontSize: 12,
    color: MUTED,
    textAlign: "center",
    marginTop: 10,
  },
});

// ─── Shared content styles ────────────────────────────────────────────────────

const sc = StyleSheet.create({
  headline: {
    fontSize: 34,
    fontWeight: "800",
    color: WHITE,
    lineHeight: 40,
    letterSpacing: -0.5,
    marginBottom: 14,
    marginTop: 12,
  },
  subhead: {
    fontSize: 15,
    color: MUTED_LIGHT,
    lineHeight: 22,
    marginBottom: 8,
  },
  body: {
    fontSize: 15,
    color: MUTED_LIGHT,
    lineHeight: 22,
  },
  options: {
    gap: 12,
    marginTop: 28,
  },
  pill: {
    backgroundColor: CARD,
    borderRadius: 16,
    paddingVertical: 18,
    paddingHorizontal: 20,
    alignItems: "center",
  },
  pillActive: {
    backgroundColor: PEACH,
  },
  pillText: {
    fontSize: 15,
    fontWeight: "600",
    color: WHITE,
  },
  pillTextActive: {
    color: "#1A1A1A",
  },
});

// ─── Shared: CustomSlider ─────────────────────────────────────────────────────

function CustomSlider({
  value,
  min,
  max,
  onChange,
}: {
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
}) {
  const trackRef = useRef<View>(null);
  const trackWidthRef = useRef(W - 48);
  const trackPageXRef = useRef(0);
  // Keep onChange in a ref so the stable PanResponder always calls the latest version
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (_e, gs) => {
        const x = gs.x0 - trackPageXRef.current;
        const ratio = Math.max(0, Math.min(1, x / trackWidthRef.current));
        onChangeRef.current(Math.round(min + ratio * (max - min)));
      },
      onPanResponderMove: (_e, gs) => {
        const x = gs.moveX - trackPageXRef.current;
        const ratio = Math.max(0, Math.min(1, x / trackWidthRef.current));
        onChangeRef.current(Math.round(min + ratio * (max - min)));
      },
    })
  ).current;

  const pct = (value - min) / (max - min);

  return (
    <View
      ref={trackRef}
      style={sl.track}
      onLayout={() => {
        trackRef.current?.measure((_x, _y, w, _h, pageX) => {
          trackWidthRef.current = w;
          trackPageXRef.current = pageX;
        });
      }}
      {...panResponder.panHandlers}
    >
      <View style={[sl.fill, { width: `${pct * 100}%` }]} />
      <View style={[sl.thumb, { left: `${pct * 100}%` }]} />
    </View>
  );
}

const sl = StyleSheet.create({
  track: {
    height: 6,
    backgroundColor: "#2A2A2A",
    borderRadius: 3,
    marginTop: 16,
    marginHorizontal: 0,
    position: "relative",
    justifyContent: "center",
  },
  fill: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    backgroundColor: PEACH,
    borderRadius: 3,
  },
  thumb: {
    position: "absolute",
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: PEACH,
    top: -10,
    marginLeft: -13,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.4,
    shadowRadius: 4,
    elevation: 4,
  },
});

// ─── Shared: DrumPicker ───────────────────────────────────────────────────────

const ITEM_H = 52;
const VISIBLE = 5;

function DrumPicker({
  items,
  selected,
  onSelect,
}: {
  items: string[];
  selected: string;
  onSelect: (v: string) => void;
}) {
  const scrollRef = useRef<ScrollView>(null);
  const [selIdx, setSelIdx] = useState(Math.max(0, items.indexOf(selected)));

  useEffect(() => {
    const idx = Math.max(0, items.indexOf(selected));
    scrollRef.current?.scrollTo({ y: idx * ITEM_H, animated: false });
    setSelIdx(idx);
  }, []);

  function snap(y: number) {
    const idx = Math.max(0, Math.min(items.length - 1, Math.round(y / ITEM_H)));
    setSelIdx(idx);
    onSelect(items[idx]);
  }

  return (
    <View style={dp.wrap}>
      {/* Center highlight */}
      <View style={dp.highlight} pointerEvents="none" />
      <ScrollView
        ref={scrollRef}
        snapToInterval={ITEM_H}
        decelerationRate="fast"
        showsVerticalScrollIndicator={false}
        onScrollEndDrag={(e) => snap(e.nativeEvent.contentOffset.y)}
        onMomentumScrollEnd={(e) => snap(e.nativeEvent.contentOffset.y)}
        contentContainerStyle={{ paddingVertical: ITEM_H * 2 }}
      >
        {items.map((item, i) => {
          const dist = Math.abs(i - selIdx);
          return (
            <View key={item} style={dp.item}>
              <Text
                style={[
                  dp.itemText,
                  dist === 0 && dp.itemTextActive,
                  { opacity: dist === 0 ? 1 : dist === 1 ? 0.4 : 0.15 },
                ]}
              >
                {item}
              </Text>
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}

const dp = StyleSheet.create({
  wrap: {
    height: ITEM_H * VISIBLE,
    overflow: "hidden",
    position: "relative",
  },
  highlight: {
    position: "absolute",
    top: ITEM_H * 2,
    left: 0,
    right: 0,
    height: ITEM_H,
    backgroundColor: "rgba(232,168,124,0.08)",
    borderRadius: 10,
    zIndex: 1,
    borderWidth: 1,
    borderColor: "rgba(232,168,124,0.15)",
  },
  item: {
    height: ITEM_H,
    alignItems: "center",
    justifyContent: "center",
  },
  itemText: {
    fontSize: 16,
    color: MUTED,
    fontWeight: "400",
  },
  itemTextActive: {
    fontSize: 18,
    color: WHITE,
    fontWeight: "700",
  },
});

// ─── Screen 5 — Create Account ────────────────────────────────────────────────

function CreateAccount({
  shellStep,
  onEmail,
  onSocial,
  onBack,
}: {
  shellStep: number;
  onEmail: () => void;
  onSocial: () => void;
  onBack: () => void;
}) {
  const [chosen, setChosen] = useState(false);

  function handleSocial(provider: string) {
    // Placeholder — would trigger expo-auth-session here
    setChosen(true);
    setTimeout(onSocial, 100);
  }

  return (
    <Shell
      step={shellStep}
      canContinue={false}
      onContinue={() => {}}
      onBack={onBack}
    >
      <Text style={sc.headline}>{"First, let's save\nyour spot."}</Text>
      <Text style={sc.subhead}>
        Create an account so your moves and preferences are always waiting.
      </Text>

      <View style={ca.buttons}>
        <Pressable
          style={ca.authBtn}
          onPress={() => handleSocial("apple")}
          activeOpacity={0.75}
        >
          <Ionicons name="logo-apple" size={20} color={WHITE} style={ca.authIconView} />
          <Text style={ca.authText}>Continue with Apple</Text>
        </Pressable>

        <Pressable
          style={ca.authBtn}
          onPress={() => handleSocial("google")}
          activeOpacity={0.75}
        >
          <Ionicons name="logo-google" size={20} color={WHITE} style={ca.authIconView} />
          <Text style={ca.authText}>Continue with Google</Text>
        </Pressable>

        <Pressable style={ca.authBtn} onPress={onEmail} activeOpacity={0.75}>
          <Ionicons name="mail" size={20} color={WHITE} style={ca.authIconView} />
          <Text style={ca.authText}>Continue with Email</Text>
        </Pressable>
      </View>

      <Text style={ca.privacy}>We never post or share anything. Ever.</Text>
    </Shell>
  );
}

const ca = StyleSheet.create({
  buttons: {
    gap: 12,
    marginTop: 32,
  },
  authBtn: {
    backgroundColor: CARD,
    borderRadius: 16,
    height: 58,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    gap: 14,
  },
  authIconView: {
    width: 24,
    textAlign: "center",
  },
  authText: {
    fontSize: 15,
    fontWeight: "600",
    color: WHITE,
  },
  privacy: {
    fontSize: 13,
    color: MUTED,
    textAlign: "center",
    marginTop: 24,
  },
});

// ─── Screen 6 — Email Confirm ─────────────────────────────────────────────────

function EmailConfirm({
  shellStep,
  onContinue,
  onBack,
}: {
  shellStep: number;
  onContinue: () => void;
  onBack: () => void;
}) {
  return (
    <Shell
      step={shellStep}
      canContinue={true}
      continueLabel="I confirmed it →"
      onContinue={onContinue}
      onBack={onBack}
    >
      <View style={ec.center}>
        <Ionicons name="mail" size={52} color={PEACH} />
      </View>
      <Text style={[sc.headline, { textAlign: "center" }]}>
        Check your email.
      </Text>
      <Text style={[sc.body, { textAlign: "center" }]}>
        We sent a confirmation link. Tap it and come right back.
      </Text>
      <Pressable style={ec.resend} hitSlop={12}>
        <Text style={ec.resendText}>Resend email</Text>
      </Pressable>
    </Shell>
  );
}

const ec = StyleSheet.create({
  center: {
    alignItems: "center",
    marginTop: 32,
    marginBottom: 16,
  },
  icon: {
    fontSize: 64,
  },
  resend: {
    alignSelf: "center",
    marginTop: 20,
  },
  resendText: {
    fontSize: 14,
    color: MUTED,
    fontWeight: "500",
  },
});

// ─── Screen 7 — Location ──────────────────────────────────────────────────────

function LocationScreen({
  shellStep,
  onContinue,
  onBack,
  onGranted,
  onNeighborhood,
}: {
  shellStep: number;
  onContinue: () => void;
  onBack: () => void;
  onGranted: (coords: { lat: number; lon: number }) => void;
  onNeighborhood: (name: string) => void;
}) {
  const [granted, setGranted] = useState(false);
  const [requesting, setRequesting] = useState(false);
  const pulseScale = useRef(new Animated.Value(1)).current;
  const pulseOpacity = useRef(new Animated.Value(0.6)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.parallel([
          Animated.timing(pulseScale, { toValue: 1.5, duration: 1100, useNativeDriver: true }),
          Animated.timing(pulseOpacity, { toValue: 0, duration: 1100, useNativeDriver: true }),
        ]),
        Animated.parallel([
          Animated.timing(pulseScale, { toValue: 1, duration: 0, useNativeDriver: true }),
          Animated.timing(pulseOpacity, { toValue: 0.6, duration: 0, useNativeDriver: true }),
        ]),
      ])
    ).start();
  }, []);

  async function requestLocation() {
    setRequesting(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === "granted") {
        const pos = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        onGranted({ lat: pos.coords.latitude, lon: pos.coords.longitude });
        try {
          const [geo] = await Location.reverseGeocodeAsync({
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
          });
          const neighborhood =
            geo?.district || geo?.subregion || geo?.city || geo?.name || "";
          if (neighborhood) onNeighborhood(neighborhood);
        } catch {
          // reverse geocode failed — neighborhood stays as fallback
        }
        setGranted(true);
      }
    } catch (e) {
      // permission denied — still let them continue
      setGranted(true);
    }
    setRequesting(false);
  }

  return (
    <Shell
      step={shellStep}
      canContinue={granted}
      continueLabel="Got it →"
      onContinue={onContinue}
      onBack={onBack}
    >
      <View style={lo.iconWrap}>
        <Animated.View
          style={[
            lo.pulse,
            { transform: [{ scale: pulseScale }], opacity: pulseOpacity },
          ]}
        />
        <Ionicons name="location" size={38} color={PEACH} style={{ zIndex: 1 }} />
      </View>

      <Text style={sc.headline}>{"Where are you\nright now?"}</Text>
      <Text style={sc.body}>
        What's the Move finds things near you — not near some city you typed in.
        The closer we know, the better the move.
      </Text>

      <Pressable
        style={[lo.btn, granted && lo.btnGranted]}
        onPress={requesting || granted ? undefined : requestLocation}
        activeOpacity={0.75}
      >
        <Text style={lo.btnText}>
          {granted ? "Location locked in" : requesting ? "Getting location…" : "Use my location"}
        </Text>
      </Pressable>

      <Text style={lo.privacy}>
        Only used to find moves near you. Never stored or sold.
      </Text>
    </Shell>
  );
}

const lo = StyleSheet.create({
  iconWrap: {
    alignItems: "center",
    justifyContent: "center",
    height: 100,
    marginTop: 24,
    marginBottom: 8,
  },
  pulse: {
    position: "absolute",
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: PEACH,
  },
  pin: {
    fontSize: 44,
    zIndex: 1,
  },
  btn: {
    backgroundColor: CARD,
    borderRadius: 16,
    height: 58,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 32,
  },
  btnGranted: {
    backgroundColor: "#1E2A1A",
    borderWidth: 1,
    borderColor: "#4A7A40",
  },
  btnText: {
    fontSize: 15,
    fontWeight: "600",
    color: WHITE,
  },
  privacy: {
    fontSize: 12,
    color: MUTED,
    textAlign: "center",
    marginTop: 16,
    lineHeight: 18,
  },
});

// ─── Screen 8 — Age ───────────────────────────────────────────────────────────

function AgeScreen({
  shellStep,
  value,
  onChange,
  onContinue,
  onBack,
}: {
  shellStep: number;
  value: number;
  onChange: (v: number) => void;
  onContinue: () => void;
  onBack: () => void;
}) {
  const displayAge = value >= 65 ? "65+" : String(value);

  return (
    <Shell
      step={shellStep}
      canContinue={true}
      continueLabel="That's my age →"
      onContinue={onContinue}
      onBack={onBack}
    >
      <Text style={sc.headline}>How old are you?</Text>
      <Text style={sc.subhead}>
        This shapes everything — the moves we find, the venues, the vibe.
      </Text>

      <View style={ag.ageWrap}>
        <Text style={ag.ageNum}>{displayAge}</Text>
      </View>

      <CustomSlider value={value} min={16} max={65} onChange={onChange} />

      <View style={ag.rangeRow}>
        <Text style={ag.rangeText}>16</Text>
        <Text style={ag.rangeText}>65+</Text>
      </View>
    </Shell>
  );
}

const ag = StyleSheet.create({
  ageWrap: {
    alignItems: "center",
    justifyContent: "center",
    marginTop: 40,
    marginBottom: 32,
  },
  ageNum: {
    fontSize: 96,
    fontWeight: "800",
    color: WHITE,
    letterSpacing: -5,
    lineHeight: 104,
    textAlign: "center",
  },
  rangeRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 8,
  },
  rangeText: {
    fontSize: 12,
    color: MUTED,
    fontWeight: "500",
  },
});

// ─── Screen 9 — Gender ────────────────────────────────────────────────────────

const GENDER_OPTIONS = ["Man", "Woman", "Non-binary", "Prefer not to say"] as const;
type Gender = (typeof GENDER_OPTIONS)[number] | null;

function GenderScreen({
  shellStep,
  value,
  onSelect,
  onContinue,
  onBack,
}: {
  shellStep: number;
  value: Gender;
  onSelect: (v: Gender) => void;
  onContinue: () => void;
  onBack: () => void;
}) {
  return (
    <Shell
      step={shellStep}
      canContinue={value !== null}
      continueLabel="Continue →"
      onContinue={onContinue}
      onBack={onBack}
    >
      <Text style={sc.headline}>{"How do you\nidentify?"}</Text>
      <Text style={sc.subhead}>
        Helps us tailor certain recommendations to you.
      </Text>

      <View style={sc.options}>
        {GENDER_OPTIONS.map((opt) => {
          const active = value === opt;
          return (
            <Pressable
              key={opt}
              onPress={() => onSelect(opt)}
              style={[sc.pill, active && sc.pillActive]}
              activeOpacity={0.75}
            >
              <Text style={[sc.pillText, active && sc.pillTextActive]}>
                {opt}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </Shell>
  );
}

// ─── Screen 10 — Mid Sell ────────────────────────────────────────────────────

function midSellHeadline(age: number, neighborhood: string): string {
  if (age <= 22) return `You're in the best city\nin the world to be ${age}.\nAct like it.`;
  if (age <= 29) return `${neighborhood} has more\ngoing on than you think.`;
  return "There's a version of LA\nmost people never find.";
}

function midSellBody(interests: string[], neighborhood: string): string {
  const has = (...keys: string[]) => keys.every((k) => interests.includes(k));
  const hasAny = (...keys: string[]) => keys.some((k) => interests.includes(k));

  if (has("live_music", "comedy"))
    return "Live shows at a venue that holds 80 people. A comedy show so good you'll text someone about it on the way home.";
  if (has("food", "late_night"))
    return "A taco spot open until 3am you'd never find on Yelp. The kind of place you tell people about.";
  if (has("beach", "hiking"))
    return "A trail with a view that most people in this city have never seen. Worth waking up early for.";
  if (has("nightlife", "dancing"))
    return "A rooftop that doesn't show up on any list. The kind of night you didn't plan but never forget.";
  if (has("arcade", "bowling"))
    return "Places that make a Tuesday night feel like an event. No planning needed.";
  return `Spots in ${neighborhood} that most people walk past every day and never go inside. You're about to.`;
}

function MidSell({
  shellStep,
  userAge,
  userNeighborhood,
  userInterests,
  onContinue,
  onBack,
}: {
  shellStep: number;
  userAge: number;
  userNeighborhood: string;
  userInterests: string[];
  onContinue: () => void;
  onBack: () => void;
}) {
  const headline = midSellHeadline(userAge, userNeighborhood);
  const body = midSellBody(userInterests, userNeighborhood);

  return (
    <Shell
      step={shellStep}
      canContinue={true}
      continueLabel="Show me →"
      onContinue={onContinue}
      onBack={onBack}
    >
      <LinearGradient
        colors={["#2C1810", "#1a1a1a"]}
        style={ms.imgCard}
      />

      <Text style={[sc.headline, { marginTop: 24 }]}>{headline}</Text>
      <Text style={sc.body}>{body}</Text>
    </Shell>
  );
}

const ms = StyleSheet.create({
  imgCard: {
    borderRadius: 20,
    overflow: "hidden",
    height: 180,
    marginTop: 8,
  },
});

// ─── Screens 11–15 — Interests (5 screens) ────────────────────────────────────

// Section groups by screen (indexes into USER_INTEREST_SECTIONS)
// Sections order: Basics[0], Sports[1], Food[2], Arts[3], Social[4],
//                 Outdoors[5], Chill[6], Learning[7]
const INTEREST_SCREENS: { headline: string; sectionIndexes: number[] }[] = [
  { headline: "What gets you off the couch?", sectionIndexes: [0] },
  { headline: "What do you play?",            sectionIndexes: [1] },
  { headline: "How do you eat and drink?",    sectionIndexes: [2] },
  { headline: "What's your scene?",           sectionIndexes: [3, 4] },
  { headline: "Where do you go?",             sectionIndexes: [5, 6, 7] },
];

function InterestStep({
  shellStep,
  sections,
  headline,
  selected,
  onToggle,
  isLast,
  onContinue,
  onSkip,
  onBack,
}: {
  shellStep: number;
  sections: InterestSection[];
  headline: string;
  selected: string[];
  onToggle: (key: string) => void;
  isLast: boolean;
  onContinue: () => void;
  onSkip: () => void;
  onBack: () => void;
}) {
  return (
    <Shell
      step={shellStep}
      canContinue={true}
      continueLabel={isLast ? "That's me" : "Next"}
      onContinue={onContinue}
      onBack={onBack}
      onSkip={onSkip}
      scrollable
    >
      <Text style={sc.headline}>{headline}</Text>

      {sections.map((section) => (
        <View key={section.title} style={ig.sectionBlock}>
          {sections.length > 1 && (
            <Text style={ig.sectionHeading}>{section.title}</Text>
          )}
          <View style={ig.grid}>
            {section.items.map(({ key, label }) => {
              const active = selected.includes(key);
              return (
                <Pressable
                  key={key}
                  onPress={() => onToggle(key)}
                  style={[ig.chip, active && ig.chipActive]}
                  activeOpacity={0.75}
                >
                  <Text style={[ig.chipText, active && ig.chipTextActive]}>
                    {label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      ))}
    </Shell>
  );
}

const ig = StyleSheet.create({
  sectionBlock: {
    marginTop: 20,
  },
  sectionHeading: {
    fontSize: 11,
    fontWeight: "800",
    color: MUTED,
    letterSpacing: 0.6,
    textTransform: "uppercase",
    marginBottom: 10,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  chip: {
    backgroundColor: CARD,
    borderRadius: 999,
    paddingVertical: 11,
    paddingHorizontal: 14,
    borderWidth: 1.5,
    borderColor: "#2A2A2A",
  },
  chipActive: {
    backgroundColor: PEACH,
    borderColor: PEACH,
  },
  chipText: {
    fontSize: 13,
    fontWeight: "700",
    color: WHITE,
  },
  chipTextActive: {
    color: "#1A1A1A",
  },
});

// ─── Screen 16 — Budget ───────────────────────────────────────────────────────

type BudgetOption = "free" | "cheap" | "splurge" | "varies";

const BUDGET_OPTIONS: { key: BudgetOption; label: string }[] = [
  { key: "free",    label: "Free or close to it — $0 to $15" },
  { key: "cheap",   label: "A little to spend — $15 to $30" },
  { key: "splurge", label: "Worth it money — $30 and up" },
  { key: "varies",  label: "It varies" },
];

function BudgetScreen({
  shellStep,
  value,
  onSelect,
  onContinue,
  onBack,
}: {
  shellStep: number;
  value: BudgetOption | null;
  onSelect: (v: BudgetOption) => void;
  onContinue: () => void;
  onBack: () => void;
}) {
  return (
    <Shell
      step={shellStep}
      canContinue={value !== null}
      continueLabel="That works →"
      onContinue={onContinue}
      onBack={onBack}
    >
      <Text style={sc.headline}>{"What's your usual\nbudget for a night out?"}</Text>
      <Text style={sc.subhead}>No judgment — this just helps us find the right moves.</Text>

      <View style={bu.pills}>
        {BUDGET_OPTIONS.map((opt) => {
          const selected = value === opt.key;
          return (
            <TouchableOpacity
              key={opt.key}
              style={[bu.pill, selected && bu.pillSelected]}
              activeOpacity={0.75}
              onPress={() => onSelect(opt.key)}
            >
              <Text style={[bu.pillText, selected && bu.pillTextSelected]}>{opt.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </Shell>
  );
}

const bu = StyleSheet.create({
  pills: {
    marginTop: 32,
    gap: 12,
  },
  pill: {
    width: "100%",
    paddingVertical: 18,
    paddingHorizontal: 20,
    borderRadius: 14,
    backgroundColor: CARD,
    borderWidth: 1.5,
    borderColor: "#2A2A2A",
    alignItems: "center",
  },
  pillSelected: {
    borderColor: PEACH,
    backgroundColor: "#2C1810",
  },
  pillText: {
    fontSize: 16,
    fontWeight: "600",
    color: MUTED_LIGHT,
  },
  pillTextSelected: {
    color: PEACH,
  },
});

// ─── Screen 15 — Social Battery ───────────────────────────────────────────────

type SocialStyle = "solo" | "small_group" | "big_group" | "depends" | null;

const SOCIAL_OPTIONS: { key: SocialStyle; icon: keyof typeof Ionicons.glyphMap; label: string; sub: string; confirm: string }[] = [
  {
    key: "solo",
    icon: "headset",
    label: "Flying solo",
    sub: "I do my best stuff alone or I'm usually on my own",
    confirm: "Some of the best moves are better alone anyway.",
  },
  {
    key: "small_group",
    icon: "people",
    label: "Small circle",
    sub: "One or two people I actually like",
    confirm: "We'll find moves worth sharing.",
  },
  {
    key: "big_group",
    icon: "bonfire",
    label: "Big energy",
    sub: "The more people the better",
    confirm: "We'll find moves worth texting the whole group about.",
  },
  {
    key: "depends",
    icon: "shuffle",
    label: "Depends on the vibe",
    sub: "",
    confirm: "We'll read the room.",
  },
];

function SocialBattery({
  shellStep,
  value,
  onSelect,
  onContinue,
  onBack,
}: {
  shellStep: number;
  value: SocialStyle;
  onSelect: (v: SocialStyle) => void;
  onContinue: () => void;
  onBack: () => void;
}) {
  const chosen = SOCIAL_OPTIONS.find((o) => o.key === value);

  return (
    <Shell
      step={shellStep}
      canContinue={value !== null}
      continueLabel="That's me →"
      onContinue={onContinue}
      onBack={onBack}
      scrollable
    >
      <Text style={sc.headline}>{"On a typical free night,\nyou're most likely..."}</Text>

      <View style={sb.cards}>
        {SOCIAL_OPTIONS.map((opt) => {
          const active = value === opt.key;
          return (
            <Pressable
              key={opt.key}
              onPress={() => onSelect(opt.key)}
              style={[sb.card, active && sb.cardActive]}
              activeOpacity={0.75}
            >
              <Ionicons
                name={opt.icon}
                size={22}
                color={active ? PEACH : MUTED_LIGHT}
                style={sb.icon}
              />
              <View style={sb.cardText}>
                <Text style={[sb.label, active && sb.labelActive]}>{opt.label}</Text>
                {opt.sub ? (
                  <Text style={[sb.sub, active && sb.subActive]}>{opt.sub}</Text>
                ) : null}
              </View>
            </Pressable>
          );
        })}
      </View>

      {chosen && (
        <Text style={sb.confirm}>{chosen.confirm}</Text>
      )}
    </Shell>
  );
}

const sb = StyleSheet.create({
  cards: {
    gap: 12,
    marginTop: 24,
  },
  card: {
    backgroundColor: CARD,
    borderRadius: 16,
    padding: 18,
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    borderWidth: 1.5,
    borderColor: "transparent",
  },
  cardActive: {
    borderColor: PEACH,
    backgroundColor: "#201A12",
  },
  icon: {
    fontSize: 26,
    width: 36,
    textAlign: "center",
  },
  cardText: {
    flex: 1,
  },
  label: {
    fontSize: 15,
    fontWeight: "700",
    color: WHITE,
    marginBottom: 2,
  },
  labelActive: {
    color: PEACH,
  },
  sub: {
    fontSize: 13,
    color: MUTED,
  },
  subActive: {
    color: MUTED_LIGHT,
  },
  confirm: {
    fontSize: 14,
    color: PEACH,
    textAlign: "center",
    marginTop: 20,
    fontWeight: "500",
    fontStyle: "italic",
  },
});

// ─── Screen 16 — Notifications ───────────────────────────────────────────────

function NotificationsScreen({
  shellStep,
  onContinue,
  onBack,
}: {
  shellStep: number;
  onContinue: () => void;
  onBack: () => void;
}) {
  const [chosen, setChosen] = useState(false);

  async function requestNotifications() {
    try {
      const { default: Notifications } = await import("expo-notifications");
      await Notifications.requestPermissionsAsync();
    } catch {}
    setChosen(true);
    onContinue();
  }

  function skip() {
    setChosen(true);
    onContinue();
  }

  return (
    <Shell
      step={shellStep}
      canContinue={chosen}
      continueLabel="Continue →"
      onContinue={onContinue}
      onBack={onBack}
    >
      {/* Notification mockup card */}
      <View style={no.mockCard}>
        <View style={no.mockIcon}>
          <Ionicons name="notifications" size={22} color={PEACH} />
        </View>
        <View style={no.mockBody}>
          <Text style={no.mockApp}>What's the Move</Text>
          <Text style={no.mockMsg}>
            There's a meteor shower visible from Griffith tonight at 11pm. Go.
          </Text>
        </View>
      </View>

      <Text style={[sc.headline, { marginTop: 28 }]}>
        {"Don't miss the\ngood stuff."}
      </Text>
      <Text style={sc.body}>
        Some moves only last one night. We'll tap you when something rare is
        happening near you.
      </Text>

      <View style={no.buttons}>
        <Pressable style={no.notifyBtn} onPress={requestNotifications} activeOpacity={0.8}>
          <Text style={no.notifyBtnText}>Notify me about rare moves</Text>
        </Pressable>
        <Pressable onPress={skip} style={no.skipBtn} hitSlop={12} activeOpacity={0.7}>
          <Text style={no.skipBtnText}>Not right now</Text>
        </Pressable>
      </View>
    </Shell>
  );
}

const no = StyleSheet.create({
  mockCard: {
    backgroundColor: CARD,
    borderRadius: 16,
    padding: 16,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    marginTop: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  mockIcon: {
    width: 44,
    height: 44,
    borderRadius: 10,
    backgroundColor: "#2A2015",
    alignItems: "center",
    justifyContent: "center",
  },
  mockIconText: { fontSize: 22 },
  mockBody: { flex: 1 },
  mockApp: {
    fontSize: 12,
    fontWeight: "700",
    color: MUTED_LIGHT,
    marginBottom: 4,
    letterSpacing: 0.2,
  },
  mockMsg: {
    fontSize: 14,
    color: WHITE,
    lineHeight: 20,
  },
  buttons: {
    gap: 14,
    marginTop: 36,
  },
  notifyBtn: {
    backgroundColor: CARD,
    borderRadius: 16,
    height: 56,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    borderColor: PEACH,
  },
  notifyBtnText: {
    fontSize: 15,
    fontWeight: "700",
    color: PEACH,
  },
  skipBtn: {
    alignSelf: "center",
    paddingVertical: 8,
  },
  skipBtnText: {
    fontSize: 14,
    color: MUTED,
    fontWeight: "500",
  },
});

// ─── Screen 17 — Setup ────────────────────────────────────────────────────────

function setupSubhead(style: SocialStyle): string {
  if (style === "solo") return "Building moves you can do on your own terms.";
  if (style === "small_group") return "Building moves for you and your people.";
  if (style === "big_group") return "Building moves worth texting the whole group about.";
  return "Building moves for whatever tonight turns out to be.";
}

const CHECKLIST_DELAY = 700; // ms between each item appearing

function SetupScreen({
  shellStep,
  userNeighborhood,
  userInterests,
  userBudget,
  userSocialStyle,
  onDone,
}: {
  shellStep: number;
  userNeighborhood: string;
  userInterests: string[];
  userBudget: BudgetOption | null;
  userSocialStyle: SocialStyle;
  onDone: () => void;
}) {
  const insets = useSafeAreaInsets();
  const subhead = setupSubhead(userSocialStyle);
  const budgetLabel =
    userBudget === "free" ? "$0–$15"
    : userBudget === "cheap" ? "$15–$30"
    : userBudget === "splurge" ? "$30+"
    : "varies";

  const checklistItems = [
    `${userNeighborhood} locked in`,
    `${userInterests.length} interest${userInterests.length !== 1 ? "s" : ""} saved`,
    `Budget set — up to ${budgetLabel}`,
    "Pulling what's open near you...",
    "Building your first deck...",
  ];

  // Visibility state per item (0 = hidden, 1 = visible)
  const [visible, setVisible] = useState<boolean[]>(checklistItems.map(() => false));
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const progressAnim = useRef(new Animated.Value((shellStep - 1) / TOTAL_STEPS)).current;

  useEffect(() => {
    // Reveal items one by one
    checklistItems.forEach((_, i) => {
      setTimeout(() => {
        setVisible((prev) => {
          const next = [...prev];
          next[i] = true;
          return next;
        });
      }, i * CHECKLIST_DELAY + 300);
    });

    // After all items shown, pulse the last one
    const pulseStart = checklistItems.length * CHECKLIST_DELAY + 300;
    setTimeout(() => {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 0.3, duration: 600, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
        ])
      ).start();
    }, pulseStart);

    // Fill progress bar to 100%
    Animated.timing(progressAnim, {
      toValue: 1,
      duration: checklistItems.length * CHECKLIST_DELAY + 800,
      useNativeDriver: false,
    }).start();

    // Auto-advance after 4 seconds
    const timer = setTimeout(onDone, 4000);
    return () => clearTimeout(timer);
  }, []);

  return (
    <View style={[se.root, { backgroundColor: BG }]}>
      {/* Progress bar (manual since no Shell) */}
      <View style={[se.progressArea, { paddingTop: insets.top + 12 }]}>
        <View style={se.progressTrack}>
          <Animated.View
            style={[
              se.progressFill,
              {
                width: progressAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: ["0%", "100%"],
                }),
              },
            ]}
          />
        </View>
        <Text style={se.stepLabel}>Step {shellStep} of {TOTAL_STEPS}</Text>
      </View>

      <View style={se.content}>
        <Text style={se.headline}>Almost there.</Text>
        <Text style={se.subhead}>{subhead}</Text>

        <View style={se.checklist}>
          {checklistItems.map((item, i) => {
            const isLast = i === checklistItems.length - 1;
            const isVisible = visible[i];

            return (
              <Animated.View
                key={i}
                style={[
                  se.checkRow,
                  { opacity: isVisible ? (isLast ? pulseAnim : 1) : 0 },
                ]}
              >
                {isLast ? (
                  <Animated.Text style={[se.checkIcon, se.checkIconSpin, { opacity: pulseAnim }]}>
                    ⟳
                  </Animated.Text>
                ) : (
                  <Text style={se.checkIcon}>✓</Text>
                )}
                <Text style={[se.checkText, isLast && se.checkTextLast]}>
                  {item}
                </Text>
              </Animated.View>
            );
          })}
        </View>
      </View>
    </View>
  );
}

const se = StyleSheet.create({
  root: { flex: 1 },
  progressArea: {
    paddingHorizontal: 24,
    paddingBottom: 12,
  },
  progressTrack: {
    height: 3,
    backgroundColor: "#2A2A2A",
    borderRadius: 2,
    overflow: "hidden",
    marginBottom: 10,
  },
  progressFill: {
    height: "100%",
    backgroundColor: PEACH,
    borderRadius: 2,
  },
  stepLabel: {
    fontSize: 12,
    color: MUTED,
    fontWeight: "500",
    letterSpacing: 0.3,
  },
  content: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 16,
    justifyContent: "center",
  },
  headline: {
    fontSize: 34,
    fontWeight: "800",
    color: WHITE,
    letterSpacing: -0.5,
    marginBottom: 10,
  },
  subhead: {
    fontSize: 15,
    color: MUTED_LIGHT,
    lineHeight: 22,
    marginBottom: 48,
  },
  checklist: {
    gap: 20,
  },
  checkRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  checkIcon: {
    fontSize: 18,
    color: PEACH,
    width: 24,
    textAlign: "center",
    fontWeight: "700",
  },
  checkIconSpin: {
    color: PEACH,
  },
  checkText: {
    fontSize: 16,
    color: WHITE,
    fontWeight: "500",
  },
  checkTextLast: {
    color: PEACH,
  },
});

// ─── Screen 18 — Payoff ───────────────────────────────────────────────────────

function Payoff({
  userNeighborhood,
  userInterests,
  onFinish,
}: {
  userNeighborhood: string;
  userInterests: string[];
  onFinish: () => void;
}) {
  const insets = useSafeAreaInsets();

  return (
    <View style={[py.root]}>
      {/* Hero — top 70% */}
      <LinearGradient colors={["#2C1810", "#1a1a1a"]} style={py.hero}>
        {/* Text over gradient */}
        <View style={py.heroText}>
          <Text style={py.headline}>
            {`${userNeighborhood} is\nwaiting for you.`}
          </Text>
          <Text style={py.sub}>
            {`${userInterests.length} interest${userInterests.length !== 1 ? "s" : ""}. Your city. Right now.`}
          </Text>
        </View>
      </LinearGradient>

      {/* Bottom action */}
      <View style={[py.bottom, { paddingBottom: Math.max(insets.bottom + 16, 36) }]}>
        <Pressable style={py.btn} onPress={onFinish} activeOpacity={0.85}>
          <Text style={py.btnText}>What's the move? →</Text>
        </Pressable>
      </View>
    </View>
  );
}

const py = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: BG,
  },
  hero: {
    height: "70%",
    overflow: "hidden",
    position: "relative",
  },
  heroText: {
    position: "absolute",
    bottom: 32,
    left: 24,
    right: 24,
  },
  headline: {
    fontSize: 40,
    fontWeight: "800",
    color: WHITE,
    lineHeight: 46,
    letterSpacing: -0.8,
    marginBottom: 12,
  },
  sub: {
    fontSize: 15,
    color: MUTED_LIGHT,
    lineHeight: 22,
  },
  bottom: {
    flex: 1,
    paddingHorizontal: 24,
    justifyContent: "flex-end",
  },
  btn: {
    backgroundColor: PEACH,
    borderRadius: 16,
    height: 56,
    alignItems: "center",
    justifyContent: "center",
  },
  btnText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#1A1A1A",
    letterSpacing: -0.2,
  },
});

// ─── Root Onboarding Component ────────────────────────────────────────────────

// Maps internal step index → Shell progress step, accounting for email skip
function shellStep(internal: number, emailChosen: boolean): number {
  if (internal <= 3) return internal;
  if (internal === 4) return 4; // email confirm, always step 4
  return emailChosen ? internal : internal - 1;
}

export default function OnboardingScreen() {
  const { setPreferencesAndFinishOnboarding } = useMoveStore();

  const [step, setStep] = useState(0);
  const [emailChosen, setEmailChosen] = useState(false);

  // Collected data
  const [freeNightStyle, setFreeNightStyle] = useState<FreeNightStyle>(null);
  const [userAge, setUserAge] = useState(22);
  const [userGender, setUserGender] = useState<Gender>(null);
  const [userNeighborhood, setUserNeighborhood] = useState<string>("");
  const [userLocation, setUserLocation] = useState<{ lat: number; lon: number } | null>(null);
  const [userInterests, setUserInterests] = useState<string[]>([]);
  const [userBudget, setUserBudget] = useState<BudgetOption | null>(null);
  const [userSocialStyle, setUserSocialStyle] = useState<SocialStyle>(null);

  function toggleInterest(key: string) {
    setUserInterests((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );
  }

  function goNext() {
    setStep((s) => s + 1);
  }

  function goBack() {
    if (step === 5 && !emailChosen) {
      // skipped email, back from location → back to create account
      setStep(3);
    } else {
      setStep((s) => Math.max(0, s - 1));
    }
  }

  function handleEmailChosen() {
    setEmailChosen(true);
    setStep(4); // email confirm
  }

  function handleSocialChosen() {
    setEmailChosen(false);
    setStep(5); // skip email confirm, go to location
  }

  async function finish() {
    const ageRange: UserPreferences["ageRange"] =
      userAge < 18 ? "under18"
      : userAge <= 21 ? "18-21"
      : userAge <= 24 ? "18-24"
      : userAge <= 34 ? "25-34"
      : userAge <= 44 ? "35-44"
      : "45+";

    const budgetPref: UserPreferences["budget"] =
      userBudget === "free" ? "free" : userBudget === "cheap" ? "cheap" : "flexible";

    const socialBatteryPref: UserPreferences["socialBattery"] =
      userSocialStyle === "solo" ? "introvert"
      : userSocialStyle === "big_group" ? "extrovert"
      : "ambivert";

    const socialModePref: UserPreferences["socialMode"] =
      userSocialStyle === "solo" ? "solo"
      : userSocialStyle === "big_group" || userSocialStyle === "small_group" ? "social"
      : "both";

    await Promise.all([
      AsyncStorage.setItem("hasCompletedOnboarding", "true"),
      AsyncStorage.setItem("has_finished_onboarding", "true"),
      AsyncStorage.setItem("freeNightStyle", freeNightStyle ?? ""),
      AsyncStorage.setItem("userAge", String(userAge)),
      AsyncStorage.setItem("userGender", userGender ?? ""),
      AsyncStorage.setItem("userNeighborhood", userNeighborhood),
      AsyncStorage.setItem("userLocation", JSON.stringify(userLocation)),
      AsyncStorage.setItem("userInterests", JSON.stringify(userInterests)),
      AsyncStorage.setItem("userBudget", userBudget ?? ""),
      AsyncStorage.setItem("userSocialStyle", userSocialStyle ?? ""),
    ]);
    console.log("Onboarding complete flag:", await AsyncStorage.getItem("hasCompletedOnboarding"));

    setPreferencesAndFinishOnboarding({
      interests: userInterests,
      socialMode: socialModePref,
      budget: budgetPref,
      energyMode: "mixed",
      placeMode: "both",
      preferredTimes: ["morning", "midday", "afternoon", "evening", "night"],
      homeCity: userNeighborhood,
      schoolOrWork: "",
      ageRange,
      socialBattery: socialBatteryPref,
      hungerPreference: "any",
      transportMode: "driving",
    });

    // Advance to payoff screen — the button there does the final navigate
    setStep(18);
  }

  const ss = shellStep(step, emailChosen);

  if (step === 0) return <Splash onContinue={goNext} />;

  if (step === 1) return (
    <QuickQuestion
      value={freeNightStyle}
      onSelect={setFreeNightStyle}
      onContinue={goNext}
      onBack={goBack}
    />
  );

  if (step === 2) return <DemoPreview onContinue={goNext} onBack={goBack} />;

  if (step === 3) return (
    <CreateAccount
      shellStep={ss}
      onEmail={handleEmailChosen}
      onSocial={handleSocialChosen}
      onBack={goBack}
    />
  );

  if (step === 4) return (
    <EmailConfirm
      shellStep={ss}
      onContinue={goNext}
      onBack={goBack}
    />
  );

  if (step === 5) return (
    <LocationScreen
      shellStep={ss}
      onContinue={goNext}
      onBack={goBack}
      onGranted={setUserLocation}
      onNeighborhood={setUserNeighborhood}
    />
  );

  if (step === 6) return (
    <AgeScreen
      shellStep={ss}
      value={userAge}
      onChange={setUserAge}
      onContinue={goNext}
      onBack={goBack}
    />
  );

  if (step === 7) return (
    <GenderScreen
      shellStep={ss}
      value={userGender}
      onSelect={setUserGender}
      onContinue={goNext}
      onBack={goBack}
    />
  );

  const neighborhood = userNeighborhood || "your area";

  if (step === 8) return (
    <MidSell
      shellStep={ss}
      userAge={userAge}
      userNeighborhood={neighborhood}
      userInterests={userInterests}
      onContinue={goNext}
      onBack={goBack}
    />
  );

  // Steps 9–13 — Interests (5 screens A–E)
  if (step >= 9 && step <= 13) {
    const screenIdx = step - 9;
    const screen = INTEREST_SCREENS[screenIdx];
    const sections = screen.sectionIndexes.map((i) => USER_INTEREST_SECTIONS[i]);
    return (
      <InterestStep
        shellStep={ss}
        sections={sections}
        headline={screen.headline}
        selected={userInterests}
        onToggle={toggleInterest}
        isLast={step === 13}
        onContinue={goNext}
        onSkip={goNext}
        onBack={goBack}
      />
    );
  }

  if (step === 14) return (
    <BudgetScreen
      shellStep={ss}
      value={userBudget}
      onSelect={setUserBudget}
      onContinue={goNext}
      onBack={goBack}
    />
  );

  if (step === 15) return (
    <SocialBattery
      shellStep={ss}
      value={userSocialStyle}
      onSelect={setUserSocialStyle}
      onContinue={goNext}
      onBack={goBack}
    />
  );

  if (step === 16) return (
    <NotificationsScreen
      shellStep={ss}
      onContinue={goNext}
      onBack={goBack}
    />
  );

  if (step === 17) return (
    <SetupScreen
      shellStep={ss}
      userNeighborhood={userNeighborhood}
      userInterests={userInterests}
      userBudget={userBudget}
      userSocialStyle={userSocialStyle}
      onDone={finish}
    />
  );

  // Step 18 — Payoff (navigated to after finish() saves data)
  return (
    <Payoff
      userNeighborhood={userNeighborhood}
      userInterests={userInterests}
      onFinish={() => router.replace("/")}
    />
  );
}
