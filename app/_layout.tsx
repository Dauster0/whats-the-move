import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import React from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { getColors } from "../lib/theme";
import { MoveProvider } from "../store/move-context";
import { PlusProvider } from "../store/plus-context";

function StackWithTheme() {
  const colors = getColors(true);
  return (
    <>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerShown: false,
          animation: "slide_from_right",
          contentStyle: { backgroundColor: colors.bg },
        }}
      >
        <Stack.Screen
          name="concierge-detail"
          options={{
            presentation: "modal",
            animation: "slide_from_bottom",
          }}
        />
        <Stack.Screen
          name="elsewhere-plus"
          options={{
            presentation: "modal",
            animation: "slide_from_bottom",
          }}
        />
      </Stack>
    </>
  );
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <MoveProvider>
        <PlusProvider>
          <StackWithTheme />
        </PlusProvider>
      </MoveProvider>
    </GestureHandlerRootView>
  );
}