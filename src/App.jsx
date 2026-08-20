import { Route, Routes, useLocation } from "react-router-dom";
import Navbar from "./components/Navbar";
import Footer from "./components/Footer";
import BottomNav from "./components/BottomNav";
import Home from "./pages/Home";
import CategoryPage from "./pages/CategoryPage";
import GroupPage from "./pages/GroupPage";
import SearchPage from "./pages/SearchPage";
import ShopPage from "./pages/ShopPage";
import ManageAds from "./pages/ManageAds";
import ManageNavigation from "./pages/ManageNavigation";
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
import SimplePage from "./pages/SimplePage";
import ChatNotificationToast from "./components/ChatNotificationToast";
import { useAuth } from "./context/AuthContext";

export default function App() {
  const { user } = useAuth();
  const location = useLocation();
  const footerPaths = ["/", "/favorit", "/transaksi", "/rekber", "/akun"];
  const showFooter = footerPaths.includes(location.pathname) || location.pathname.startsWith("/rekber/");
  return (
    <>
      <Navbar />
      <ChatNotificationToast userId={user?.id} />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/kategori/:slug" element={<CategoryPage />} />
        <Route path="/grup/:slug" element={<GroupPage />} />
        <Route path="/produk/:slug" element={<ProductDetail />} />
        <Route path="/toko/:sellerId" element={<ShopPage />} />
        <Route path="/jual" element={<MyProducts />} />
        <Route path="/jual/baru" element={<SellProduct />} />
        <Route path="/jual/edit/:productId" element={<SellProduct />} />
        <Route path="/chat" element={<ChatList />} />
        <Route path="/chat/:threadId" element={<ChatThread />} />
        <Route path="/rekber" element={<RekberList />} />
        <Route path="/rekber/:groupId" element={<RekberRoom />} />
        <Route path="/akun" element={<Account />} />
        <Route path="/kelola-kategori" element={<ManageCategories />} />
        <Route path="/kelola-iklan" element={<ManageAds />} />
        <Route path="/kelola-menu" element={<ManageNavigation />} />
        <Route path="/favorit" element={<SimplePage title="Favorit" description="Produk favorit kamu akan muncul di sini." />} />
        <Route path="/transaksi" element={<SimplePage title="Transaksi" description="Riwayat transaksi kamu akan muncul di sini." />} />
        <Route path="/cari" element={<SearchPage />} />
        <Route path="/bantuan" element={<InfoHelp />} />
      </Routes>
      {showFooter && <Footer />}
      <BottomNav />
    </>
  );
}
