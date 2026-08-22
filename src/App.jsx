import { Route, Routes, useLocation } from "react-router-dom";
import { useEffect } from "react";
import Navbar from "./components/Navbar";
import Footer from "./components/Footer";
import BottomNav from "./components/BottomNav";
import Home from "./pages/Home";
import CategoryPage from "./pages/CategoryPage";
import GroupPage from "./pages/GroupPage";
import SearchPage from "./pages/SearchPage";
import ShopPage from "./pages/ShopPage";
import PublicProfilePreview from "./pages/PublicProfilePreview";
import ManageAds from "./pages/ManageAds";
import ManageHome from "./pages/ManageHome";
import ManageNavigation from "./pages/ManageNavigation";
import ManageModeration from "./pages/ManageModeration";
import ProductDetail from "./pages/ProductDetail";
import SellProduct from "./pages/SellProduct";
import MyProducts from "./pages/MyProducts";
import ChatList from "./pages/ChatList";
import ChatThread from "./pages/ChatThread";
import RekberList from "./pages/RekberList";
import RekberRoom from "./pages/RekberRoom";
import Account from "./pages/Account";
import ManageCategories from "./pages/ManageCategories";
import InfoHelp from "./pages/InfoHelp";
import Wishlist from "./pages/Wishlist";
import Notifications from "./pages/Notifications";
import Transactions from "./pages/Transactions";
import ChatNotificationToast from "./components/ChatNotificationToast";
import StorichiAssistant from "./components/StorichiAssistant";
import NativePushBridge from "./components/NativePushBridge";
import { useAuth } from "./context/AuthContext";

export default function App() {
  const { user } = useAuth();

  useEffect(() => {
    const root = document.documentElement;
    let frame = 0;
    const updateViewport = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const height = window.visualViewport?.height || window.innerHeight;
        root.style.setProperty("--storichi-viewport-height", `${Math.round(height)}px`);
      });
    };
    updateViewport();
    window.addEventListener("resize", updateViewport, { passive: true });
    window.addEventListener("orientationchange", updateViewport, { passive: true });
    window.visualViewport?.addEventListener("resize", updateViewport, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", updateViewport);
      window.removeEventListener("orientationchange", updateViewport);
      window.visualViewport?.removeEventListener("resize", updateViewport);
    };
  }, []);
  const location = useLocation();
  const footerPaths = ["/", "/wishlist", "/favorit", "/transaksi", "/rekber", "/akun"];
  const showFooter = footerPaths.includes(location.pathname) || location.pathname.startsWith("/rekber/");
  return (
    <>
      <Navbar />
      <ChatNotificationToast userId={user?.id} />
      <NativePushBridge user={user} />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/kategori/:slug" element={<CategoryPage />} />
        <Route path="/grup/:slug" element={<GroupPage />} />
        <Route path="/produk/:slug" element={<ProductDetail />} />
        <Route path="/toko/:sellerId" element={<ShopPage />} />
        <Route path="/pengguna/:userId" element={<PublicProfilePreview />} />
        <Route path="/jual" element={<MyProducts />} />
        <Route path="/jual/baru" element={<SellProduct />} />
        <Route path="/jual/edit/:productId" element={<SellProduct />} />
        <Route path="/chat" element={<ChatList />} />
        <Route path="/chat/archived" element={<ChatList archivedOnly />} />
        <Route path="/chat/:threadId" element={<ChatThread />} />
        <Route path="/rekber" element={<RekberList />} />
        <Route path="/rekber/:groupId" element={<RekberRoom />} />
        <Route path="/akun" element={<Account />} />
        <Route path="/kelola-kategori" element={<ManageCategories />} />
        <Route path="/kelola-iklan" element={<ManageAds />} />
        <Route path="/kelola-beranda" element={<ManageHome />} />
        <Route path="/kelola-menu" element={<ManageNavigation />} />
        <Route path="/kelola-moderasi" element={<ManageModeration />} />
        <Route path="/wishlist" element={<Wishlist />} />
        <Route path="/favorit" element={<Wishlist />} />
        <Route path="/notifikasi" element={<Notifications />} />
        <Route path="/transaksi" element={<Transactions />} />
        <Route path="/cari" element={<SearchPage />} />
        <Route path="/bantuan" element={<InfoHelp />} />
      </Routes>
      {showFooter && <Footer />}
      <BottomNav />
      <StorichiAssistant />
    </>
  );
}
