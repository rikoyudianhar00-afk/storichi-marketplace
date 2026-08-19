export default function Footer() {
  return (
    <footer className="footer">
      <div className="container footer-grid">
        <div>
          <h4>storichi</h4>
          <p style={{ maxWidth: 320, lineHeight: 1.6 }}>
            Marketplace top up game, akun, dan jasa digital dengan transaksi aman lewat rekber
            dan chat langsung antar pengguna.
          </p>
        </div>
        <div>
          <h4>Layanan</h4>
          <a href="/kategori/top-up">Top Up Game</a>
          <a href="/kategori/akun">Jual Beli Akun</a>
          <a href="/rekber">Grup Rekber</a>
        </div>
        <div>
          <h4>Bantuan</h4>
          <a href="/bantuan">Pusat Bantuan</a>
          <a href="/chat">Hubungi Kami</a>
        </div>
      </div>
    </footer>
  );
}
