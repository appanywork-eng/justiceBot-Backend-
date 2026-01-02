import { useState, useEffect } from "react";

export default function App() {
  const [fullName, setFullName] = useState("");
  const [address, setAddress] = useState("");
  const [phone, setPhone] = useState("");
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [preview, setPreview] = useState("");
  const [petitionText, setPetitionText] = useState("");
  const [unlocked, setUnlocked] = useState(false);
  const [txRef, setTxRef] = useState("");
  const [mailto, setMailto] = useState("");

  // IMPORTANT: Use your real Render backend URL (https)
  const API_BASE = "https://justicebot-backend-6pzy.onrender.com";

  // For now, enable free mode so everything works without payment (for testing)
  const IS_FREE_TESTING = true; // Change to false when ready for production

  async function handleGenerate(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    setPreview("");
    setPetitionText("");
    setUnlocked(false);

    try {
      const res = await fetch(`${API_BASE}/generate-petition`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          complaint: description.trim(),
          petitioner: {
            fullName: fullName.trim(),
            address: address.trim(),
            phone: phone.trim(),
          },
        }),
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || "Server error - check backend logs");
      }

      const data = await res.json();

      if (IS_FREE_TESTING) {
        // Free mode: auto unlock everything for testing
        setUnlocked(true);
        setPetitionText(data.petition || data.preview || "No petition generated");
        setMailto(data.mailto || "");
      } else {
        setPreview(data.preview || "");
        setTxRef(data.tx_ref || "");
      }
    } catch (err) {
      setError(err.message || "Failed to connect to server. Check internet or backend.");
      console.error("Fetch error:", err);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ maxWidth: 900, margin: "0 auto", padding: 20, background: "#f9f9f9", minHeight: "100vh" }}>
      <h1 style={{ textAlign: "center", color: "#006600" }}>PetitionDesk</h1>

      <form onSubmit={handleGenerate} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <label>Full Name</label>
        <input value={fullName} onChange={(e) => setFullName(e.target.value)} required />

        <label>Address</label>
        <input value={address} onChange={(e) => setAddress(e.target.value)} required />

        <label>Phone</label>
        <input value={phone} onChange={(e) => setPhone(e.target.value)} required />

        <label>Your Complaint / Issue</label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={6}
          required
          placeholder="Describe your issue in detail..."
        />

        <button
          type="submit"
          disabled={loading}
          style={{
            padding: "14px",
            background: loading ? "#aaa" : "#006600",
            color: "#fff",
            border: "none",
            borderRadius: "8px",
            fontSize: "16px",
            cursor: loading ? "not-allowed" : "pointer",
          }}
        >
          {loading ? "Generating..." : "Generate Petition"}
        </button>
      </form>

      {error && (
        <div style={{ color: "red", marginTop: 20, textAlign: "center" }}>
          {error}
        </div>
      )}

      {petitionText && (
        <div style={{ marginTop: 30 }}>
          <h2 style={{ color: "#006600" }}>Your Petition</h2>
          <pre
            style={{
              background: "#fff",
              padding: 20,
              borderRadius: 8,
              whiteSpace: "pre-wrap",
              fontSize: "15px",
              lineHeight: 1.6,
              border: "1px solid #ddd",
              minHeight: 300,
            }}
          >
            {petitionText}
          </pre>

          {mailto && (
            <a
              href={mailto}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: "block",
                marginTop: 20,
                padding: "14px",
                background: "#006600",
                color: "#fff",
                textAlign: "center",
                borderRadius: 8,
                textDecoration: "none",
                fontWeight: "bold",
              }}
            >
              Open Email & Send
            </a>
          )}
        </div>
      )}
    </div>
  );
}
