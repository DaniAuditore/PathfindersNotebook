import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    <div style={{ alignItems: "center", background: "#075985", borderRadius: "36px", color: "white", display: "flex", fontFamily: "sans-serif", fontSize: 108, fontWeight: 800, height: "100%", justifyContent: "center", width: "100%" }}>
      C
    </div>,
    size,
  );
}
