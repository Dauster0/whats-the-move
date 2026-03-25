import { Redirect } from "expo-router";

/** Full finder was merged into home (energy, time, hungry). Keep route for deep links. */
export default function WhatsTheMoveAiRedirect() {
  return <Redirect href="/" />;
}
