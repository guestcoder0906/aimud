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
13. Use hide[text/json/secret] syntax for information not yet revealed to player
14. Use target(Player1, Player2)[Secret message] syntax for private narrative or NPC dialogue meant only for specific players. Both hide[] and target() can be used on EXACT file names (e.g. "target(Bob)[Secret Note].txt") OR inside the file content OR in the narrative response.
15. Update files dynamically and accurately
16. NEVER forget to create/update files for NPCs, items, locations, or any entities.
17. The game starts by generating the world. THEN, players will provide character descriptions. You MUST create their character files using EXACTLY this name format: "CharacterName-USERNAME.txt" (e.g., if USERNAME is Bob and his character is an elf named Legolas, the file MUST be "Legolas-Bob.txt").

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
- IMPORTANT MINIMIZATION RULE: ONLY include files in the 'files' object if they are NEW, MODIFIED, or DELETED. If a file is completely unchanged, DO NOT include it in the response at all (it will persist automatically). NEVER use null to mean 'no change' (null means DELETE). NEVER truncate file content with ellipses (...).

LOOSE REFERENCE RULE (CRITICAL):
- Make a file for each thing even if it is only loosely referenced (e.g., a professor or a home mentioned in passing), IF the player themselves could possibly interact with it, know it, or will know it in the future/past/present.
- Do NOT make a file for universally known or unreachable loose concepts that the player won't interact with directly (e.g., a college student hearing about the "moon" in a conversation wouldn't trigger a file for the moon).
- For loosely referenced things, the file doesn't need to show full details initially—only whatever details were loosely mentioned—unless full detail is later needed or it becomes no longer loosely referenced.

