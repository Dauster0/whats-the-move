export type AIMove = {
  candidateId: string;
  title: string;
  subtitle: string;
  reason: string;
  durationMinutes: number;
  kind: "place" | "event" | "generic";
  actionType: "maps" | "tickets" | "none";
  sourceName: string;
  address: string;
  mapQuery: string;
  externalUrl: string;
};

export async function generateAIMoves(payload: any): Promise<AIMove[]> {
  const response = await fetch("http://10.23.50.172:3001/health");

  if (!response.ok) {
    throw new Error("Health check failed");
  }

  const data = await response.json();
  console.log("HEALTH RESPONSE:", data);

  return [
    {
      candidateId: "test-1",
      title: "Test move from health check",
      subtitle: "This proves the app can reach your backend",
      reason: "If you see this card, networking is working and the problem is inside the AI route.",
      durationMinutes: 60,
      kind: "generic",
      actionType: "none",
      sourceName: "",
      address: "",
      mapQuery: "",
      externalUrl: "",
    },
  ];
}