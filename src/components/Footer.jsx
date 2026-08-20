export default function Footer() {
  return (
    <footer className="footer">
      <div className="container footer-content">
        <section className="footer-intro">
          <h4>storichi</h4>
          <p>Marketplace top up game, akun, dan jasa digital dengan transaksi aman lewat rekber dan chat langsung antar pengguna.</p>
        </section>

        <section className="footer-section" aria-labelledby="footer-services-title">
          <h4 id="footer-services-title">Layanan</h4>
          <nav className="footer-links" aria-label="Layanan Storichi">
            <a href="/kategori/top-up">Top Up Game</a>
            <a href="/kategori/akun">Jual Beli Akun</a>
            <a href="/rekber">Grup Rekber</a>
          </nav>
        </section>

        <section className="footer-section" aria-labelledby="footer-help-title">
          <h4 id="footer-help-title">Bantuan</h4>
          <nav className="footer-links" aria-label="Bantuan Storichi">
            <a href="/bantuan">Pusat Bantuan</a>
            <a href="/chat">Hubungi Kami</a>
          </nav>
        </section>
      </div>
      <div className="footer-bottom">
        <p>Storichi v1.0.0.1©2026</p>
        <p>all other trademark belong to their respective owners.</p>
      </div>
    </footer>
  );
}
