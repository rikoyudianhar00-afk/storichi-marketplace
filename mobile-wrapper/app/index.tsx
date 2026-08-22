import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, BackHandler, Linking, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Constants from "expo-constants";
import * as Notifications from "expo-notifications";
import { WebView, type WebViewMessageEvent, type WebViewNavigation } from "react-native-webview";

const STORICHI_URL = "https://storichi-marketplace.vercel.app/";
const STORICHI_HOST = "storichi-marketplace.vercel.app";

Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
});

async function getExpoPushToken() {
  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("storichi-messages", {
      name: "Pesan Storichi",
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 180, 120, 180],
      lightColor: "#1455F5",
    });
  }
  const current = await Notifications.getPermissionsAsync();
  const permission = current.status === "granted" ? current : await Notifications.requestPermissionsAsync();
  if (permission.status !== "granted") return null;
  const projectId = Constants.easConfig?.projectId ?? Constants.expoConfig?.extra?.eas?.projectId;
  if (!projectId) return null;
  return (await Notifications.getExpoPushTokenAsync({ projectId })).data;
}

export default function StorichiWrapperScreen() {
  const webViewRef = useRef<WebView>(null);
  const [canGoBack, setCanGoBack] = useState(false);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [pendingPath, setPendingPath] = useState<string | null>(null);
  const [authCallback, setAuthCallback] = useState<string | null>(null);

  const openPath = (path: string) => {
    const destination = new URL(path, STORICHI_URL).toString();
    webViewRef.current?.injectJavaScript(`window.location.assign(${JSON.stringify(destination)}); true;`);
  };

  useEffect(() => {
    if (Platform.OS !== "android") return undefined;
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
      if (canGoBack) {
        webViewRef.current?.goBack();
        return true;
      }
      return false;
    });
    return () => subscription.remove();
  }, [canGoBack]);

  useEffect(() => {
    const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      const path = response.notification.request.content.data?.url;
      if (typeof path !== "string" || !path.startsWith("/")) return;
      setPendingPath(path);
    });
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    const consumeUrl = (url: string | null) => {
      if (url?.startsWith("storichi://auth/callback")) setAuthCallback(url);
    };
    void Linking.getInitialURL().then(consumeUrl);
    const subscription = Linking.addEventListener("url", ({ url }) => consumeUrl(url));
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    if (!authCallback || loading || failed) return;
    const destination = authCallback.replace(/^storichi:\/\/auth\/callback/i, `${STORICHI_URL}akun`);
    webViewRef.current?.injectJavaScript(`window.location.replace(${JSON.stringify(destination)}); true;`);
    setAuthCallback(null);
  }, [authCallback, loading, failed]);

  useEffect(() => {
    if (!pendingPath || loading || failed) return;
    openPath(pendingPath);
    setPendingPath(null);
  }, [pendingPath, loading, failed]);

  function handleNavigation(state: WebViewNavigation) {
    setCanGoBack(state.canGoBack);
  }

  function shouldLoad(request: { url: string }) {
    const url = request.url;
    if (url.startsWith("storichi://auth/callback")) {
      setAuthCallback(url);
      return false;
    }
    if (url.startsWith("mailto:") || url.startsWith("tel:")) {
      void Linking.openURL(url);
      return false;
    }
    try {
      const hostname = new URL(url).hostname;
      if (hostname === "accounts.google.com" || hostname.endsWith(".google.com")) {
        void Linking.openURL(url);
        return false;
      }
    } catch {
      return false;
    }
    return true;
  }

  function handleMessage(event: WebViewMessageEvent) {
    let message: { type?: string } = {};
    try { message = JSON.parse(event.nativeEvent.data); } catch { return; }
    if (message.type !== "storichi-user-context") return;
    void getExpoPushToken().then((token) => {
      if (!token) return;
      const detail = JSON.stringify({ token, platform: Platform.OS });
      webViewRef.current?.injectJavaScript(`document.dispatchEvent(new CustomEvent("storichi:native-push-token", { detail: ${detail} })); true;`);
    }).catch(() => undefined);
  }

  function reload() {
    setFailed(false);
    setLoading(true);
    webViewRef.current?.reload();
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={["top", "left", "right"]}>
      <WebView
        ref={webViewRef}
        source={{ uri: STORICHI_URL }}
        style={styles.webView}
        onNavigationStateChange={handleNavigation}
        onShouldStartLoadWithRequest={shouldLoad}
        onMessage={handleMessage}
        onLoadStart={() => { setLoading(true); setFailed(false); }}
        onLoadEnd={() => setLoading(false)}
        onLoadProgress={({ nativeEvent }) => { if (nativeEvent.progress > 0.08) setLoading(false); }}
        onError={() => { setFailed(true); setLoading(false); }}
        onHttpError={() => { setFailed(true); setLoading(false); }}
        javaScriptEnabled
        domStorageEnabled
        thirdPartyCookiesEnabled
        sharedCookiesEnabled
        pullToRefreshEnabled
        allowsBackForwardNavigationGestures
        originWhitelist={["https://*", "http://*", "storichi:*", "mailto:*", "tel:*"]}
        forceDarkOn={false}
        userAgent="StorichiAndroidWrapper/1.0"
      />
      {loading && !failed && <View pointerEvents="none" style={styles.loading}><ActivityIndicator size="large" color="#1455F5" /><Text style={styles.loadingText}>Memuat Storichi…</Text></View>}
      {failed && <View style={styles.failure}><View style={styles.failureCard}><Text style={styles.failureTitle}>Storichi belum dapat dimuat</Text><Text style={styles.failureText}>Periksa koneksi internet Anda, lalu muat ulang website.</Text><Pressable onPress={reload} style={({ pressed }) => [styles.reloadButton, pressed && styles.pressed]}><Text style={styles.reloadText}>Muat ulang</Text></Pressable></View></View>}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#07194D" },
  webView: { flex: 1, backgroundColor: "#F7F9FE" },
  loading: { ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center", gap: 12, backgroundColor: "#F7F9FE" },
  loadingText: { color: "#293454", fontSize: 14, fontWeight: "600" },
  failure: { ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center", padding: 24, backgroundColor: "#F7F9FE" },
  failureCard: { width: "100%", maxWidth: 340, alignItems: "center", gap: 12, padding: 24, borderRadius: 20, backgroundColor: "#FFFFFF" },
  failureTitle: { color: "#07194D", fontSize: 18, fontWeight: "800", textAlign: "center" },
  failureText: { color: "#56617A", fontSize: 14, lineHeight: 21, textAlign: "center" },
  reloadButton: { minHeight: 46, marginTop: 6, paddingHorizontal: 20, alignItems: "center", justifyContent: "center", borderRadius: 14, backgroundColor: "#1455F5" },
  reloadText: { color: "#FFFFFF", fontSize: 14, fontWeight: "800" },
  pressed: { opacity: 0.75, transform: [{ scale: 0.98 }] },
});
