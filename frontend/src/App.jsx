import React, { useRef, useState } from "react";
import SignatureCanvas from "react-signature-canvas";
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  AlignmentType,
  Header,
  Footer,
  ImageRun,
} from "docx";
import { saveAs } from "file-saver";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";
import "./App.css";

/* ---------- Utils ---------- */
async function getImageBuffer(imageUrl) {
  const response = await fetch(imageUrl);
  return await response.arrayBuffer();
}

function extractKeysFromText(text) {
  const regex =
    /{{\s*([^{}[\]]+?)\s*}}|{\s*([^{}[\]]+?)\s*}|\[\s*([^\[\]{}]+?)\s*\]/g;
  const found = new Set();
  let m;
  while ((m = regex.exec(text)) !== null) {
    const key = (m[1] || m[2] || m[3] || "").trim();
    if (key) found.add(key);
  }
  return found;
}

function applyPlaceholders(text, placeholderArray, asHTML = false) {
  if (!text) return "";
  const map = Object.fromEntries(
    placeholderArray.map((p) => [p.key.trim(), (p.value || "").trim()])
  );

  Object.keys(map).forEach((key) => {
    const val = map[key];
    const re = new RegExp(
      `{{\\s*${escapeReg(key)}\\s*}}|{\\s*${escapeReg(
        key
      )}\\s*}|\\[\\s*${escapeReg(key)}\\s*\\]`,
      "g"
    );
    if (val) {
      text = text.replace(re, val);
    } else if (asHTML) {
      text = text.replace(
        re,
        `<span class="placeholder-highlight">{${key}}</span>`
      );
    }
  });

  if (asHTML) {
    const leftover =
      /{{\s*([^{}[\]]+?)\s*}}|{\s*([^{}[\]]+?)\s*}|\[\s*([^\[\]{}]+?)\s*\]/g;
    text = text.replace(leftover, (match, a, b, c) => {
      const k = (a || b || c || "").trim();
      if (!map[k] || map[k] === "") {
        return `<span class="placeholder-highlight">{${k}}</span>`;
      }
      return match;
    });
  }
  return text;
}

