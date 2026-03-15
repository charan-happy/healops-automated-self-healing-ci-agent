import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: 180,
          height: 180,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(135deg, #00BCD4, #1E88E5)",
          borderRadius: 40,
        }}
      >
        <svg
          width="120"
          height="120"
          viewBox="0 0 48 48"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          {/* Circular cycle arrow */}
          <path
            d="M 33 14 A 13 13 0 1 1 15 14"
            fill="none"
            stroke="white"
            strokeWidth="2.8"
            strokeLinecap="round"
          />
          <polygon points="19,8 13,15 20,17" fill="white" />
          {/* Checkmark */}
          <polyline
            points="17,25 22,30 32,18"
            fill="none"
            stroke="white"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>
    ),
    { ...size },
  );
}
