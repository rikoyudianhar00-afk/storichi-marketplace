import { Route, Routes } from "react-router-dom";
import Navbar from "./components/Navbar";
import Footer from "./components/Footer";
import BottomNav from "./components/BottomNav";
import Home from "./pages/Home";
import CategoryPage from "./pages/CategoryPage";
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

export default function App() {
  return (
    <>
      <Navbar />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/kategori/:slug" element={<CategoryPage />} />
        <Route path="/produk/:slug" element={<ProductDetail />} />
        <Route path="/jual" element={<MyProducts />} />
        <Route path="/jual/baru" element={<SellProduct />} />
        <Route path="/jual/edit/:productId" element={<SellProduct />} />
        <Route path="/chat" element={<ChatList />} />
        <Route path="/chat/:threadId" element={<ChatThread />} />
        <Route path="/rekber" element={<RekberList />} />
        <Route path="/rekber/:groupId" element={<RekberRoom />} />
        <Route path="/akun" element={<Account />} />
        <Route path="/kelola-kategori" element={<ManageCategories />} />
        <Route path="/favorit" element={<SimplePage title="Favorit" description="Produk favorit kamu akan muncul di sini." />} />
        <Route path="/transaksi" element={<SimplePage title="Transaksi" description="Riwayat transaksi kamu akan muncul di sini." />} />
        <Route path="/cari" element={<SimplePage title="Hasil Pencarian" description="Fitur pencarian sedang disiapkan." />} />
        <Route path="/bantuan" element={<InfoHelp />} />
      </Routes>
      <Footer />
      <BottomNav />
    </>
  );
}
