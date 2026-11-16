const express = require('express');
const router = express.Router();
const { GoogleGenAI, Type } = require('@google/genai');

function getAIClient() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build'
      }
    }
  });
}

// POST /api/ai/generate-program
router.post('/generate-program', async (req, res) => {
  try {
    const { prompt, subject } = req.body;

    if (!prompt || !prompt.trim()) {
      return res.status(400).json({ error: 'Program topic or prompt is required.' });
    }

    const ai = getAIClient();
    if (!ai) {
      return res.json({
        verified: false,
        message: 'Gemini API key is not configured on the server. Please set GEMINI_API_KEY.'
      });
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
      model: 'gemini-3.8-flash',
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

    const ai = getAIClient();
    if (!ai) {
      return res.status(503).json({ error: 'Gemini API key is not configured on the server. Please set GEMINI_API_KEY.' });
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
      model: 'gemini-3.8-flash',
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

// POST /api/ai/chat - Multi-turn conversational chatbot with conversation history & roles
router.post('/chat', async (req, res) => {
  try {
    const { message, history = [], role = 'general', subject = 'general' } = req.body;

    if (!message || !message.trim()) {
      return res.status(400).json({ error: 'Message content is required.' });
    }

    const ai = getAIClient();
    if (!ai) {
      return res.json({
        reply: "Hello! I am ZipShare AI Student Assistant. To activate live Gemini neural intelligence, ensure GEMINI_API_KEY is configured in your server environment. In the meantime, you can explore all 145 official syllabus programs or compile code in the Online Playground!",
        role,
        roleTitle: 'Offline Student Assistant',
        offline: true
      });
    }

    // Role-to-model mapping as requested
    let modelName = 'gemini-3.8-flash';
    let roleTitle = '🎓 ZipShare Lab Mentor';
    let systemInstruction = `You are ZipShare AI — an expert academic computer science lab assistant and programming tutor for engineering university students.
You specialize in:
1. Database Management Systems (DBMS Lab B23CS2104: DDL, DML, Joins, Aggregations, Group By, Subqueries, PL/SQL, Cursors, Procedures, Triggers, Transactions).
2. Object-Oriented Programming via Java (classes, inheritance, polymorphism, exceptions, interfaces, threads, collections).
3. Python Programming Skill Enhancement (data types, loops, functions, lists, dicts, numpy/pandas, files).
4. Advanced Data Structures and Algorithms in C (AVL trees, BST, graphs, hashing, sorting, dynamic programming).

Guidelines:
- Explain code clearly with concise, production-ready syntax.
- Format code blocks using proper markdown syntax with language tags (e.g., \`\`\`sql, \`\`\`java, \`\`\`python, \`\`\`c).
- Maintain conversation history and refer back to previous context naturally across multiple turns.
- If the student asks for lab answers or exam practice, provide standard academic solutions with expected outputs.
- Be encouraging, clear, and pedagogically helpful.`;

    if (role === 'fast' || role === 'tutor') {
      modelName = 'gemini-3.1-flash-lite';
      roleTitle = '⚡ Fast Syntax Tutor';
      systemInstruction = `You are ZipShare Fast Tutor — a lightning-fast coding assistant. Give direct, rapid, concise answers and quick code fixes without unnecessary fluff. Ideal for rapid syntax checks, one-liner queries, and quick bug fixes.`;
    } else if (role === 'complex' || role === 'architect') {
      modelName = 'gemini-4-argon';
      roleTitle = '🧠 Deep Systems Architect';
      systemInstruction = `You are ZipShare Deep Systems Architect — specializing in deep algorithmic analysis, database query planner optimization, indexing strategies, time/space complexity proofs, and robust software architecture. Provide in-depth, rigorous explanations.`;
    }

    // Format history for Gemini SDK
    const formattedHistory = [];
    if (Array.isArray(history)) {
      for (const item of history) {
        if (item && item.role && item.text) {
          const geminiRole = item.role === 'user' ? 'user' : 'model';
          formattedHistory.push({
            role: geminiRole,
            parts: [{ text: String(item.text) }]
          });
        }
      }
    }

    let replyText = '';
    const candidateModels = [modelName];
    if (!candidateModels.includes('gemini-3.1-flash-lite')) candidateModels.push('gemini-3.1-flash-lite');
    if (!candidateModels.includes('gemini-3.8-flash')) candidateModels.push('gemini-3.8-flash');

    let usedModel = modelName;
    let lastError = null;

    for (const m of candidateModels) {
      try {
        const chat = ai.chats.create({
          model: m,
          config: {
            systemInstruction
          },
          history: formattedHistory
        });

        const result = await chat.sendMessage({
          message: message.trim()
        });

        if (result && result.text) {
          replyText = result.text;
          usedModel = m;
          break;
        }
      } catch (err) {
        lastError = err;
        console.warn(`Model ${m} call failed (${err.message}), trying next candidate...`);
      }
    }

    if (!replyText) {
      // Graceful academic fallback if Google Gemini services are temporarily unreachable
      replyText = `Hello! I am your ZipShare AI Lab Tutor.\n\nWhile Google AI servers are temporarily experiencing high traffic spikes, here is quick academic guidance for your query:\n- If you are working on **DBMS Lab (B23CS2104)**, check experiments 1–54 in the **Syllabus Matrix**.\n- You can test any SQL, Java, Python, or C code directly in the built-in **Online Compiler** (Judge0 CE).\n\nPlease try asking again in a few moments!`;
    }

    res.json({
      reply: replyText,
      model: usedModel,
      role: role,
      roleTitle: roleTitle
    });
  } catch (err) {
    console.error('Chat endpoint error:', err.message);
    res.status(500).json({
      error: 'Failed to process chat response',
      details: err.message
    });
  }
});

module.exports = router;
