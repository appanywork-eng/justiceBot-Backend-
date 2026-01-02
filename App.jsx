import { useState } from "react";

export default function App() {
  const [fullName, setFullName] = useState("");
  const [address, setAddress] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [location, setLocation] = useState("Nigeria");
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [petitionText, setPetitionText] = useState("");

  const API_BASE = https://justicebot-backend-6pzy.onrender.com

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setPetitionText("");
    setLoading(true);

    try {
      const res = await fetch(`${API_BASE}/route`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fullName: fullName.trim(),
          address: address.trim(),
          email: email.trim(),
          phone: phone.trim(),
          location: location.trim() || "Nigeria",
          complaint: description.trim()
        })
      });

      const data = await res.json();

      if (!res.ok || !data?.institution) {
        throw new Error(data?.error || "Server error");
      }

      setPetitionText(data.institution + "\n\n" + data.reason);
      setPetitionText(data.petition || "");
      
    } catch (err) {
      setError(err.message || "Failed to generate petition");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ maxWidth: 900, margin: "0 auto", padding: 20 }}>
      <h1 style={{ textAlign: "center" }}>PetitionDesk</h1>

      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <label>Full Name</label>
        <input value={fullName} onChange={(e) => setFullName(e.target.value)} />

        <label>Address</label>
        <input value={address} onChange={(e) => setAddress(e.target.value)} />

        <label>Email</label>
        <input value={email} onChange={(e) => setEmail(e.target.value)} />

        <label>Phone</label>
        <input value={phone} onChange={(e) => setPhone(e.target.value)} />

        <label>Your Complaint</label>
        <textarea value={description} onChange={(e) => setDescription(e.target.value)} />

        <button disabled={loading}>
          {loading ? "Generating..." : "Generate Petition"}
        </button>
      </form>

      {error && <div style={{ color: "red", marginTop: 10 }}>{error}</div>}

      {petitionText && (
        <pre style={{ background: "#fff", padding: 12, minHeight: 260, userSelect: "none" }}
          onCopy={(e) => e.preventDefault()}
          onCut={(e) => e.preventDefault()}>
          {petitionText}
        </pre>
      )}
    </div>
  );
