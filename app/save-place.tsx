import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useCallback, useState } from "react";
import {
    Alert,
    Pressable,
    ScrollView,
    StyleSheet,
    Switch,
    Text,
    TextInput,
    View,
} from "react-native";
import type { PlaceSuggestion } from "../lib/curated-places";
import {
    addStoredPersonalPlace,
    getStoredPersonalPlaces,
} from "../lib/personal-place-storage";
import { colors, font, radius, spacing } from "../lib/theme";
import { USER_INTEREST_CHIPS } from "../lib/user-interests";

const NEIGHBORHOOD_OPTIONS = [
  "usc",
  "university park",
  "downtown",
  "echo park",
  "silver lake",
  "los feliz",
  "hollywood",
  "koreatown",
  "los angeles",
];

const VIBE_OPTIONS = ["solo", "social", "date", "group"] as const;
const TIME_OPTIONS = ["morning", "midday", "afternoon", "evening", "night"] as const;
const WEATHER_OPTIONS = ["sunny", "rain", "any"] as const;
const PRICE_OPTIONS = ["$", "$$", "$$$"] as const;

function slugify(text: string) {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function toggleString(list: string[], value: string) {
  return list.includes(value)
    ? list.filter((x) => x !== value)
    : [...list, value];
}

export default function SavePlaceScreen() {
  const params = useLocalSearchParams<{
    editId?: string;
    prefillTitle?: string;
    prefillSubtitle?: string;
    prefillDuration?: string;
    prefillAddress?: string;
    prefillMapQuery?: string;
    prefillReason?: string;
  }>();

  const [loadedEdit, setLoadedEdit] = useState(false);

  const [title, setTitle] = useState(params.prefillTitle ?? "");
  const [subtitle, setSubtitle] = useState(params.prefillSubtitle ?? "");
  const [durationMinutes, setDurationMinutes] = useState(
    params.prefillDuration ?? "30"
  );
  const [address, setAddress] = useState(params.prefillAddress ?? "");
  const [mapQuery, setMapQuery] = useState(params.prefillMapQuery ?? "");
  const [whyThisFits, setWhyThisFits] = useState(params.prefillReason ?? "");
  const [interests, setInterests] = useState<string[]>([
    "solo-recharge",
    "cheap-hangouts",
  ]);
  const [neighborhoods, setNeighborhoods] = useState<string[]>([
    "usc",
    "los angeles",
  ]);
  const [vibes, setVibes] = useState<string[]>(["solo", "social"]);
  const [timeFit, setTimeFit] = useState<string[]>([
    "morning",
    "midday",
    "afternoon",
  ]);
  const [weatherFit, setWeatherFit] = useState<string[]>(["any"]);
  const [priceText, setPriceText] = useState<"$" | "$$" | "$$$">("$$");
  const [reservationNeeded, setReservationNeeded] = useState(false);
  const [reservationNote, setReservationNote] = useState("");
  const [distanceText, setDistanceText] = useState("5–10 min away");

  useFocusEffect(
    useCallback(() => {
      async function loadEditPlace() {
        if (!params.editId || loadedEdit) return;

        const places = await getStoredPersonalPlaces();
        const found = places.find((p) => p.id === params.editId);
        if (!found) return;

        setTitle(found.title);
        setSubtitle(found.subtitle);
        setDurationMinutes(String(found.durationMinutes));
        setAddress(found.address);
        setMapQuery(found.mapQuery);
        setWhyThisFits(found.whyThisFits);
        setInterests(found.interests);
        setNeighborhoods(found.neighborhoods);
        setVibes(found.vibes);
        setTimeFit(found.timeFit ?? ["afternoon"]);
        setWeatherFit(found.weatherFit ?? ["any"]);
        setPriceText(found.priceText);
        setReservationNeeded(found.reservationNeeded);
        setReservationNote(found.reservationNote ?? "");
        setDistanceText(
          found.distanceTextByArea?.usc ??
            found.distanceTextByArea?.["los angeles"] ??
            "5–10 min away"
        );

        setLoadedEdit(true);
      }

      loadEditPlace();
    }, [params.editId, loadedEdit])
  );

  async function handleSave() {
    if (!title.trim()) {
      Alert.alert("Missing title", "Add a place name first.");
      return;
    }

    if (!subtitle.trim()) {
      Alert.alert("Missing subtitle", "Add a short subtitle.");
      return;
    }

    if (!address.trim()) {
      Alert.alert("Missing address", "Add an address.");
      return;
    }

    const place: PlaceSuggestion = {
      id: params.editId ?? `personal-${slugify(title)}`,
      title: title.trim(),
      subtitle: subtitle.trim(),
      category: "short",
      durationMinutes: Number(durationMinutes) || 30,
      interests,
      vibes: vibes as PlaceSuggestion["vibes"],
      neighborhoods,
      weatherFit: weatherFit as PlaceSuggestion["weatherFit"],
      timeFit: timeFit as PlaceSuggestion["timeFit"],
      priceText,
      reservationNeeded,
      reservationNote: reservationNote.trim() || undefined,
      address: address.trim(),
      mapQuery: mapQuery.trim() || title.trim(),
      whyThisFits: whyThisFits.trim() || "A place you already know you like.",
      tags: ["favorite"],
      distanceTextByArea: {
        usc: distanceText.trim() || "5–10 min away",
        "los angeles": distanceText.trim() || "Nearby",
      },
    };

    await addStoredPersonalPlace(place);
    router.replace("/saved-places");
  }

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.header}>
        <Pressable style={styles.backBtn} onPress={() => router.back()}>
          <Text style={styles.backArrow}>←</Text>
        </Pressable>

        <Text style={styles.headerTitle}>
          {params.editId ? "Edit place" : "Save place"}
        </Text>

        <View style={{ width: 42 }} />
      </View>

      <Text style={styles.title}>Add a place you’d{"\n"}actually go to</Text>
      <Text style={styles.subtitle}>
        Keep it simple. Save places that already feel like easy yeses.
      </Text>

      <View style={styles.form}>
        <Input
          label="Title"
          value={title}
          onChangeText={setTitle}
          placeholder="Go to Dulce at USC Village"
        />
        <Input
          label="Subtitle"
          value={subtitle}
          onChangeText={setSubtitle}
          placeholder="Easy coffee or pastry reset"
        />
        <Input
          label="Duration (minutes)"
          value={durationMinutes}
          onChangeText={setDurationMinutes}
          placeholder="30"
          keyboardType="numeric"
        />
        <Input
          label="Address"
          value={address}
          onChangeText={setAddress}
          placeholder="USC Village, Los Angeles, CA"
        />
        <Input
          label="Map query"
          value={mapQuery}
          onChangeText={setMapQuery}
          placeholder="Dulce USC Village Los Angeles"
        />
        <Input
          label="Why this fits"
          value={whyThisFits}
          onChangeText={setWhyThisFits}
          placeholder="A familiar, low-friction place that already feels easy to say yes to."
          multiline
        />

        <SectionTitle label="Interests" />
        <ChipGrid
          options={USER_INTEREST_CHIPS}
          selected={interests}
          onToggle={(value) => setInterests((prev) => toggleString(prev, value))}
        />

        <SectionTitle label="Neighborhoods" />
        <ChipGrid
          options={NEIGHBORHOOD_OPTIONS}
          selected={neighborhoods}
          onToggle={(value) =>
            setNeighborhoods((prev) => toggleString(prev, value))
          }
        />

        <SectionTitle label="Vibes" />
        <ChipGrid
          options={[...VIBE_OPTIONS]}
          selected={vibes}
          onToggle={(value) => setVibes((prev) => toggleString(prev, value))}
        />

        <SectionTitle label="Time fit" />
        <ChipGrid
          options={[...TIME_OPTIONS]}
          selected={timeFit}
          onToggle={(value) => setTimeFit((prev) => toggleString(prev, value))}
        />

        <SectionTitle label="Weather fit" />
        <ChipGrid
          options={[...WEATHER_OPTIONS]}
          selected={weatherFit}
          onToggle={(value) =>
            setWeatherFit((prev) =>
              value === "any"
                ? ["any"]
                : toggleString(prev.filter((x) => x !== "any"), value)
            )
          }
        />

        <Input
          label="Distance text"
          value={distanceText}
          onChangeText={setDistanceText}
          placeholder="5–10 min away"
        />

        <SectionTitle label="Price" />
        <View style={styles.pillRow}>
          {PRICE_OPTIONS.map((price) => {
            const active = priceText === price;
            return (
              <Pressable
                key={price}
                style={[styles.pill, active && styles.pillActive]}
                onPress={() => setPriceText(price)}
              >
                <Text
                  style={[styles.pillText, active && styles.pillTextActive]}
                >
                  {price}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <View style={styles.switchRow}>
          <Text style={styles.switchLabel}>Reservation usually needed</Text>
          <Switch value={reservationNeeded} onValueChange={setReservationNeeded} />
        </View>

        {reservationNeeded ? (
          <Input
            label="Reservation note"
            value={reservationNote}
            onChangeText={setReservationNote}
            placeholder="Buying ahead is safer for popular times."
            multiline
          />
        ) : null}
      </View>

      <Pressable style={styles.saveButton} onPress={handleSave}>
        <Text style={styles.saveButtonText}>Save place</Text>
      </Pressable>
    </ScrollView>
  );
}

function SectionTitle({ label }: { label: string }) {
  return <Text style={styles.sectionTitle}>{label}</Text>;
}

function ChipGrid({
  options,
  selected,
  onToggle,
}: {
  options: readonly string[] | readonly { key: string; label: string }[];
  selected: string[];
  onToggle: (value: string) => void;
}) {
  return (
    <View style={styles.chipGrid}>
      {options.map((option) => {
        const key = typeof option === "string" ? option : option.key;
        const label = typeof option === "string" ? option : option.label;
        const active = selected.includes(key);
        return (
          <Pressable
            key={key}
            style={[styles.chip, active && styles.chipActive]}
            onPress={() => onToggle(key)}
          >
            <Text
              style={[styles.chipText, active && styles.chipTextActive]}
            >
              {label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function Input({
  label,
  value,
  onChangeText,
  placeholder,
  multiline,
  keyboardType,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder: string;
  multiline?: boolean;
  keyboardType?: "default" | "numeric";
}) {
  return (
    <View style={styles.inputWrap}>
      <Text style={styles.inputLabel}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.textMuted}
        multiline={multiline}
        keyboardType={keyboardType}
        style={[styles.input, multiline && styles.inputMultiline]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  content: {
    paddingTop: 64,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.xxl,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: spacing.md,
  },
  backBtn: {
    width: 42,
    height: 42,
    backgroundColor: colors.bgCard,
    borderRadius: radius.sm,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    borderColor: colors.border,
  },
  backArrow: {
    fontSize: font.sizeLg,
    color: colors.text,
    fontWeight: "600",
  },
  headerTitle: {
    fontSize: font.sizeMd,
    fontWeight: "700",
    color: colors.text,
  },
  title: {
    fontSize: font.sizeXxl,
    lineHeight: 46,
    fontWeight: "800",
    color: colors.text,
    marginBottom: 8,
    letterSpacing: -1,
  },
  subtitle: {
    fontSize: font.sizeMd,
    lineHeight: 23,
    color: colors.textSub,
    marginBottom: spacing.lg,
  },
  form: {
    gap: 14,
    marginBottom: spacing.lg,
  },
  inputWrap: {
    gap: 8,
  },
  inputLabel: {
    fontSize: font.sizeSm,
    fontWeight: "800",
    color: colors.text,
  },
  input: {
    backgroundColor: colors.bgCard,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderColor: colors.border,
    paddingHorizontal: 16,
    paddingVertical: 16,
    fontSize: font.sizeMd,
    color: colors.text,
  },
  inputMultiline: {
    minHeight: 96,
    textAlignVertical: "top",
  },
  sectionTitle: {
    fontSize: font.sizeSm,
    fontWeight: "800",
    color: colors.text,
  },
  chipGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  chip: {
    backgroundColor: colors.bgCard,
    borderRadius: radius.full,
    borderWidth: 1.5,
    borderColor: colors.border,
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  chipActive: {
    backgroundColor: colors.bgDark,
    borderColor: colors.bgDark,
  },
  chipText: {
    color: colors.text,
    fontSize: font.sizeSm,
    fontWeight: "700",
  },
  chipTextActive: {
    color: colors.textInverse,
  },
  pillRow: {
    flexDirection: "row",
    gap: 10,
  },
  pill: {
    flex: 1,
    backgroundColor: colors.bgCard,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderColor: colors.border,
    paddingVertical: 14,
    alignItems: "center",
  },
  pillActive: {
    backgroundColor: colors.bgDark,
    borderColor: colors.bgDark,
  },
  pillText: {
    color: colors.text,
    fontSize: font.sizeMd,
    fontWeight: "700",
  },
  pillTextActive: {
    color: colors.textInverse,
  },
  switchRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: colors.bgCard,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderColor: colors.border,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  switchLabel: {
    fontSize: font.sizeSm,
    fontWeight: "700",
    color: colors.text,
  },
  saveButton: {
    backgroundColor: colors.bgDark,
    borderRadius: radius.lg,
    paddingVertical: 18,
    alignItems: "center",
  },
  saveButtonText: {
    color: colors.textInverse,
    fontSize: font.sizeMd,
    fontWeight: "700",
  },
});