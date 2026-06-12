const USER_AGENT =
  process.env.APP_USER_AGENT ?? "FastBuildPOE/0.1 (+https://fastbuildpoe.xyz)";

/**
 * Create a pobb.in paste from a PoB code (anonymous). Returns the share URL,
 * or null if the upload fails (caller falls back to showing the raw code).
 * Endpoint per pobb.in's open-source client (Dav1dde/pasteofexile).
 */
export async function uploadToPobbin(code: string, title: string): Promise<string | null> {
  try {
    const res = await fetch("https://pobb.in/api/internal/paste/", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": USER_AGENT,
        Accept: "application/json",
      },
      body: JSON.stringify({
        as_user: false,
        content: code,
        title: title.slice(0, 100),
        pinned: false,
        private: false,
      }),
    });
    if (!res.ok) return null;
    const id = (await res.json()) as unknown;
    if (typeof id === "string" && id.length > 0) return `https://pobb.in/${id}`;
    return null;
  } catch {
    return null;
  }
}
