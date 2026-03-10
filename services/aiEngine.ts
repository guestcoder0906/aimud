import { GoogleGenAI } from "@google/genai";
import { FileSystem } from "./fileSystem";
import { AIResponse, CheckDef } from "../types";

const SYSTEM_PROMPT = `You are the backend engine for an AI-SUD system. Your role is to:

1. Create and manage text files as the source of truth
2. Generate world content on-demand based on player perception
3. Verify actions against World Rules and Player stats
4. Calculate time costs and update global time
5. Manage status effects with expiration timestamps
6. Track unique object instances
7. Use hide[...] syntax for information not yet revealed to player
8. Use target(Player1, Player2)[Secret message] syntax for private narrative or NPC dialogue meant only for specific players.
9. Update files dynamically and accurately
10. NEVER forget to create/update files for NPCs, items, locations, or any entities that appear

GROUP ENTITY RULE:
- If there are multiple of the same type of creature/NPC (e.g., 3 Goblins), do NOT create separate files for each.
- Create a single file (e.g., "Goblins.txt" or "Bandits.txt") that acts as a shared character sheet.
- Inside this shared file, explicitly list the individuals, their specific names/identifiers (e.g., Goblin A, Goblin B), their current individual statuses (health, conditions), and any variations in stats.
- Track exactly how many there are and update this shared file when individuals are damaged, killed, or change state.

NO DICE RULE (CRITICAL):
- NEVER use dice notation (e.g., 1d6, 2d20, 1d10+5).
- ALL calculations (damage, healing, success rates) must be dynamically calculated based on context, base stats, and the probability engine.
- Example: Instead of "Damage: 1d6 Bludgeoning", use "Base Damage: 20 Bludgeoning (Final damage = Base x probability engine %)".
- Use the "checks" array to request a probability engine roll (0-1000) when an uncertain action occurs, and use the result to calculate the exact dynamic outcome.

DYNAMIC STATS RULE (CRITICAL):
- Stats must NOT be stale numbers (e.g., "Agility: 25").
- Stats must be represented as modifiers to the base probability engine (0-1000) and include dynamic context and effects.
- Example format for stats:
  * agility: base probability engine + 5%(1000) + effects
  * perception: base probability engine + 10%(1000) + effects
  * charisma: base probability engine - 5%(1000) + effects
- Armor must be represented with a base threshold and specific damage type immunities below that threshold.
  * Example: armor: leather base armor 15 (damage less than 15 that is Bludgeoning, Force, Piercing, and Slashing won't effect because of the protection unless other effects/context apply)
- ADVANTAGE/DISADVANTAGE: 1 disadvantage modifier effect exactly cancels out 1 advantage modifier effect.

FILE DETAIL RULE (CRITICAL):
- ALL files (character files, locations, items, WorldRules, etc.) MUST be highly detailed, extensive, specific, and accurate. 
- Do not write vague or short descriptions. Include deep lore, precise physical dimensions, exact quantitative stats, psychological profiles for NPCs, and exhaustive inventory lists.
- You MUST explicitly include the physical size, dimensions, and weight for EVERY character, creature, NPC, and item in their respective files.
- Make the files long and comprehensive.

CRITICAL FILE MANAGEMENT RULES:
- Create a "Guide.txt" file that references these instructions and acts as the internal operating manual
- Create "WorldRules.txt" defining physics, magic, tech, logic, time costs, and encumbrance effects
- Create character files named "character-USERNAME.txt" for each player with DYNAMIC attributes specific to their character (health, energy, inventory, knowledge, etc.). MUST include explicit physical details: size, dimensions, and weight.
- If a player's health reaches 0, DELETE their character file.
- Create "WorldTime.txt" with ACTUAL date/time/year appropriate for the world setting
- Create files for EVERY entity that appears: NPCs, items, locations. MUST include explicit physical details for entities/items: size, dimensions, and weight.
- Use hide[...] for secrets/traps/hidden info in files - this content is completely hidden from player view
- Use target(PlayerName)[content] in files or narrative to restrict visibility to specific players.
- Track unique instances: [ObjectType_ID(status)]
- Status effects: [Status:Type_ID(Expires: TIME)]

FILE REFERENCE SYNTAX:
Use [DisplayName] or [FileName] in narrative text - these become clickable links to files
Examples: [character-John], [King's Guard], [Iron Sword], [Old Church]

TIME SYSTEM:
- WorldTime.txt contains the CURRENT time/date/year, not elapsed time
- Calculate action duration and ADD to current time
- Update WorldTime.txt with new current time after each action
- Check and expire status effects against current time

UPDATE VALUES:
- Health changes: negative for damage, positive for healing
- Energy: negative when spent, positive for restored
- Time: always show the time cost in seconds (e.g., "+30s" for 30 second action)
- Inventory: "+1" when adding, "-1" when removing

CRITICAL: Before EVERY action, check:
1. Does this entity have a file? If not, CREATE it immediately
2. Are the character files accurate for this specific character type?
3. Are status effects expired based on current WorldTime?
4. Does this action respect WorldRules physics/magic/tech?
5. Does player have required stats/items/energy?

RESPONSE FORMAT:
Respond with JSON only:
{
  "narrative": "Story text with [DisplayName] references for all entities/items/locations. Use target(PlayerName)[secret text] for private messages.",
  "updates": [
    {"type": "stat", "text": "Health -10", "value": -10},
    {"type": "item", "text": "Added Iron Key", "value": 1},
    {"type": "time", "text": "+30s", "value": 30}
  ],
  "files": {
    "filename.txt": {"content": "file content with hide[secrets] or target(PlayerName)[private info]", "displayName": "Display Name"},
    "dead_player.txt": null
  },
  "gameOver": false,
  "checks": [],
  "recommendations": ["Action recommendation 1", "Action recommendation 2", "Action recommendation 3"]
}

If probability checks are required, return empty narrative and fill the "checks" array.
Set gameOver to true ONLY when player health/critical stat reaches 0.
Always include 1-3 dynamic auto ai action recommendations for the player based on context so far in the "recommendations" array.
For starting prompt, create initial world files with appropriate time/year and set the scene.`;

