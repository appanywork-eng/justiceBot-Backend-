import { useState, useEffect } from "react";

export default function App() {
  const [fullName, setFullName] = useState("");
  const [address, setAddress] = useState("");
  const [phone, setPhone] = useState("");
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [petitionText, setPetitionText] = useState("");
  const [mailto, setMailto] = useState("");

  // Your live Render backend URL
  const API_BASE = "https://justicebot-backend-6pzy.onrender.com";

  // For testing: auto-unlock everything without payment
  const IS_FREE_TESTING = true; // Change to false when ready for production

  async function handleGenerate(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    setPetitionText("");

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
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `Server responded with status ${res.status}`);
      }

      const data = await res.json();

      if (IS_FREE_TESTING) {
        // Free testing mode: show full petition immediately
        setPetitionText(data.petition || data.preview || "No petition text received from server");
        setMailto(data.mailto || "");
      } else {
        // Production mode: preview only
        setPetitionText(data.preview || "Preview not available");
      }
    } catch (err) {
      setError("Failed to connect: " + err.message);
      console.error("Fetch error details:", err);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      style={{
        maxWidth: 900,
        margin: "0 auto",
        padding: 20,
        background: "#f9f9f9",
        minHeight: "100vh",
        fontFamily: "system-ui, sans-serif",
      }}
    >
      <h1 style={{ textAlign: "center", color: "#006600" }}>PetitionDesk</h1>

      <form
        onSubmit={handleGenerate}
        style={{ display: "flex", flexDirection: "column", gap: 16 }}
      >
        <label style={{ fontWeight: "bold" }}>Full Name</label>
        <input
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          required
          style={{ padding: "12px", borderRadius: "8px", border: "1px solid #ccc" }}
        />

        <label style={{ fontWeight: "bold" }}>Address</label>
        <input
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          required
          style={{ padding: "12px", borderRadius: "8px", border: "1px solid #ccc" }}
        />

        <label style={{ fontWeight: "bold" }}>Phone</label>
        <input
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          required
          style={{ padding: "12px", borderRadius: "8px", border: "1px solid #ccc" }}
        />

        <label style={{ fontWeight: "bold" }}>Your Complaint / Issue</label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={6}
          required
          placeholder="Describe your issue in detail..."
          style={{ padding: "12px", borderRadius: "8px", border: "1px solid #ccc" }}
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
            marginTop: "10px",
          }}
        >
          {loading ? "Generating..." : "Generate Petition"}
        </button>
      </form>

      {error && (
        <div
          style={{
            color: "red",
            marginTop: 20,
            textAlign: "center",
            padding: "12px",
            background: "#ffebee",
            borderRadius: "8px",
          }}
        >
          {error}
        </div>
      )}

      {petitionText && (
        <div style={{ marginTop: 30 }}>
          <h2 style={{ color: "#006600", textAlign: "center" }}>Your Petition</h2>
          <pre
            style={{
              background: "#ffffff",
              padding: 20,
              borderRadius: 8,
              whiteSpace: "pre-wrap",
              fontSize: "15px",
              lineHeight: 1.6,
              border: "1px solid #ddd",
              minHeight: 300,
              overflowY: "auto",
              maxHeight: "500px",
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