function escapeReg(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/* ---------- Component ---------- */
const App = () => {
  const [documentType, setDocumentType] = useState("");
  const [tone, setTone] = useState("Formal");
  const [companyName, setCompanyName] = useState("Nimoy IT Solutions");
  const [sections, setSections] = useState([]);
  const [title, setTitle] = useState("");
  const [placeholders, setPlaceholders] = useState([]);
  const [lastApplied, setLastApplied] = useState(false);
  const [signerName, setSignerName] = useState("");
  const [signatureDate, setSignatureDate] = useState("");
  const [templateType, setTemplateType] = useState("Offer Letter");
  const [loading, setLoading] = useState(false);

  // ✍️ Signature States
  const sigPad = useRef(null);
  const [signatureData, setSignatureData] = useState(null);

  /* ---------- Signature Handlers ---------- */
  const clearSignature = () => {
    sigPad.current.clear();
    setSignatureData(null);
  };
  const saveSignature = () => {
    if (sigPad.current.isEmpty()) {
      alert("Please draw your signature first!");
      return;
    }
    const dataURL = sigPad.current.toDataURL("image/png");
    setSignatureData(dataURL);
    const now = new Date();
    setSignatureDate(now.toLocaleString());
  };
  const uploadSignature = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = () => setSignatureData(reader.result);
    reader.readAsDataURL(file);
  };

  /* ---------- Placeholder Extraction ---------- */
  const extractPlaceholders = (sectionsData) => {
    const found = new Set();
    sectionsData.forEach((sec) => {
      extractKeysFromText(`${sec.heading} ${sec.content}`).forEach((k) =>
        found.add(k)
      );
    });
    setPlaceholders((prev) => {
      const prevMap = Object.fromEntries(prev.map((p) => [p.key, p.value]));
      return Array.from(found).map((key) => ({
        key,
        value: prevMap[key] || "",
      }));
    });
  };

  /* ---------- Backend Calls ---------- */
  const generateTemplate = async () => {
    const res = await fetch("http://localhost:5000/api/generate-template", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ documentType, tone, companyName }),
    });
    const data = await res.json();
    setTitle(data.title || "Untitled Document");
    setSections(data.sections || []);
    setLastApplied(false);
    extractPlaceholders(data.sections || []);
  };

  const fillPlaceholdersWithAI = async () => {
    const keys = placeholders.map((p) => p.key);
    if (keys.length === 0) {
      alert("No placeholders detected!");
      return;
    }
    const res = await fetch("http://localhost:5000/api/fill-placeholders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ placeholders: keys, documentType, tone, companyName }),
    });
    const data = await res.json();
    if (data.error) {
      alert("Error generating placeholder values.");
      return;
    }
    const updated = placeholders.map((ph) => ({
      ...ph,
      value: data[ph.key] || ph.value || "",
    }));
    setPlaceholders(updated);
    setLastApplied(false);
  };

  const fillEntireSectionsWithAI = async () => {
    const res = await fetch("http://localhost:5000/api/fill-sections", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sections,
        documentType,
        tone,
        companyName,
        placeholderValues: Object.fromEntries(
          placeholders.map((p) => [p.key, p.value])
        ),
      }),
    });
    const data = await res.json();
    if (data.error) {
      alert("Error rewriting sections with AI.");
      return;
    }
    setSections(data.sections || []);
    setLastApplied(false);
    extractPlaceholders(data.sections || []);
  };

  /* ---------- Editing Handlers ---------- */
  const onChangePlaceholderValue = (index, value) => {
    setPlaceholders((prev) =>
      prev.map((ph, i) => (i === index ? { ...ph, value } : ph))
    );
    setLastApplied(false);
  };

  const handleHeadingChange = (i, value) => {
    setSections((prev) =>
      prev.map((s, idx) => (idx === i ? { ...s, heading: value } : s))
    );
    setLastApplied(false);
  };

  const handleContentChange = (i, value) => {
    setSections((prev) =>
      prev.map((s, idx) => (idx === i ? { ...s, content: value } : s))
    );
    setLastApplied(false);
  };

  const addSection = () => {
    setSections((prev) => [
      ...prev,
      { heading: "New Section", content: "Enter text here..." },
    ]);
    setLastApplied(false);
  };

  const removeSection = (index) => {
    setSections((prev) => prev.filter((_, i) => i !== index));
    setLastApplied(false);
  };

  const applyValuesToDocument = () => {
    const map = Object.fromEntries(
      placeholders.map((p) => [p.key.trim(), (p.value || "").trim()])
    );
    const replaced = sections.map((sec) => {
      const newHeading = replaceAllTokens(sec.heading, map);
      const newContent = replaceAllTokens(sec.content, map);
      return { heading: newHeading, content: newContent };
    });
    setSections(replaced);
    setLastApplied(true);
    extractPlaceholders(replaced);
  };

  function replaceAllTokens(text, map) {
    let t = text;
    for (const key in map) {
      const val = map[key];
      const re = new RegExp(
        `{{\\s*${escapeReg(key)}\\s*}}|{\\s*${escapeReg(
          key
        )}\\s*}|\\[\\s*${escapeReg(key)}\\s*\\]`,
        "g"
      );
      t = t.replace(re, val || `{${key}}`);
    }
    return t;
  }

  const improveSection = async (index) => {
    const text = sections[index].content;
    setLoading(true);
    const res = await fetch("http://localhost:5000/api/improve-section", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, tone }),
    });
    const data = await res.json();
    setLoading(false);
    if (data.improvedText) {
      setSections((prev) =>
        prev.map((s, i) => (i === index ? { ...s, content: data.improvedText } : s))
      );
    } else {
      alert("AI failed to improve the section. Try again!");
    }
  };

  const loadTemplate = async () => {
    setLoading(true);
    const res = await fetch("http://localhost:5000/api/get-template", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ templateType }),
    });
    const data = await res.json();
    setLoading(false);
    setTitle(data.title || "Untitled Document");
    setSections(data.sections || []);
    extractPlaceholders(data.sections || []);
  };

  /* ---------- Export Word ---------- */
  const generateDocx = async () => {
    const applied = sections.map((s) => ({
      heading: applyPlaceholders(s.heading, placeholders, false),
      content: applyPlaceholders(s.content, placeholders, false),
    }));

    const logoBuffer = await getImageBuffer("/logo.png");

    const children = [
      new Paragraph({
        children: [
          new TextRun({ text: title, bold: true, size: 32, font: "Times New Roman" }),
        ],
        alignment: AlignmentType.CENTER,
        spacing: { after: 400 },
      }),
      ...applied.flatMap((sec) => [
        new Paragraph({
          children: [
            new TextRun({
              text: sec.heading,
              bold: true,
              size: 26,
              font: "Times New Roman",
            }),
          ],
          spacing: { before: 300, after: 150 },
        }),
        new Paragraph({
          children: [
            new TextRun({
              text: sec.content,
              size: 24,
              font: "Calibri",
            }),
          ],
          alignment: AlignmentType.JUSTIFIED,
          spacing: { line: 360, after: 200 },
        }),
      ]),
    ];

    if (signatureData) {
      const sigBuffer = await fetch(signatureData).then((r) => r.arrayBuffer());
      children.push(
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { before: 400 },
          children: [
            new ImageRun({ data: sigBuffer, transformation: { width: 150, height: 60 } }),
          ],
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [
            new TextRun({
              text: `Signed by ${signerName || "Authorized Signatory"}${
                signatureDate ? " on " + signatureDate : ""
              }`,
              italics: true,
              size: 22,
            }),
          ],
        })
      );
    }


    const doc = new Document({
      sections: [
        {
          properties: {
            page: { margin: { top: 720, right: 720, bottom: 720, left: 720 } },
          },
          headers: {
            default: new Header({
              children: [
                new Paragraph({
                  alignment: AlignmentType.CENTER,
                  children: [
                    new ImageRun({
                      data: logoBuffer,
                      transformation: { width: 80, height: 80 },
                    }),
                  ],
                }),
                new Paragraph({
                  alignment: AlignmentType.CENTER,
                  children: [
                    new TextRun({
                      text: companyName,
                      bold: true,
                      font: "Calibri",
                      size: 24,
                    }),
                  ],
                }),
              ],
            }),
          },
          children,
        },
      ],
    });

    const blob = await Packer.toBlob(doc);
    saveAs(blob, `${title.replaceAll(" ", "_")}.docx`);
  };

  /* ---------- Export PDF ---------- */
  const generatePDF = async () => {
    const previewElement = document.querySelector(".preview-box");
    if (!previewElement) return;
    const canvas = await html2canvas(previewElement, { scale: 2 });
    const imgData = canvas.toDataURL("image/png");

    const pdf = new jsPDF("p", "mm", "a4");
    const pdfWidth = pdf.internal.pageSize.getWidth();
    const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
    pdf.addImage(imgData, "PNG", 0, 0, pdfWidth, pdfHeight);

    if (signatureData) {
      const imgHeight = 25;
      const imgWidth = 60;
      const pageHeight = pdf.internal.pageSize.getHeight();
      pdf.addImage(
        signatureData,
        "PNG",
        pdfWidth / 2 - imgWidth / 2,
        pageHeight - imgHeight - 20,
        imgWidth,
        imgHeight
      );
      pdf.text(
        `Signed by ${signerName || "Authorized Signatory"}${
          signatureDate ? " on " + signatureDate : ""
        }`,
        pdfWidth / 2,
        pageHeight - 5,
        { align: "center" }
      );
    }

    pdf.save(`${title.replaceAll(" ", "_")}.pdf`);
  };

  const renderHeadingHTML = (h) => ({ __html: applyPlaceholders(h, placeholders, true) });
  const renderContentHTML = (c) => ({ __html: applyPlaceholders(c, placeholders, true) });

  /* ---------- UI ---------- */
  return (
    <div className="workspace">
      {/* LEFT PANEL */}
      <div className="editor-panel">
        <h1 className="main-title">AI HR Document Builder</h1>

        {/* Template Library */}
        <div className="form-row">
          <select
            value={templateType}
            onChange={(e) => setTemplateType(e.target.value)}
            style={{
              padding: "8px",
              borderRadius: "6px",
              border: "1px solid #ccc",
            }}
          >
            <option>Offer Letter</option>
            <option>Internship Letter</option>
            <option>Non-Disclosure Agreement</option>
            <option>Experience Certificate</option>
            <option>Promotion Letter</option>
          </select>

          <button className="btn-primary" onClick={loadTemplate}>
            📄 Load Template
          </button>

          <button className="btn-purple" onClick={generateTemplate}>
            ✨ Generate New with AI
          </button>
        </div>

        {/* Input form */}
        <div className="form-row">
          <input
            type="text"
            placeholder="Document Type"
            value={documentType}
            onChange={(e) => setDocumentType(e.target.value)}
          />
          <input
            type="text"
            placeholder="Tone"
            value={tone}
            onChange={(e) => setTone(e.target.value)}
          />
          <input
            type="text"
            placeholder="Company Name"
            value={companyName}
            onChange={(e) => setCompanyName(e.target.value)}
          />
        </div>

        <div className="action-row">
          <button className="btn-primary" onClick={generateTemplate}>
            Generate Template
          </button>
          <button
            className="btn-purple"
            onClick={fillEntireSectionsWithAI}
            disabled={sections.length === 0}
          >
            🤖 Fill Entire Sections with AI
          </button>
        </div>

        {/* Placeholder Section */}
        {placeholders.length > 0 && (
          <div className="placeholder-section">
            <div className="placeholder-header">
              <h2>Detected Placeholders</h2>
              <div className="placeholder-actions">
                <button className="btn-ai" onClick={fillPlaceholdersWithAI}>
                  🤖 Fill Placeholder Values with AI
                </button>
                <button className="btn-apply" onClick={applyValuesToDocument}>
                  ⤴ Apply Values to Document
                </button>
              </div>
            </div>

            {placeholders.map((ph, i) => (
              <div key={i} className="placeholder-row">
                <input type="text" value={ph.key} readOnly />
                <input
                  type="text"
                  placeholder={`Enter value for ${ph.key}`}
                  value={ph.value}
                  onChange={(e) => onChangePlaceholderValue(i, e.target.value)}
                />
              </div>
            ))}
          </div>
        )}

        {/* Section Editor */}
        {title && (
          <div className="editor">
            <h2 className="doc-title">{title}</h2>
            {sections.map((sec, i) => (
              <div key={i} className="section">
                <input
                  type="text"
                  className="section-heading"
                  value={sec.heading}
                  onChange={(e) => handleHeadingChange(i, e.target.value)}
                />
                <textarea
                  className="section-content"
                  value={sec.content}
                  onChange={(e) => handleContentChange(i, e.target.value)}
                />

                {/* AI Edit Buttons */}
                <div className="ai-actions">
                  <button onClick={() => improveSection(i)}>✏️ Improve with AI</button>
                  <button
                    onClick={() => improveSection(i, "friendly")}
                    style={{ backgroundColor: "#009688" }}
                  >
                    🗣️ Make More Friendly
                  </button>
                  <button
                    onClick={() => improveSection(i, "formal")}
                    style={{ backgroundColor: "#3f51b5" }}
                  >
                    📑 Make More Formal
                  </button>
                  <button className="btn-delete" onClick={() => removeSection(i)}>
                    Delete Section
                  </button>
                </div>
              </div>
            ))}
            <div className="row-right">
              <button className="btn-add" onClick={addSection}>
                + Add Section
              </button>
            </div>
          </div>
        )}

        {/* Signature Section */}
        <div className="signature-section">
          <h2>✍️ Add Digital Signature</h2>

          <input
            type="text"
            placeholder="Signer Name (e.g. HR Manager)"
            value={signerName}
            onChange={(e) => setSignerName(e.target.value)}
            style={{
              width: "100%",
              padding: "8px",
              marginBottom: "10px",
              border: "1px solid #ccc",
              borderRadius: "4px",
            }}
          />

          <SignatureCanvas
            ref={sigPad}
            penColor="black"
            canvasProps={{ width: 400, height: 150, className: "sigCanvas" }}
          />
          <div className="sig-buttons">
            <button onClick={clearSignature}>Clear</button>
            <button onClick={saveSignature}>Save Signature</button>
          </div>

          <p>or Upload a Signature Image:</p>
          <input type="file" accept="image/*" onChange={uploadSignature} />

          {signatureData && (
            <div className="signature-preview">
              <h4>Preview:</h4>
              <img src={signatureData} alt="Signature" width="200" />
              {signerName && (
                <p className="signer-info">
                  Signed by <b>{signerName}</b>
                  {signatureDate && ` on ${signatureDate}`}
                </p>
              )}
            </div>
          )}
        </div>

        {/* Export Buttons */}
        <div className="footer-btns">
          <button className="btn-success" onClick={generateDocx}>
            Download Word
          </button>
          <button className="btn-success" onClick={generatePDF}>
            Download PDF
          </button>
        </div>
      </div>

      {/* RIGHT PREVIEW */}
      <div className="preview-panel">
        <div className="preview-box">
          <h2 className="preview-title">{title || "Document Preview"}</h2>
          <p className="preview-company">{companyName}</p>
          {sections.map((sec, i) => (
            <div key={i} className="preview-section">
              <h3 dangerouslySetInnerHTML={renderHeadingHTML(sec.heading)}></h3>
              <p dangerouslySetInnerHTML={renderContentHTML(sec.content)}></p>
            </div>
          ))}

          {signatureData && (
            <div className="preview-signature">
              <img src={signatureData} alt="Signature" width="200" />
              <p className="signer-info">
                Signed by <b>{signerName || "Authorized Signatory"}</b>
                {signatureDate && ` on ${signatureDate}`}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};


export default App;
