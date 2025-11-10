from flask import Flask, request, jsonify
from flask_cors import CORS
from openai import OpenAI
from dotenv import load_dotenv
import os
import json

load_dotenv()
app = Flask(__name__)
CORS(app)

client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))

# --------------------------------------
# Generate Full HR Document Template
# --------------------------------------
@app.route("/api/generate-template", methods=["POST"])
def generate_template():
    data = request.get_json()
    document_type = data.get("documentType", "HR Document")
    tone = data.get("tone", "Formal")
    company_name = data.get("companyName", "Nimoy IT Solutions")

    prompt = f"""
You are an expert HR assistant.
Generate a professional HR document template in JSON format.

Type: {document_type}
Tone: {tone}
Company: {company_name}

Always include numbered sections with realistic headings and content.
Use placeholders inside **double curly braces only** like {{employeeName}}, {{joiningDate}}, {{salary}}, {{jobTitle}}, {{department}}, {{hrContactName}}, {{hrContactEmail}}, {{hrContactPhone}}.
Make sure at least some sections contain placeholders.

Return output strictly as JSON:
{{
  "title": "Document Title",
  "sections": [
    {{ "heading": "1. Section Title", "content": "Body with {{placeholder}} ..." }},
    {{ "heading": "2. Section Title", "content": "Body with {{anotherPlaceholder}} ..." }}
  ]
}}
"""

    try:
        resp = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[{"role": "user", "content": prompt}],
            temperature=0.7,
        )
        content = resp.choices[0].message.content.strip()

        # Ensure valid JSON
        try:
            data = json.loads(content)
        except json.JSONDecodeError:
            start = content.find("{")
            end = content.rfind("}") + 1
            data = json.loads(content[start:end])

        return jsonify(data)

    except Exception as e:
        print("Error /api/generate-template:", e)
        return jsonify({"error": str(e)}), 500


# --------------------------------------
# Fill Placeholder Values with AI (returns key->value)
# --------------------------------------
@app.route("/api/fill-placeholders", methods=["POST"])
def fill_placeholders():
    data = request.get_json()
    placeholders = data.get("placeholders", [])
    document_type = data.get("documentType", "HR Document")
    tone = data.get("tone", "Formal")
    company_name = data.get("companyName", "Nimoy IT Solutions")

    placeholder_list = ", ".join(placeholders)
    prompt = f"""
You are an HR assistant AI.
Generate realistic, context-appropriate values for these placeholders
for a document type "{document_type}" in a {tone} tone for "{company_name}".

Return strictly JSON with key-value pairs. No extra text.

Placeholders: {placeholder_list}

Example:
{{
  "employeeName": "John Doe",
  "joiningDate": "10-Nov-2025",
  "salary": "₹8,00,000 per annum",
  "jobTitle": "Software Engineer",
  "department": "Engineering"
}}
"""

    try:
        resp = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[{"role": "user", "content": prompt}],
            temperature=0.6,
        )
        content = resp.choices[0].message.content.strip()
        start = content.find("{")
        end = content.rfind("}") + 1
        json_text = content[start:end]
        data = json.loads(json_text)
        return jsonify(data)

    except Exception as e:
        print("Error /api/fill-placeholders:", e)
        return jsonify({"error": str(e)}), 500


