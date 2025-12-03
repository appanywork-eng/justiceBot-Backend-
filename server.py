from flask import Flask, request, jsonify
from flask_cors import CORS
import openai

app = Flask(__name__)
CORS(app)

openai.api_key = "your_openai_api_key_here"

@app.route("/", methods=["GET"])
def home():
    return "JusticeBot Backend Active"

@app.route("/generate", methods=["POST"])
def generate_petition():
    data = request.json
    fullName = data.get("fullName", "")
    email = data.get("email", "")
    phone = data.get("phone", "")
    complaint = data.get("complaint", "")

    if not complaint:
        return jsonify({"error": "Complaint field is empty"}), 400

    prompt = f"""
Write a formal legal petition for the Public Complaints Commission of Nigeria.

Full Name: {fullName}
Email: {email}
Phone: {phone}

COMPLAINT:
{complaint}

The petition must include:
- Formal heading to the correct institution
- Introduction
- Facts
- Reliefs sought
- Conclusion
- Proper legal formatting
- Signature block with the user's name, email, phone
"""

    try:
        response = openai.ChatCompletion.create(
            model="gpt-4o-mini",
            messages=[{"role": "user", "content": prompt}]
        )
        petition = response["choices"][0]["message"]["content"]
        return jsonify({"petition": petition})

    except Exception as e:
        return jsonify({"error": str(e)}), 500


import os
port = int(os.environ.get("PORT", 8080))

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=port)