CRITICAL FILE MANAGEMENT RULES:
- Create a "Guide.txt" file that references these instructions and acts as the internal operating manual
- Create "WorldRules.txt" defining physics, magic, tech, logic, time costs, and encumbrance effects
- Create "CurrentMap.json" to track the live map of the player's current location (50-200 meter scale). MUST be valid JSON.
  * Update this file accurately in real-time based on context, location, dimensions, and speed.
  * Structure: \`{ "pages": [ { "name": "Region/Area Name", "scale": "50m", "areas": [{ "id": "a1", "name": "Room Name", "type": "room|hallway|field|forest|water|building|furniture|npc|obstacle|vehicle", "shape": "rect|circle|polygon", "x": 0, "y": 0, "width": 10, "height": 10, "radius": 5, "points": "0,0 10,10 0,10", "visible": true}], "players": [{ "username": "PlayerName", "x": 5, "y": 5, "facing": 0, "vision": { "mainAngle": 66, "peripheralAngle": 90, "detailedRange": 20, "maxRange": 50} }] } ] }\`
  * Map Pages Rule: If all active players are in the same general region, generate a single page in the "pages" array. If players are geographically far apart (e.g. different towns, deep dungeon vs surface), separate them into multiple distinct pages within the "pages" array to prevent extreme zooming/scaling issues.
  * \`visible\`: false means it's greyed out (fog of war) because the player remembers it but can't currently see it.
  * Completely unknown/unseen elements MUST be omitted from the map entirely, unless detected by other senses (magic, hearing, echolocation).
  * Ensure correct geometry and scale for all elements using \`shape\`, \`width\`, \`height\`, \`radius\`, or \`points\`.
  * \`facing\`: angle in degrees (0 is right, 90 is down, 180 is left, 270 is up).
  * \`vision\`: contains the player's dynamic vision capabilities.
  * Include all player-visible elements within the scale (npcs, furniture, buildings, vehicles, etc.).
  * You MUST show ALL active players on the map in the 'players' array of the appropriate map page (e.g. { "username": "Alice", "x": 10, "y": 20, ... }).
  * You MUST show all visible, sensed, or last known NPC locations on the map in the 'areas' array (type: 'npc').
  * You MUST provide correct physical dimensions for NPCs using width/height or radius corresponding exactly to the size in their files.
  * Use hide[Secret Room] or target(PlayerName)[Secret Room] for area names if they are hidden or only known to specific players.
  * Ensure scaling and coordinates are consistent.
- Create character files named "CharacterName-USERNAME.txt" for each player with DYNAMIC attributes specific to their character (health, energy, inventory, knowledge, etc.). MUST include explicit physical details: size, dimensions, weight, and base speed stats (walking, flying, trotting, running, etc. affected by context/effects).
- CRITICAL: If a player's health reaches 0 or they die, DELETE their character file immediately by setting it to null in the files object.
- Create "WorldTime.txt" with ACTUAL date/time/year appropriate for the world setting
- Create files for EVERY entity that appears: NPCs, items, locations, vehicles, projectiles. MUST include explicit physical details for entities/items: size, dimensions, weight, and base speed stats if capable of movement (e.g., cars, paper airplanes).
- Use hide[...] for secrets/traps/hidden info in file contents OR file names. This is hidden from player view.
- Use target(PlayerName)[content] in file contents OR file names OR narrative to restrict visibility strictly to specific players.
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
    const storedKey = typeof window !== 'undefined' ? localStorage.getItem('aimud_apikey') : null;
    this.ai = new GoogleGenAI({ apiKey: process.env.API_KEY || storedKey || '' });
  }

  private taskQueue: Promise<any> = Promise.resolve();

  async initialize(startingPrompt: string, username?: string): Promise<AIResponse | null> {
    return new Promise((resolve) => {
      this.taskQueue = this.taskQueue.then(async () => {
        try {
          const charRequirement = username
            ? `CRITICAL: You MUST also create a highly detailed, extensive character file for player "${username}" during this initialization. If the prompt doesn't specify their character traits, generate a highly-varied random character (class, appearance, background, name) that fits the starting context. The file MUST be named EXACTLY "CharacterName-${username}.txt" (e.g. "Legolas-${username}.txt").`
            : "CRITICAL: DO NOT create any player character files during this initialization phase. Players will provide their character descriptions separately later. You MUST NOT return any file named with \"CharacterName-USERNAME.txt\" format during this world generation phase. Wait for the explicit character prompt next.";

          const prompt = `Initialize world: ${startingPrompt}\n\nRemember: NO DICE NOTATION. Create highly detailed, extensive, and long files for the starting world (CurrentMap.json, WorldRules.txt, Guide.txt, WorldTime.txt, and any initial locations/NPCs). ${charRequirement} Ensure all stats use the new dynamic probability engine modifier format (e.g., "agility: base probability engine + 5%(1000) + effects") and armor uses thresholds.`;
          const res = await this.handleRequest(prompt);
          resolve(res);
        } catch (e) {
          console.error("Initialization failed", e);
          resolve({ narrative: "System initialization failed. Please check API Key." });
        }
      });
    });
  }

  async processAction(action: string, username?: string): Promise<AIResponse | null> {
    return new Promise((resolve) => {
      this.taskQueue = this.taskQueue.then(async () => {
        try {
          const files = this.fs.getAll();
          const context = Object.entries(files)
            .map(([name, content]) => `=== ${name} ===\n${content}`)
            .join('\n\n');

          const userHeader = username ? `[Player: ${username}]\n` : '';
          const prompt = `Current files:\n${context}\n\n${userHeader}Player action: ${action}\n\nProcess this action. If it requires probability engine calculations (success/failure/damage multiplier), return "checks". If not, return "narrative" and updates. Remember: NO DICE NOTATION. Make all file updates extremely detailed and long. Ensure all stats use the new dynamic probability engine modifier format (e.g., "agility: base probability engine + 5%(1000) + effects") and armor uses thresholds. ${username ? `CRITICAL: If a character file for "${username}" does not exist in the current files, you MUST create it immediately as part of this response.` : ''}`;

          const res = await this.handleRequest(prompt);
          resolve(res);
        } catch (e) {
          console.error("Processing failed", e);
          resolve({ narrative: "Error processing action." });
        }
      });
    });
  }

  private async handleRequest(userPrompt: string): Promise<AIResponse | null> {
    // Phase 1: Analyze/Execute
    let responseText = await this.callAI(userPrompt);
    let data: AIResponse;

    try {
      data = this.extractJSON(responseText);
    } catch (e) {
      console.error("JSON extraction/parse Error", e, responseText);
      return { narrative: "System Error: AI returned invalid JSON format." };
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
        data = this.extractJSON(responseText);
      } catch (e) {
        console.error("JSON Parse Error Phase 2", e);
        return { narrative: "Error processing check results." };
      }
    }

    this.processResponseData(data);
    return data;
  }

  private extractJSON(text: string): any {
    // 1. Direct parse attempt
    try {
      return JSON.parse(text);
    } catch (e) { }

    // 2. Locate the first { and try to find the balancing }
    let start = text.indexOf('{');
    if (start === -1) throw new Error("No JSON object found");

    // Try to find the matching closing brace
    let braceCount = 0;
    let end = -1;
    for (let i = start; i < text.length; i++) {
      if (text[i] === '{') braceCount++;
      else if (text[i] === '}') {
        braceCount--;
        if (braceCount === 0) {
          end = i;
          break;
        }
      }
    }

    if (end !== -1) {
      const candidate = text.substring(start, end + 1);
      try {
        return JSON.parse(candidate);
      } catch (e) { }
    }

    // 3. Fallback to markdown blocks if present
    const mdMatch = text.match(/```json([\s\S]*?)```/);
    if (mdMatch) {
      try {
        return JSON.parse(mdMatch[1]);
      } catch (e) { }
    }

    // 4. Last ditch: greedy match
    const greedyMatch = text.match(/\{[\s\S]*\}/);
    if (greedyMatch) {
      try {
        return JSON.parse(greedyMatch[0]);
      } catch (e) { }
    }

    throw new Error("Failed to extract valid JSON");
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
          const contentStr = typeof fileData.content === 'object' ? JSON.stringify(fileData.content) : fileData.content;
          this.fs.write(filename, contentStr, fileData.displayName);
        }
      }
    }
  }

  private async callAI(prompt: string): Promise<string> {
    try {
      const response = await this.ai.models.generateContent({
        model: 'gemini-3.1-flash-lite-preview',
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