# --------------------------------------
# Fill/Rewrite ENTIRE SECTIONS with AI
# Input: { sections:[{heading, content}], documentType, tone, companyName, placeholderValues }
# Output: { sections:[{heading, content}] } (rewritten content)
# --------------------------------------
@app.route("/api/fill-sections", methods=["POST"])
def fill_sections():
    payload = request.get_json()
    sections = payload.get("sections", [])
    document_type = payload.get("documentType", "HR Document")
    tone = payload.get("tone", "Formal")
    company_name = payload.get("companyName", "Nimoy IT Solutions")
    placeholder_values = payload.get("placeholderValues", {})  # dict of key->value

    # Build a compact instruction to rewrite each section fully.
    prompt = f"""
You are an expert HR writer. Rewrite and complete EACH section content for the following HR document.
Document Type: {document_type}
Tone: {tone}
Company: {company_name}

If placeholders are provided as values, use them in the content naturally.
If a placeholder has no value, you may keep it as a placeholder using double braces like {{placeholder}}.

Placeholder values (JSON):
{json.dumps(placeholder_values, ensure_ascii=False, indent=2)}

Sections (JSON array with heading and current content):
{json.dumps(sections, ensure_ascii=False, indent=2)}

Return strictly valid JSON:
{{ "sections": [ {{ "heading": "...", "content": "..." }}, ... ] }}
"""

    try:
        resp = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[{"role": "user", "content": prompt}],
            temperature=0.7,
        )
        content = resp.choices[0].message.content.strip()
        start = content.find("{")
        end = content.rfind("}") + 1
        json_text = content[start:end]
        data = json.loads(json_text)

        # Ensure structure
        out_sections = data.get("sections", [])
        if not isinstance(out_sections, list):
            raise ValueError("Invalid sections format")
        return jsonify({"sections": out_sections})

    except Exception as e:
        print("Error /api/fill-sections:", e)
        return jsonify({"error": str(e)}), 500
    
@app.route("/api/get-template", methods=["POST"])
def get_template():
    data = request.get_json()
    template_type = data.get("templateType", "Offer Letter")

    # You can expand this library easily
    templates = {
        "Offer Letter": """
        You are an expert HR writer. Generate a professional Offer Letter with numbered sections and placeholders.
        Include realistic headings like Introduction, Role, Compensation, Benefits, Terms, and Acceptance.
        Use placeholders such as {employeeName}, {jobTitle}, {joiningDate}, {salary}.
        Output JSON like:
        {
          "title": "Offer Letter",
          "sections": [
            {"heading": "1. Introduction", "content": "Dear {employeeName}, ..."},
            {"heading": "2. Compensation", "content": "Your salary will be {salary} per annum."}
          ]
        }
        """,
        "Internship Letter": """
        You are an expert HR writer. Generate a professional Internship Offer Letter.
        Include sections like Introduction, Internship Role, Duration, Stipend, and Acceptance.
        Use placeholders {internName}, {startDate}, {duration}, {stipend}.
        Output JSON format same as above.
        """,
        "Non-Disclosure Agreement": """
        You are an expert HR legal assistant. Generate a Mutual NDA template with clear sections:
        Introduction, Confidential Information, Obligations, Term, and Governing Law.
        Use placeholders {partyA}, {partyB}, {effectiveDate}.
        Output JSON in the same format as above.
        """,
    }

    prompt = templates.get(template_type, templates["Offer Letter"])

    try:
        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[{"role": "user", "content": prompt}],
            temperature=0.7,
        )

        content = response.choices[0].message.content.strip()
        start = content.find("{")
        end = content.rfind("}") + 1
        json_data = json.loads(content[start:end])
        return jsonify(json_data)

    except Exception as e:
        print("Error:", e)
        return jsonify({"error": str(e)}), 500


@app.route("/api/improve-section", methods=["POST"])
def improve_section():
    data = request.get_json()
    section_text = data.get("text", "")
    tone = data.get("tone", "Formal")

    prompt = f"""
    You are an HR writing assistant.
    Improve the following section to make it clearer and more professional in a {tone} tone:
    ---
    {section_text}
    ---
    Return only the improved section text.
    """

    try:
        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[{"role": "user", "content": prompt}],
            temperature=0.7,
        )

        improved_text = response.choices[0].message.content.strip()
        return jsonify({"improvedText": improved_text})

    except Exception as e:
        print("Error:", e)
        return jsonify({"error": str(e)}), 500

if __name__ == "__main__":
    app.run(port=5000, debug=True)
