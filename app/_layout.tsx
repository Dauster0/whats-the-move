import AsyncStorage from "@react-native-async-storage/async-storage";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import React, { useEffect } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { getColors } from "../lib/theme";
import { MoveProvider } from "../store/move-context";

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
      </Stack>
    </>
  );
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <MoveProvider>
        <StackWithTheme />
      </MoveProvider>
    </GestureHandlerRootView>
  );
}