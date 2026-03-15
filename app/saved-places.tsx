import { router, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import {
    Alert,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    View,
} from "react-native";
import {
    StoredPersonalPlace,
    getStoredPersonalPlaces,
    removeStoredPersonalPlace,
} from "../lib/personal-place-storage";
import { colors, font, radius, spacing } from "../lib/theme";

export default function SavedPlacesScreen() {
  const [places, setPlaces] = useState<StoredPersonalPlace[]>([]);

  async function loadPlaces() {
    const data = await getStoredPersonalPlaces();
    setPlaces(data);
  }

  useFocusEffect(
    useCallback(() => {
      loadPlaces();
    }, [])
  );

  async function handleDelete(id: string, title: string) {
    Alert.alert(
      "Delete place?",
      `Remove "${title}" from your saved places?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            await removeStoredPersonalPlace(id);
            loadPlaces();
          },
        },
      ]
    );
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

        <Text style={styles.headerTitle}>Saved places</Text>

        <View style={{ width: 42 }} />
      </View>

      <Text style={styles.title}>Your favorite{"\n"}suggestions</Text>
      <Text style={styles.subtitle}>
        These places get mixed into your future recommendations.
      </Text>

      <Pressable
        style={styles.addButton}
        onPress={() => router.push("/save-place")}
      >
        <Text style={styles.addButtonText}>Add a place</Text>
      </Pressable>

      <View style={styles.list}>
        {places.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>No saved places yet</Text>
            <Text style={styles.emptySub}>
              Save places you already know you like, and the app will recommend them more often.
            </Text>
          </View>
        ) : (
          places.map((place) => (
            <View key={place.id} style={styles.card}>
              <Text style={styles.cardTitle}>{place.title}</Text>
              <Text style={styles.cardSubtitle}>{place.subtitle}</Text>

              <View style={styles.metaRow}>
                <Text style={styles.metaText}>{place.durationMinutes} min</Text>
                <Text style={styles.metaDot}>·</Text>
                <Text style={styles.metaText}>{place.priceText}</Text>
              </View>

              <Text style={styles.address}>{place.address}</Text>

              <View style={styles.actionsRow}>
                <Pressable
                  style={styles.smallButton}
                  onPress={() =>
                    router.push({
                      pathname: "/save-place",
                      params: {
                        editId: place.id,
                      },
                    })
                  }
                >
                  <Text style={styles.smallButtonText}>Edit</Text>
                </Pressable>

                <Pressable
                  style={styles.smallButtonDanger}
                  onPress={() => handleDelete(place.id, place.title)}
                >
                  <Text style={styles.smallButtonDangerText}>Delete</Text>
                </Pressable>
              </View>
            </View>
          ))
        )}
      </View>
    </ScrollView>
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

  addButton: {
    backgroundColor: colors.bgDark,
    borderRadius: radius.lg,
    paddingVertical: 18,
    alignItems: "center",
    marginBottom: spacing.lg,
  },
  addButtonText: {
    color: colors.textInverse,
    fontSize: font.sizeMd,
    fontWeight: "700",
  },

  list: {
    gap: 12,
  },
  emptyCard: {
    backgroundColor: colors.bgCard,
    borderRadius: radius.xl,
    padding: spacing.lg,
    borderWidth: 1.5,
    borderColor: colors.border,
  },
  emptyTitle: {
    fontSize: font.sizeLg,
    fontWeight: "800",
    color: colors.text,
    marginBottom: 8,
  },
  emptySub: {
    fontSize: font.sizeMd,
    color: colors.textSub,
    lineHeight: 22,
  },

  card: {
    backgroundColor: colors.bgCard,
    borderRadius: radius.xl,
    padding: spacing.lg,
    borderWidth: 1.5,
    borderColor: colors.border,
  },
  cardTitle: {
    fontSize: font.sizeLg,
    fontWeight: "800",
    color: colors.text,
    marginBottom: 6,
  },
  cardSubtitle: {
    fontSize: font.sizeMd,
    color: colors.textSub,
    lineHeight: 22,
    marginBottom: 12,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 10,
  },
  metaText: {
    fontSize: font.sizeSm,
    color: colors.textMuted,
    fontWeight: "600",
  },
  metaDot: {
    marginHorizontal: 8,
    color: colors.textMuted,
  },
  address: {
    fontSize: font.sizeSm,
    color: colors.textSub,
    lineHeight: 20,
    marginBottom: 14,
  },

  actionsRow: {
    flexDirection: "row",
    gap: 10,
  },
  smallButton: {
    flex: 1,
    backgroundColor: colors.bgCardSoft,
    borderRadius: radius.lg,
    paddingVertical: 14,
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.border,
  },
  smallButtonText: {
    color: colors.text,
    fontSize: font.sizeSm,
    fontWeight: "700",
  },
  smallButtonDanger: {
    flex: 1,
    backgroundColor: colors.bgMuted,
    borderRadius: radius.lg,
    paddingVertical: 14,
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.border,
  },
  smallButtonDangerText: {
    color: colors.text,
    fontSize: font.sizeSm,
    fontWeight: "700",
  },
});