import * as Location from "expo-location";

export type ReadableLocationResult = {
  place: string;
  lat: number | null;
  lon: number | null;
};

export async function getReadableLocation(): Promise<ReadableLocationResult> {
  try {
    const permission = await Location.requestForegroundPermissionsAsync();

    if (permission.status !== "granted") {
      return {
        place: "near you",
        lat: null,
        lon: null
      };
    }

    const position = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced
    });

    const latitude = position.coords?.latitude ?? null;
    const longitude = position.coords?.longitude ?? null;

    if (latitude == null || longitude == null) {
      return {
        place: "near you",
        lat: null,
        lon: null
      };
    }

    try {
      const results = await Location.reverseGeocodeAsync({
        latitude,
        longitude
      });

      const first = results?.[0];

      const place =
        first?.city ||
        first?.district ||
        first?.subregion ||
        first?.region ||
        "near you";

      return {
        place,
        lat: latitude,
        lon: longitude
      };
    } catch {
      return {
        place: "near you",
        lat: latitude,
        lon: longitude
      };
    }
  } catch {
    return {
      place: "near you",
      lat: null,
      lon: null
    };
  }
}