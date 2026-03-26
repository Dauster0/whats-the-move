import interestData from "./interest-data.json";

export type InterestChip = { key: string; label: string };

export type InterestSection = { title: string; items: InterestChip[] };

const data = interestData as { sections: InterestSection[] };

export const USER_INTEREST_SECTIONS: InterestSection[] = data.sections;

/** Flat list for APIs and legacy callers. */
export const USER_INTEREST_CHIPS: InterestChip[] = data.sections.flatMap((s) => s.items);
