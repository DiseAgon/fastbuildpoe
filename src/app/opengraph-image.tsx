import { ImageResponse } from "next/og";

export const alt = "FastBuildPOE — price-check your whole Path of Exile build in one click";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const CAT = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
<defs>
<linearGradient id="f" x1="0" y1="8" x2="0" y2="40" gradientUnits="userSpaceOnUse"><stop stop-color="#fdba74"/><stop offset="1" stop-color="#f97316"/></linearGradient>
<linearGradient id="c" x1="0" y1="26" x2="0" y2="60" gradientUnits="userSpaceOnUse"><stop stop-color="#fde047"/><stop offset="1" stop-color="#f59e0b"/></linearGradient>
</defs>
<circle cx="32" cy="43" r="17" fill="url(#c)" stroke="#b45309" stroke-width="2"/>
<circle cx="32" cy="43" r="11.5" fill="none" stroke="#d97706" stroke-width="1.6"/>
<circle cx="26" cy="52.5" r="1.6" fill="#fef9c3"/>
<path d="M15 26 L17 10 L27 17 Z" fill="url(#f)" stroke="#c2410c" stroke-width="2" stroke-linejoin="round"/>
<path d="M49 26 L47 10 L37 17 Z" fill="url(#f)" stroke="#c2410c" stroke-width="2" stroke-linejoin="round"/>
<path d="M18.6 21.5 L19.6 14.5 L24.6 18 Z" fill="#fda4af"/>
<path d="M45.4 21.5 L44.4 14.5 L39.4 18 Z" fill="#fda4af"/>
<path d="M14 30 a18 15 0 0 1 36 0 l0 0 a18 8 0 0 1 -36 0 Z" fill="url(#f)" stroke="#c2410c" stroke-width="2"/>
<circle cx="24" cy="27" r="4.6" fill="#fff"/><circle cx="40" cy="27" r="4.6" fill="#fff"/>
<circle cx="25" cy="28" r="2.5" fill="#1e293b"/><circle cx="41" cy="28" r="2.5" fill="#1e293b"/>
<ellipse cx="22" cy="37" rx="4" ry="3" fill="url(#f)" stroke="#c2410c" stroke-width="1.6"/>
<ellipse cx="42" cy="37" rx="4" ry="3" fill="url(#f)" stroke="#c2410c" stroke-width="1.6"/>
</svg>`;

export default function Image() {
  const cat = `data:image/svg+xml;utf8,${encodeURIComponent(CAT)}`;
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
          backgroundColor: "#FFF7ED",
          backgroundImage:
            "radial-gradient(circle at 15% 0%, rgba(249,115,22,0.18), transparent 55%), radial-gradient(circle at 90% 0%, rgba(37,99,235,0.14), transparent 55%)",
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={cat} width={320} height={320} alt="cat" />
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ fontSize: 88, fontWeight: 800, color: "#ea580c", letterSpacing: -1 }}>
            FastBuildPOE
          </div>
          <div style={{ fontSize: 40, color: "#1e293b", marginTop: 16, lineHeight: 1.25 }}>
            Price-check your whole Path of Exile build in one click.
          </div>
          <div style={{ fontSize: 30, color: "#2563EB", marginTop: 28, fontWeight: 600 }}>
            fastbuildpoe.xyz
          </div>
        </div>
      </div>
    ),
    { ...size },
  );
}
