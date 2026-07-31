const express = require('express');
const router = express.Router();
const { GoogleGenAI, Type } = require('@google/genai');

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build'
    }
  }
});

// POST /api/ai/generate-program
router.post('/generate-program', async (req, res) => {
  try {
    const { prompt, subject } = req.body;

    if (!prompt || !prompt.trim()) {
      return res.status(400).json({ error: 'Program topic or prompt is required.' });
    }

    const systemInstruction = `
You are an expert AI Programming Assistant for the ZipShare student platform.
Your task is to generate clean, high-performance, ready-to-run computer science solutions for student questions.

STRICT RULES:
1. Do NOT put any code comments (no //, no /* */, no # comments) inside the source code string. Keep the code strictly pure code.
2. Use standard language conventions and correct indentation.
3. Detect or choose the appropriate programming language based on the user prompt or subject (e.g. Python, Java, C, C++, JavaScript, SQL).
4. Provide realistic Sample Input and Sample Output for testing.
5. Provide accurate Time Complexity and Space Complexity.
6. If the request is not a programming/computer science question or is ambiguous/unsafe to answer, set "verified" to false.
`;

    const userPrompt = `Subject/Category: ${subject || 'General Programming'}\nStudent Request: ${prompt}`;

    const response = await ai.models.generateContent({
      model: 'gemini-3.6-flash',
      contents: userPrompt,
      config: {
        systemInstruction,
        temperature: 0.2,
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            verified: { type: Type.BOOLEAN, description: 'True if a verified solution was generated, false otherwise.' },
            title: { type: Type.STRING, description: 'Descriptive title of the program.' },
            language: { type: Type.STRING, description: 'Programming language name (python, java, c, cpp, javascript, sql).' },
            code: { type: Type.STRING, description: 'Clean executable code without comments and without markdown code block backticks.' },
            sampleInput: { type: Type.STRING, description: 'Sample input for testing.' },
            sampleOutput: { type: Type.STRING, description: 'Expected sample output.' },
            timeComplexity: { type: Type.STRING, description: 'Time complexity e.g. O(N log N).' },
            spaceComplexity: { type: Type.STRING, description: 'Space complexity e.g. O(N).' },
            explanation: { type: Type.STRING, description: 'Brief 1-2 sentence explanation of the solution approach.' }
          },
          required: ['verified', 'title', 'language', 'code', 'sampleInput', 'sampleOutput', 'timeComplexity', 'spaceComplexity']
        }
      }
    });

    const jsonText = response.text ? response.text.trim() : '{}';
    let result = {};
    try {
      result = JSON.parse(jsonText);
    } catch (e) {
      console.error('Failed to parse Gemini output:', jsonText);
      result = { verified: false };
    }

    if (!result.verified) {
      return res.json({
        verified: false,
        message: "I couldn't generate a verified solution."
      });
    }

    res.json(result);
  } catch (err) {
    console.error('AI Program Assistant error:', err.message);
    res.json({
      verified: false,
      message: "I couldn't generate a verified solution.",
      error: err.message
    });
  }
});

// POST /api/ai/explain-code - Code Explanation, Dry Run, Complexity & Optimization
router.post('/explain-code', async (req, res) => {
  try {
    const { code, language, fileName } = req.body;

    if (!code || !code.trim()) {
      return res.status(400).json({ error: 'Code content is required for explanation.' });
    }

    const systemInstruction = `
You are a senior computer science professor and AI tutor on ZipShare Student Hub.
Analyze the provided code and return a JSON object with:
1. explanation: Concise overview of what the program does and how it works step-by-step.
2. timeComplexity: Time complexity analysis (e.g. O(N log N)).
3. spaceComplexity: Space complexity analysis (e.g. O(1) or O(N)).
4. algorithm: Key algorithms or data structures used.
5. dryRun: Step-by-step dry run trace with sample variables.
6. optimizationTips: 1-2 practical performance or cleanliness suggestions.
`;

    const userPrompt = `Language: ${language || 'Auto'}\nFile Name: ${fileName || 'Program'}\n\nSource Code:\n${code.slice(0, 4000)}`;

    const response = await ai.models.generateContent({
      model: 'gemini-3.6-flash',
      contents: userPrompt,
      config: {
        systemInstruction,
        temperature: 0.2,
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            explanation: { type: Type.STRING },
            timeComplexity: { type: Type.STRING },
            spaceComplexity: { type: Type.STRING },
            algorithm: { type: Type.STRING },
            dryRun: { type: Type.STRING },
            optimizationTips: { type: Type.STRING }
          },
          required: ['explanation', 'timeComplexity', 'spaceComplexity', 'algorithm', 'dryRun', 'optimizationTips']
        }
      }
    });

    const jsonText = response.text ? response.text.trim() : '{}';
    const result = JSON.parse(jsonText);
    res.json({ success: true, ...result });
  } catch (err) {
    console.error('AI Explain error:', err.message);
    res.status(500).json({ error: 'Failed to generate explanation', details: err.message });
  }
});

module.exports = router;
