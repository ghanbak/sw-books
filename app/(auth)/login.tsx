import { Apple } from "lucide-react-native";
import {
  Alert,
  Image,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { tokens } from "@/constants/tokens";
import { signInWithApple, signInWithGoogle } from "@/lib/auth";
import { signInAsDevUser } from "@/lib/supabase";

export default function LoginScreen() {
  async function handleGoogle() {
    try {
      await signInWithGoogle();
    } catch (error) {
      Alert.alert("Google sign-in failed", errorMessage(error));
    }
  }

  async function handleApple() {
    try {
      await signInWithApple();
    } catch (error) {
      if (isAppleCancellation(error)) return;
      Alert.alert("Apple sign-in failed", errorMessage(error));
    }
  }

  async function handleDev() {
    const error = await signInAsDevUser();
    if (error) {
      Alert.alert("Dev sign-in failed", error);
    }
  }

  return (
    <View style={styles.container}>
      <View style={styles.heroSection}>
        <View style={styles.logoCircle}>
          <Image
            source={require("@/assets/images/icon.png")}
            style={{ width: 96, height: 96, borderRadius: 16 }}
          />
        </View>
        <Text style={styles.title}>Ossus Archives</Text>
        <Text style={styles.subtitle}>
          Discover and track your favorite novels from a galaxy far, far away.
        </Text>
      </View>

      <View style={styles.buttonStack}>
        {Platform.OS === "ios" && (
          <Pressable
            style={[styles.button, styles.appleButton]}
            onPress={handleApple}
          >
            <Apple size={18} color="#000" strokeWidth={2.5} fill="#000" />
            <Text style={styles.appleButtonText}>Continue with Apple</Text>
          </Pressable>
        )}

        <Pressable
          style={[styles.button, styles.googleButton]}
          onPress={handleGoogle}
        >
          <GoogleGlyph />
          <Text style={styles.googleButtonText}>Continue with Google</Text>
        </Pressable>

        {__DEV__ && (
          <Pressable
            style={[styles.button, styles.devButton]}
            onPress={handleDev}
          >
            <Text style={styles.devButtonText}>Continue as Dev User</Text>
          </Pressable>
        )}
      </View>

      <Text style={styles.legal}>
        By continuing, you agree to use this app for personal book tracking.
      </Text>
    </View>
  );
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function isAppleCancellation(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code: unknown }).code === "ERR_REQUEST_CANCELED"
  );
}

function GoogleGlyph() {
  return (
    <Image
      source={{
        uri: "https://www.gstatic.com/marketing-cms/assets/images/d5/dc/cfe9ce8b4425b410b49b7f2dd3f3/g.webp=s48-fcrop64=1,00000000ffffffff-rw",
      }}
      style={{ width: 18, height: 18 }}
      resizeMode="contain"
    />
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: tokens.surface.background,
    paddingHorizontal: 32,
    paddingTop: 80,
    paddingBottom: 48,
  },
  heroSection: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  logoCircle: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: tokens.surface.card,
    borderWidth: 1,
    borderColor: tokens.border.accent,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 24,
  },
  logoText: {
    fontSize: 32,
    fontWeight: "800",
    color: tokens.accent.primary,
    letterSpacing: 1,
  },
  title: {
    fontSize: 28,
    fontWeight: "700",
    letterSpacing: 1.5,
    color: tokens.text.primary,
    marginBottom: 8,
    textAlign: "center",
  },
  subtitle: {
    fontSize: 15,
    color: tokens.text.secondary,
    textAlign: "center",
    maxWidth: 280,
    lineHeight: 22,
  },
  buttonStack: {
    gap: 12,
    marginBottom: 32,
  },
  button: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    height: 52,
    borderRadius: 12,
  },
  appleButton: {
    backgroundColor: "#FFFFFF",
  },
  appleButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#000",
  },
  googleButton: {
    backgroundColor: "#FFFFFF",
  },
  googleButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#1F1F1F",
  },
  devButton: {
    backgroundColor: "transparent",
    borderWidth: 1,
    borderColor: tokens.border.subtle,
  },
  devButtonText: {
    fontSize: 14,
    fontWeight: "500",
    color: tokens.text.secondary,
  },
  legal: {
    fontSize: 12,
    color: tokens.text.hint,
    textAlign: "center",
    lineHeight: 18,
  },
});
