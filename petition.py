from flask import Blueprint, request, jsonify
import openai
import json
import re

petition_bp = Blueprint("petition_bp", __name__)

openai.api_key = "YOUR_API_KEY_HERE"

def extract_json(text):
    json_match = re.search(r"\{[\s\S]*\}", text)
    if json_match:
        try:
            return json.loads(json_match.group(0))
        except:
            return None
    return None

@petition_bp.route("/petition", methods=["POST"])
def generate_petition():
    data = request.get_json()

    fullName = data.get("fullName", "")
    email = data.get("email", "")
    phone = data.get("phone", "")
    description = data.get("description", "")

    prompt = f"""
You are JusticeBot. Generate a structured petition.
Return ONLY a JSON object in this EXACT format:

{{
  "petitionText": "...",
  "primaryInstitution": "...",
  "emailCc": ["..."]
}}

Complaint:
{description}
User:
{fullName}, {email}, {phone}
    """

    try:
        completion = openai.ChatCompletion.create(
            model="gpt-4o-mini",
            messages=[{"role": "user", "content": prompt}]
        )

        raw = completion.choices[0].message["content"]

        parsed = extract_json(raw)

        if parsed is None:
            return jsonify({
                "error": True,
                "message": "AI returned invalid JSON",
                "petitionText": "",
                "primaryInstitution": "",
                "emailCc": []
            }), 500

        return jsonify(parsed)

    except Exception as e:
        return jsonify({
            "error": True,
            "message": str(e),
            "petitionText": "",
            "primaryInstitution": "",
            "emailCc": []
        }), 500
