/**
 * gemini.ts — Shared Google Gemini wrapper.
 *
 * Provides a `chatCompletion()` helper whose signature mirrors
 * the OpenAI SDK pattern used across all services, so call-site
 * changes are minimal.
 */

import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } from '@google/generative-ai';

// ── Singleton client ──────────────────────────────────────────────────────────

let genAI: GoogleGenerativeAI | null = null;

function getClient(): GoogleGenerativeAI | null {
  if (genAI) return genAI;
  const key = process.env.GEMINI_API_KEY;
  if (!key) return null;
  genAI = new GoogleGenerativeAI(key);
  return genAI;
}

// ── Public helpers ────────────────────────────────────────────────────────────

export function isGeminiReady(): boolean {
  return Boolean(process.env.GEMINI_API_KEY);
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatOptions {
  model?: string;
  temperature?: number;
  maxOutputTokens?: number;
}

/**
 * Send a chat-style request to Gemini and return the text.
 *
 * Accepts the familiar `messages` array (system / user / assistant).
 * The system message is forwarded as `systemInstruction`.
 */
export async function chatCompletion(
  messages: ChatMessage[],
  opts: ChatOptions = {},
): Promise<string> {
  const client = getClient();
  if (!client) throw new Error('Gemini API key not configured');

  const {
    model = 'gemini-2.0-flash',
    temperature = 0.3,
    maxOutputTokens = 1024,
  } = opts;

  // Separate system from conversation
  const systemParts = messages.filter((m) => m.role === 'system').map((m) => m.content);
  const conversationMessages = messages.filter((m) => m.role !== 'system');

  const genModel = client.getGenerativeModel({
    model,
    systemInstruction: systemParts.length ? systemParts.join('\n\n') : undefined,
    generationConfig: {
      temperature,
      maxOutputTokens,
    },
    safetySettings: [
      { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
      { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
      { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
      { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
    ],
  });

  // Build Gemini content array from conversation
  const contents = conversationMessages.map((m) => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }],
  }));

  const result = await genModel.generateContent({ contents });
  const text = result.response.text();
  if (!text) throw new Error('Empty Gemini response');
  return text.trim();
}
