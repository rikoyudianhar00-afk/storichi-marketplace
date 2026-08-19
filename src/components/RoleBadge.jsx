import { BASE_ROLE_ICON } from "../lib/roles";

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

      {profile.is_owner && (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-label="Owner" title="Owner">
          <path
            d="m9 3.5 1.9-1 1.1 1.8 2.1-.4.6 2 2 .6-.4 2.1 1.8 1.1-1 1.9 1 1.9-1.8 1.1.4 2.1-2 .6-.6 2-2.1-.4-1.1 1.8-1.9-1-1.9 1-1.1-1.8-2.1.4-.6-2-2-.6.4-2.1L3.5 9l1-1.9-1.8-1.1L4.1 4l2-.6.6-2 2.1.4L9 3.5Z"
            fill="#111318"
          />
          <path d="m8.5 12 2.2 2.2 4.3-4.6" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}

      {profile.is_verified && !profile.is_owner && (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-label="Terverifikasi" title="Penjual Terverifikasi">
          <path
            d="m9 3.5 1.9-1 1.1 1.8 2.1-.4.6 2 2 .6-.4 2.1 1.8 1.1-1 1.9 1 1.9-1.8 1.1.4 2.1-2 .6-.6 2-2.1-.4-1.1 1.8-1.9-1-1.9 1-1.1-1.8-2.1.4-.6-2-2-.6.4-2.1L3.5 9l1-1.9-1.8-1.1L4.1 4l2-.6.6-2 2.1.4L9 3.5Z"
            fill="#2454FF"
          />
          <path d="m8.5 12 2.2 2.2 4.3-4.6" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}

      {profile.is_midman && (
        <span className="badge-midman" style={{ width: size, height: size, fontSize: size }} title="Mid Man">
          👳
        </span>
      )}
    </span>
  );
}
