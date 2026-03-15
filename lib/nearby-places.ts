export type NearbyPlaces = {
  coffee: string;
  park: string;
  explore: string;
};

export function getNearbyPlaces(place: string): NearbyPlaces {
  const normalized = place.toLowerCase();

  if (normalized.includes("echo park")) {
    return {
      coffee: "Stereoscope Coffee",
      park: "Echo Park Lake",
      explore: "Sunset Boulevard",
    };
  }

  if (normalized.includes("silver lake")) {
    return {
      coffee: "Alfred Coffee",
      park: "Silver Lake Reservoir",
      explore: "Sunset Junction",
    };
  }

  if (normalized.includes("santa monica")) {
    return {
      coffee: "La La Land Kind Cafe",
      park: "Palisades Park",
      explore: "Third Street Promenade",
    };
  }

  if (normalized.includes("downtown")) {
    return {
      coffee: "Blue Bottle Coffee",
      park: "Grand Park",
      explore: "The Broad area",
    };
  }

  if (normalized.includes("hollywood")) {
    return {
      coffee: "Alfred Coffee",
      park: "Runyon Canyon entrance",
      explore: "Hollywood Boulevard",
    };
  }

  if (
    normalized.includes("los angeles") ||
    normalized.includes("la") ||
    normalized.includes("vernon")
  ) {
    return {
      coffee: "Verve Coffee Roasters",
      park: "Vista Hermosa Park",
      explore: "The Grove area",
    };
  }

  return {
    coffee: "a coffee shop near you",
    park: "a park near you",
    explore: "a new area near you",
  };
}