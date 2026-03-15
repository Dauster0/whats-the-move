export async function getWeatherType(lat: number, lon: number) {
  try {
    const url =
      "https://api.open-meteo.com/v1/forecast?latitude=" +
      lat +
      "&longitude=" +
      lon +
      "&current=weather_code";

    const res = await fetch(url);
    const data = await res.json();

    const code = data?.current?.weather_code;

    if (typeof code !== "number") return "sunny";

    if (code >= 0 && code <= 3) return "sunny";
    if (code >= 45 && code <= 48) return "fog";
    if (code >= 51 && code <= 67) return "rain";
    if (code >= 71 && code <= 77) return "snow";
    if (code >= 80 && code <= 99) return "rain";

    return "sunny";
  } catch {
    return "sunny";
  }
}