import { BASE_ROLE_ICON } from "../lib/roles";
import VerifiedBadge from "./VerifiedBadge";

/**
 * profile shape expected: { is_seller, is_verified, is_midman, is_owner }
 * Shows: base icon (💵 buyer or 🏪 seller) + optional verified (blue check),
 * midman (white silhouette), owner (black check). All can combine.
 */
export default function RoleBadge({ profile, size = 15 }) {
  if (!profile) return null;
  const baseIcon = profile.is_seller ? BASE_ROLE_ICON.seller : BASE_ROLE_ICON.buyer;

  return (
    <span className="role-badge-row" style={{ fontSize: size }}>
      <span title={profile.is_seller ? "Penjual" : "Pembeli"}>{baseIcon}</span>

      {profile.is_owner && <VerifiedBadge color="#111318" size={size} label="Owner terverifikasi" />}
      {profile.is_verified && !profile.is_owner && <VerifiedBadge color="#2454FF" size={size} label="Penjual terverifikasi" />}

      {profile.is_midman && (
        <span className="badge-midman" style={{ width: size, height: size, fontSize: size }} title="Mid Man">
          👳
        </span>
      )}
    </span>
  );
}
