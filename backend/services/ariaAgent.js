"use strict";

const { env } = require("../config/env");
const { buildSystemPrompt } = require("./promptBuilder");
const { streamChat, generateJSON } = require("./llmProvider");
const { parseAllTags } = require("./tagParser");
const { executeUICommands } = require("./webcmdExecutor");
const { normalizeProfileUpdates } = require("./profileNormalize");
const { filterProfileByUserMessages, mergeHeuristicProfile } = require("./onboardingProfileGate");

async function handleAgentChatStream(req, res, body) {
  const { phase = "results", messages, profile, facilities, uiContext } = body;

  if (!Array.isArray(messages)) {
    return res.status(400).json({ error: "messages[] required" });
  }

  const systemPrompt = buildSystemPrompt({ phase, profile, facilities, uiContext });
  const temperature = phase === "onboarding" ? 0.25 : 0.35;

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders?.();

  try {
    let fullText = "";
    await streamChat({
      systemPrompt,
      messages,
      temperature,
      numPredict: phase === "onboarding" ? 400 : 450,
      onToken: (token) => {
        fullText += token;
        res.write(`data: ${JSON.stringify({ token })}\n\n`);
      },
    });

    const parsed = parseAllTags(fullText);

    if (phase === "onboarding") {
      let updates = mergeHeuristicProfile(messages, parsed.profileUpdates, profile || {});

      if (!updates.procedure && !updates.condition) {
        try {
          const extracted = await extractProfile(messages);
          updates = mergeHeuristicProfile(
            messages,
            { ...parsed.profileUpdates, ...extracted },
            profile || {}
          );
        } catch (err) {
          console.warn("[ariaAgent] extractProfile fallback:", err.message);
        }
      }

      parsed.profileUpdates = normalizeProfileUpdates(updates, profile || {});
    }

    // Push UI actions to webcmd bridge (polled by frontend) for agentic + split deploy stacks.
    if (env.WEBCMD_ENABLED && (parsed.actions?.length || parsed.navigations?.length)) {
      void executeUICommands({
        actions: parsed.actions,
        navigations: parsed.navigations,
      });
    }

    res.write(
      `data: ${JSON.stringify({
        done: true,
        fullText,
        clean: parsed.clean,
        actions: parsed.actions,
        profileUpdates: parsed.profileUpdates,
        navigations: parsed.navigations,
      })}\n\n`
    );
    res.end();
  } catch (err) {
    console.error("[ariaAgent]", err.message);
    if (!res.headersSent) {
      res.status(500).json({ error: err.message });
    } else {
      res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
      res.end();
    }
  }
}

async function extractProfile(messages) {
  const userOnly = (messages || []).filter((m) => m.role === "user");
  const prompt = `Extract patient profile from USER messages only as JSON. Use empty string for unknown fields. Use 0 for radiusMi if not stated.
{
  "condition": "",
  "procedure": "",
  "cptCode": "",
  "insurance": "",
  "city": "",
  "zipCode": "",
  "radiusMi": 0,
  "documentNames": [],
  "priorities": []
}
Rules: only include values the user explicitly said. Do NOT default radius to 25. Do NOT infer Aetna unless user said it.
Fix "atna"/"etna" → Aetna. Never put Aria/Arya in profile fields.
USER messages:
${JSON.stringify(userOnly)}`;
  return generateJSON(prompt);
}

async function analyseResults(facilities, userPreferences) {
  const prompt = `You are a healthcare price transparency guide. Return ONLY valid JSON (no markdown):
{
  "spokenScript": "2-3 sentence TTS script summarizing best options for the patient",
  "sections": [
    { "type": "insight", "title": "Short headline", "body": "1-2 sentences", "emphasis": "cost|distance|quality|speed|summary" },
    { "type": "facility_reveal", "facilityId": "n5", "reasons": ["reason1", "reason2"] }
  ],
  "layout": "cards_then_map",
  "uiActions": ["spotlight:n5", "show_card:n5", "tab:map"],
  "ranked": ["n5","n1","n2"],
  "recommendation": "n5",
  "reasoning": "One paragraph explanation",
  "savings": 590,
  "tags": { "n5": "Best Value" }
}
Use facility node ids (n1-n17) from the facilities data. Include 2-4 insight sections and 2-3 facility_reveal sections for top options.
User preferences: ${JSON.stringify(userPreferences ?? { priority: "cost" })}
Facilities: ${JSON.stringify(facilities)}`;
  return generateJSON(prompt);
}

module.exports = { handleAgentChatStream, extractProfile, analyseResults };
