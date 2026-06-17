import { ImageResponse } from "next/og";

export const alt = "FastBuildPOE — price-check your whole Path of Exile build in one click";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const FROG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
<defs>
<linearGradient id="f" x1="0" y1="6" x2="0" y2="60" gradientUnits="userSpaceOnUse"><stop stop-color="#4ade80"/><stop offset="1" stop-color="#22c55e"/></linearGradient>
<linearGradient id="c" x1="0" y1="42" x2="0" y2="57" gradientUnits="userSpaceOnUse"><stop stop-color="#fde047"/><stop offset="1" stop-color="#f59e0b"/></linearGradient>
</defs>
<ellipse cx="32" cy="40" rx="25" ry="20" fill="url(#f)" stroke="#15803d" stroke-width="2"/>
<circle cx="19" cy="20" r="11" fill="url(#f)" stroke="#15803d" stroke-width="2"/>
<circle cx="45" cy="20" r="11" fill="url(#f)" stroke="#15803d" stroke-width="2"/>
<circle cx="19" cy="20" r="6.5" fill="#fff"/><circle cx="45" cy="20" r="6.5" fill="#fff"/>
<circle cx="21" cy="21.5" r="3.2" fill="#0b1220"/><circle cx="47" cy="21.5" r="3.2" fill="#0b1220"/>
<path d="M19 42 Q32 50 45 42" fill="none" stroke="#15803d" stroke-width="2.5" stroke-linecap="round"/>
<circle cx="32" cy="49" r="7.5" fill="url(#c)" stroke="#b45309" stroke-width="1.6"/>
<circle cx="32" cy="49" r="4.2" fill="none" stroke="#d97706" stroke-width="1.2"/>
<circle cx="29.6" cy="46.7" r="1.3" fill="#fef9c3"/>
</svg>`;

export default function Image() {
  const frog = `data:image/svg+xml;utf8,${encodeURIComponent(FROG)}`;
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          gap: 56,
          padding: 90,
          background: "linear-gradient(135deg, #eaf7ef 0%, #e8f0fb 100%)",
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={frog} width={320} height={320} alt="frog" />
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ fontSize: 88, fontWeight: 800, color: "#15803d", letterSpacing: -1 }}>
            FastBuildPOE
          </div>
          <div style={{ fontSize: 40, color: "#0f172a", marginTop: 16, lineHeight: 1.25 }}>
            Price-check your whole Path of Exile build in one click.
          </div>
          <div style={{ fontSize: 30, color: "#2563eb", marginTop: 28, fontWeight: 600 }}>
            fastbuildpoe.xyz
          </div>
        </div>
      </div>
    ),
    { ...size },
  );
}
