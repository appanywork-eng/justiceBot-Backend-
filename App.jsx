import { useState } from "react";

export default function App() {
  const [fullName, setFullName] = useState("");
  const [address, setAddress] = useState("");
  const [phone, setPhone] = useState("");
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [preview, setPreview] = useState("");
  const [txRef, setTxRef] = useState("");
  const [needsPayment, setNeedsPayment] = useState(false);
  const [unlocked, setUnlocked] = useState(false);
  const [petitionText, setPetitionText] = useState("");
  const [mailto, setMailto] = useState("");

  // FIXED: Use your live Render backend URL
  const API_BASE = "https://justicebot-backend-6pzy.onrender.com";

  // Free testing mode: auto-unlock everything (no payment needed)
  const IS_FREE_TESTING = true; // Change to false when ready for production

  async function handleGenerate(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    setPreview("");
    setTxRef("");
    setNeedsPayment(false);
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
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `Server error (${res.status})`);
      }

      const data = await res.json();

      if (IS_FREE_TESTING) {
        // Free mode: show full petition immediately
        setUnlocked(true);
        setPetitionText(data.petition || data.preview || "No petition text received from server");
        setMailto(data.mailto || "");
      } else {
        // Normal mode (preview only)
        setPreview(data.preview || "");
        setTxRef(data.tx_ref || "");
        setNeedsPayment(data.needsPayment || false);
      }
    } catch (err) {
      setError("Failed to connect: " + err.message);
      console.error("Fetch error:", err);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      style={{
        maxWidth: "960px",
        margin: "0 auto",
        padding: "20px",
        backgroundColor: "#f8f9fa",
        minHeight: "100vh",
        fontFamily: "system-ui, sans-serif",
      }}
    >
      {/* Moving Disclaimer */}
      <div
        style={{
          backgroundColor: "#006600",
          color: "#ffffff",
          padding: "14px 0",
          overflow: "hidden",
          whiteSpace: "nowrap",
          marginBottom: "24px",
          borderRadius: "12px",
          boxShadow: "0 4px 15px rgba(0, 102, 0, 0.2)",
        }}
      >
        <div
          style={{
            display: "inline-block",
            paddingLeft: "100%",
            animation: "marquee 35s linear infinite",
            fontSize: "15px",
            fontWeight: "500",
          }}
        >
          ✨ PetitionDesk is an advanced AI-powered tool designed to help you draft professional petitions quickly and clearly. 
          It provides structured drafts based on your input. For official submission, always review with a qualified lawyer. 
          Your peace of mind matters to us. ✨ &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;
          ✨ PetitionDesk — Empowering your voice with smart, professional drafting assistance...
        </div>
      </div>

      {/* Header */}
      <div
        style={{
          background: "linear-gradient(135deg, #006600, #009900)",
          color: "#ffffff",
          padding: "28px 20px",
          borderRadius: "16px",
          textAlign: "center",
          marginBottom: "40px",
          boxShadow: "0 6px 20px rgba(0, 102, 0, 0.3)",
          position: "relative",
        }}
      >
        <div
          style={{
            position: "absolute",
            top: "20px",
            left: "20px",
            backgroundColor: "#ffffff",
            color: "#006600",
            width: "70px",
            height: "70px",
            borderRadius: "50%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: "32px",
            fontWeight: "bold",
            boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
          }}
        >
          PD
        </div>
        <h1 style={{ fontSize: "42px", fontWeight: "900", margin: "0 0 8px 0" }}>
          PetitionDesk
        </h1>
        <p style={{ fontSize: "18px", fontWeight: "500", margin: 0 }}>
          Legal AI Petition Generator
        </p>
      </div>

      {!unlocked ? (
        <>
          <form
            onSubmit={handleGenerate}
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "22px",
              background: "#fff",
              padding: "32px",
              borderRadius: "16px",
              boxShadow: "0 6px 20px rgba(0,0,0,0.1)",
            }}
          >
            <label style={{ fontWeight: "600" }}>Full Name</label>
            <input
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              style={{
                padding: "14px",
                border: "1px solid #ddd",
                borderRadius: "10px",
                fontSize: "16px",
              }}
              required
            />

            <label style={{ fontWeight: "600" }}>Address</label>
            <input
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              style={{
                padding: "14px",
                border: "1px solid #ddd",
                borderRadius: "10px",
                fontSize: "16px",
              }}
              required
            />

            <label style={{ fontWeight: "600" }}>Phone</label>
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              style={{
                padding: "14px",
                border: "1px solid #ddd",
                borderRadius: "10px",
                fontSize: "16px",
              }}
              required
            />

            <label style={{ fontWeight: "600" }}>Your Complaint / Issue</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              style={{
                padding: "14px",
                border: "1px solid #ddd",
                borderRadius: "10px",
                fontSize: "16px",
                minHeight: "180px",
                resize: "vertical",
              }}
              required
            />

            <button
              disabled={loading || !description.trim()}
              style={{
                padding: "16px",
                backgroundColor: loading || !description.trim() ? "#aaa" : "#006600",
                color: "#fff",
                fontWeight: "bold",
                fontSize: "17px",
                border: "none",
                borderRadius: "10px",
                cursor: loading ? "not-allowed" : "pointer",
              }}
            >
              {loading ? "Generating..." : "Generate Petition"}
            </button>
          </form>

          {needsPayment && (
            <div style={{ marginTop: "40px" }}>
              <h2 style={{ color: "#006600", textAlign: "center", marginBottom: "20px" }}>
                Petition Preview
              </h2>

              <div style={{ position: "relative", borderRadius: "12px", overflow: "hidden", boxShadow: "0 4px 12px rgba(0,0,0,0.1)" }}>
                <pre
                  style={{
                    padding: "32px",
                    margin: 0,
                    fontSize: "15px",
                    lineHeight: "1.65",
                    whiteSpace: "pre-wrap",
                    textAlign: "justify",
                    background: "#fff",
                    minHeight: "500px",
                  }}
                >
                  {preview}
                </pre>
              </div>

              <button
                onClick={() => alert("Payment flow coming soon in production mode")}
                style={{
                  marginTop: "30px",
                  width: "100%",
                  padding: "18px",
                  backgroundColor: "#006600",
                  color: "#fff",
                  fontSize: "18px",
                  fontWeight: "bold",
                  border: "none",
                  borderRadius: "12px",
                  cursor: "pointer",
                }}
              >
                Pay ₦1,050 to Unlock Full Petition
              </button>
            </div>
          )}
        </>
      ) : (
        <div style={{ background: "#fff", padding: "40px", borderRadius: "16px", boxShadow: "0 6px 20px rgba(0,0,0,0.1)" }}>
          <h2 style={{ color: "#006600", textAlign: "center", marginBottom: "30px" }}>
            Your Full Petition is Ready!
          </h2>
          <pre
            style={{
              whiteSpace: "pre-wrap",
              fontSize: "15px",
              lineHeight: "1.7",
              background: "#f9fff9",
              padding: "20px",
              borderRadius: "10px",
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
                margin: "40px auto 0",
                padding: "18px",
                backgroundColor: "#006600",
                color: "#fff",
                textAlign: "center",
                borderRadius: "12px",
                textDecoration: "none",
                fontSize: "18px",
                fontWeight: "bold",
                maxWidth: "500px",
              }}
            >
              Open Email Client & Send Petition
            </a>
          )}
        </div>
      )}

      {error && (
        <div
          style={{
            color: "#d32f2f",
            background: "#ffebee",
            padding: "16px",
            borderRadius: "8px",
            marginTop: "20px",
            textAlign: "center",
          }}
        >
          {error}
        </div>
      )}
    </div>
  );
}

const inputStyle = {
  padding: "14px",
  border: "1px solid #ddd",
  borderRadius: "10px",
  fontSize: "16px",
  backgroundColor: "#fff",
};