export class AIEngine {
  private fs: FileSystem;
  private ai: GoogleGenAI;

  constructor(fileSystem: FileSystem) {
    this.fs = fileSystem;
    this.ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });
  }

  async initialize(startingPrompt: string): Promise<AIResponse | null> {
    try {
      const prompt = `Initialize world: ${startingPrompt}\n\nRemember: NO DICE NOTATION. Create highly detailed, extensive, and long files for the starting world, rules, and guide. Ensure all stats use the new dynamic probability engine modifier format (e.g., "agility: base probability engine + 5%(1000) + effects") and armor uses thresholds.`;
      return await this.handleRequest(prompt);
    } catch (e) {
      console.error("Initialization failed", e);
      return { narrative: "System initialization failed. Please check API Key." };
    }
  }

  async processAction(action: string): Promise<AIResponse | null> {
    try {
      const files = this.fs.getAll();
      const context = Object.entries(files)
        .map(([name, content]) => `=== ${name} ===\n${content}`)
        .join('\n\n');

      const prompt = `Current files:\n${context}\n\nPlayer action: ${action}\n\nProcess this action. If it requires probability engine calculations (success/failure/damage multiplier), return "checks". If not, return "narrative" and updates. Remember: NO DICE NOTATION. Make all file updates extremely detailed and long. Ensure all stats use the new dynamic probability engine modifier format (e.g., "agility: base probability engine + 5%(1000) + effects") and armor uses thresholds.`;

      return await this.handleRequest(prompt);
    } catch (e) {
      console.error("Processing failed", e);
      return { narrative: "Error processing action." };
    }
  }

  private async handleRequest(userPrompt: string): Promise<AIResponse | null> {
    // Phase 1: Analyze/Execute
    let responseText = await this.callAI(userPrompt);
    let data: AIResponse;

    try {
      data = JSON.parse(responseText);
    } catch (e) {
      console.error("JSON Parse Error", e, responseText);
      // Attempt to clean markdown json blocks if present
      const match = responseText.match(/```json([\s\S]*?)```/);
      if (match) {
        try {
          data = JSON.parse(match[1]);
        } catch (e2) {
           return { narrative: "System Error: AI returned invalid JSON." };
        }
      } else {
        return { narrative: "System Error: AI returned invalid format." };
      }
    }

    // Phase 2: If checks are required
    if (data.checks && Array.isArray(data.checks) && data.checks.length > 0) {
      const results = data.checks.map(check => {
        const roll = Math.floor(Math.random() * 1001);
        const outcome = this.determineOutcome(roll, check.thresholds);
        return {
          name: check.name,
          description: check.description,
          outcome: outcome,
          roll: roll,
          thresholds: check.thresholds
        };
      });

      const resultReport = results.map(r => 
        `Check: ${r.name}\nReason: ${r.description}\nRoll: ${r.roll} / 1000\nThresholds: ${JSON.stringify(r.thresholds)}\nRESULT: ${r.outcome}`
      ).join('\n\n');

      const followUpPrompt = `PREVIOUS CONTEXT: ${userPrompt}\n\n[SYSTEM: Probability Engine Results]\n\n${resultReport}\n\nBased on these FAIR and FINAL results, generate the highly detailed narrative and extensive file updates. Calculate exact dynamic outcomes (e.g., damage = base * probability result) WITHOUT using dice notation. Include the Check Name and Result (e.g. "[Jump: Failure]") in the narrative, but do NOT state the raw roll numbers.`;

      // We make a fresh call with the context combined, as we don't maintain a full chat history object here 
      // (The FS is the history source of truth).
      responseText = await this.callAI(followUpPrompt);
      try {
        const match = responseText.match(/```json([\s\S]*?)```/);
        data = match ? JSON.parse(match[1]) : JSON.parse(responseText);
      } catch (e) {
        console.error("JSON Parse Error Phase 2", e);
        return { narrative: "Error processing check results." };
      }
    }

    this.processResponseData(data);
    return data;
  }

  private determineOutcome(roll: number, thresholds: { [outcome: string]: number }): string {
    if (!thresholds || typeof thresholds !== 'object') {
      return roll >= 500 ? "Success" : "Failure";
    }
    
    const sorted = Object.entries(thresholds)
      .sort(([, valA], [, valB]) => valB - valA);
    
    for (const [outcome, minVal] of sorted) {
      if (roll >= minVal) return outcome;
    }
    return "Failure";
  }

  private processResponseData(data: AIResponse) {
    if (!data) return;
    
    if (data.files && typeof data.files === 'object' && !Array.isArray(data.files)) {
      for (const [filename, fileData] of Object.entries(data.files)) {
        if (fileData === null || (typeof fileData === 'object' && fileData.content === null)) {
          this.fs.delete(filename);
        } else if (typeof fileData === 'string') {
          this.fs.write(filename, fileData);
        } else if (fileData && typeof fileData === 'object' && fileData.content) {
          this.fs.write(filename, fileData.content, fileData.displayName);
        }
      }
    }
  }

  private async callAI(prompt: string): Promise<string> {
    try {
      const response = await this.ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: prompt,
        config: {
          systemInstruction: SYSTEM_PROMPT,
          responseMimeType: 'application/json',
          temperature: 0.7,
        }
      });

      return response.text || "{}";
    } catch (e) {
      console.error("Gemini API Call Failed", e);
      throw e;
    }
  }
}