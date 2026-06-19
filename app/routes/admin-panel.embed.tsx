const APP_URL = "https://web-production-b73a4.up.railway.app";

const STORES = [
  { brand: "Papilora", stores: [
    { slug: "papilora-sk", name: "Papilora SK" },
    { slug: "papilora-cz", name: "Papilora CZ" },
    { slug: "papilora-hu", name: "Papilora HU" },
    { slug: "papilora-pl", name: "Papilora PL" },
    { slug: "papilora-ro", name: "Papilora RO" },
    { slug: "papilora-bg", name: "Papilora BG" },
    { slug: "papilora-ba", name: "Papilora BA" },
    { slug: "papilora-rs", name: "Papilora RS" },
    { slug: "papilora-mk", name: "Papilora MK" },
    { slug: "papilora-hr", name: "Papilora HR (market SK)" },
    { slug: "papilora-si", name: "Papilora SI (market SK)" },
    { slug: "papilora-gr", name: "Papilora GR (market SK)" },
    { slug: "papilora-it", name: "Papilora IT (market SK)" },
  ]},
  { brand: "Artmie", stores: [
    { slug: "artmie-sk", name: "Artmie SK" },
    { slug: "artmie-cz", name: "Artmie CZ" },
    { slug: "artmie-hu", name: "Artmie HU" },
    { slug: "artmie-pl", name: "Artmie PL" },
    { slug: "artmie-ro", name: "Artmie RO" },
    { slug: "artmie-ba", name: "Artmie BA" },
    { slug: "artmie-rs", name: "Artmie RS" },
    { slug: "artmie-bg", name: "Artmie BG (market SK)" },
    { slug: "artmie-de", name: "Artmie DE (market SK)" },
    { slug: "artmie-hr", name: "Artmie HR (market SK)" },
    { slug: "artmie-si", name: "Artmie SI (market SK)" },
    { slug: "artmie-gr", name: "Artmie GR (market SK)" },
    { slug: "artmie-it", name: "Artmie IT (market SK)" },
    { slug: "artmie-at", name: "Artmie AT (market SK)" },
  ]},
];

export default function EmbedCodes() {
  return (
    <div style={{ padding: "32px 40px", maxWidth: 1000 }}>
      <h2 style={{ fontSize: 24, fontWeight: 700, marginBottom: 8 }}>Embed kódy pre Shopify</h2>
      <p style={{ color: "#666", marginBottom: 32, fontSize: 14 }}>
        Skopíruj iframe kód a vlož ho do Shopify stránky: <strong>Pages &rarr; Add page &rarr; prepni na HTML (&lt;&gt;) &rarr; vlož kód &rarr; ulož</strong>
      </p>

      {STORES.map((group) => (
        <div key={group.brand} style={{ marginBottom: 40 }}>
          <h3 style={{
            fontSize: 18, fontWeight: 700, marginBottom: 16, paddingBottom: 8,
            borderBottom: `3px solid ${group.brand === "Papilora" ? "#6B2D8B" : "#E8453C"}`
          }}>
            {group.brand}
          </h3>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {group.stores.map((store) => {
              const iframeCode = `<iframe src="${APP_URL}/returns/${store.slug}" style="width:100%; height:900px; border:none;"></iframe>`;
              const directLink = `${APP_URL}/returns/${store.slug}`;
              return (
                <div key={store.slug} style={{
                  background: "white", borderRadius: 10, padding: 16,
                  border: "1px solid #e5e7eb",
                }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                    <span style={{ fontWeight: 600, fontSize: 15 }}>{store.name}</span>
                    <a href={directLink} target="_blank" rel="noreferrer"
                      style={{ fontSize: 12, color: "#3b82f6", textDecoration: "none" }}>
                      Otvoriť portál &rarr;
                    </a>
                  </div>
                  <div style={{ position: "relative" }}>
                    <code style={{
                      display: "block", background: "#1e1e2e", color: "#a6e3a1", padding: 14,
                      borderRadius: 8, fontSize: 12, lineHeight: 1.5, overflowX: "auto",
                      fontFamily: "monospace", whiteSpace: "pre-wrap", wordBreak: "break-all",
                    }}>
                      {iframeCode}
                    </code>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(iframeCode);
                        const btn = document.getElementById(`btn-${store.slug}`);
                        if (btn) { btn.textContent = "Skopírované!"; setTimeout(() => { btn.textContent = "Kopírovať"; }, 2000); }
                      }}
                      id={`btn-${store.slug}`}
                      style={{
                        position: "absolute", top: 8, right: 8,
                        background: "#3b82f6", color: "white", border: "none",
                        borderRadius: 6, padding: "6px 14px", fontSize: 12, fontWeight: 600,
                        cursor: "pointer",
                      }}
                    >
                      Kopírovať
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
