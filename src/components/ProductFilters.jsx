import { PRODUCT_SORTS } from "../lib/catalog";

export default function ProductFilters({ value, onChange }) {
  return (
    <div className="product-filters" aria-label="Filter produk">
      <span className="product-filters-label">Urutkan:</span>
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        <option value={PRODUCT_SORTS.TOP_SALES}>Top Sales / rating terbanyak</option>
        <option value={PRODUCT_SORTS.AZ}>Nama A-Z</option>
        <option value={PRODUCT_SORTS.PRICE_LOW}>Harga termurah ke termahal</option>
        <option value={PRODUCT_SORTS.PRICE_HIGH}>Harga termahal ke termurah</option>
        <option value={PRODUCT_SORTS.OFFICIAL}>Official / Verified Sellers</option>
      </select>
    </div>
  );
}
