import express from "express";
import bodyParser from "body-parser";
import OpenAI from "openai";
import cors from "cors";

const app = express();
app.use(cors());
app.use(bodyParser.json());

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

app.post("/api/generate-template", async (req, res) => {
  const { documentType, tone, companyName } = req.body;

  const prompt = `
You are an HR document generator. 
Generate a professional template for a "${documentType}" in a ${tone} tone.
Use clearly numbered sections, placeholders (like {{employeeName}}, {{startDate}}), 
and ensure the structure matches a real HR document.

Respond in JSON format like this:
{
  "title": "Offer Letter",
  "sections": [
    {
      "heading": "1. Introduction",
      "content": "Dear {{employeeName}}, we are pleased to offer you the position of {{designation}} at {{companyName}}."
    },
    {
      "heading": "2. Compensation",
      "content": "Your starting salary will be {{salary}} per annum."
    },
    ...
  ]
}
`;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.7,
    });

    const jsonResponse = JSON.parse(response.choices[0].message.content);
    res.json(jsonResponse);
  } catch (error) {
    console.error(error);
    res.status(500).send("Failed to generate template");
  }
});

app.listen(5000, () => console.log("✅ Template Generator running on port 5000"));
