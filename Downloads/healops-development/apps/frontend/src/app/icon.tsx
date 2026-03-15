import { ImageResponse } from "next/og";

export const size = { width: 32, height: 32 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: 32,
          height: 32,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <svg
          width="32"
          height="32"
          viewBox="0 0 48 48"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            <linearGradient id="g" x1="0" y1="0" x2="48" y2="48" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="#00BCD4" />
              <stop offset="100%" stopColor="#1E88E5" />
            </linearGradient>
          </defs>
          <rect x="2" y="2" width="44" height="44" rx="12" fill="url(#g)" />
          {/* Circular cycle arrow */}
          <path
            d="M 33 14 A 13 13 0 1 1 15 14"
            fill="none"
            stroke="white"
            strokeWidth="3.5"
            strokeLinecap="round"
          />
          <polygon points="19,8 13,15 20,17" fill="white" />
          {/* Checkmark */}
          <polyline
            points="17,25 22,30 32,18"
            fill="none"
            stroke="white"
            strokeWidth="4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>
    ),
    { ...size },
  );
}
