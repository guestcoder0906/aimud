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

STAT PERSISTENCE RULE (CRITICAL):
- The files are the ONLY persistent memory. Any change mentioned in the narrative or 'updates' array MUST be reflected in the updated content of the relevant file.
- If a player takes damage, you MUST include the updated "CharacterName-USERNAME.txt" file in your 'files' response object.
- If an NPC is wounded, you MUST update their file (or the shared group file).
- NEVER assume the system will "remember" a stat change unless it is written into a file.

ENTITY FILE SCHEMA:
All character/NPC/Entity files MUST follow this structured format for consistency:
---
[NAME & DESCRIPTION]
- Full Name: ...
- Description: (Extensive, detailed physical & psychological profile)
- Physical Dimensions: (Size, Height, Weight, Wingspan, etc.)

[STATS & MODIFIERS]
- Health: (Current / Max)
- Energy/Mana/Stamina: (Current / Max)
- Speed: (Walking: Xm/s, Running: Ym/s, etc.)
- Primary Attributes: (Use the probability engine modifier format: "stat: base probability engine + X%(1000) + effects")
- Armor: (Threshold format: "armor: material base X (immunities/resistances)")

[INVENTORY & EQUIPMENT]
- Items: (Detailed list with weights/dimensions)
- Equipped: (What is currently being used)

[STATUS EFFECTS & LORE]
- Effects: (List with expiration timestamps: [Status:Type_ID(Expires: TIMESTAMP)])
- Background/Biometrics: (Deep lore, unique traits)
---

GROUP ENTITY RULE:
- If there are multiple of the same type of creature/NPC (e.g., 3 Goblins), do NOT create separate files for each.
- Create a single file (e.g., "Goblins.txt" or "Bandits.txt") that acts as a shared character sheet.
- Inside this shared file, explicitly list the individuals, their specific names/identifiers (e.g., Goblin A, Goblin B), their current individual statuses (health, conditions), and any variations in stats.
- Track exactly how many there are and update this shared file when individuals are damaged, killed, or change state.

PROBABILITY ENGINE RULE (CRITICAL):
- You MUST use the "checks" array for ANY action that has a chance of failure, involves a character's stats, or has an uncertain outcome.
- NEVER decide the outcome of an uncertain action yourself in the narrative. ALWAYS request a check from the probability engine (0-1000).
- Actions that REQUIRE a check:
  * Combat (Attacking, defending, dodging, using abilities)
  * Stealth and Detection
  * Social manipulation (Persuasion, Intimidation, Deception)
  * Physical feats (Climbing, jumping, lifting, swimming)
  * Magic or Technical operations with risk
  * Resistance against effects or toxins
- If an action should be modified by stats (e.g., Agility, Strength), you MUST define thresholds in the "checks" object that reflect those stats.
- If you return "checks", your "narrative" field MUST be an empty string. You will generate the narrative in the next step once the results are provided.

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
- Create a "Guide.txt" file that acts as your internal operating manual. It MUST track the current status of all major quests, active plot hooks, and include a MASTER STAT TABLE of all known characters and NPCs (Name, Health, Energy, Location, Primary Goal) for quick reference.
- Create "WorldRules.txt" defining physics, magic, tech, logic, time costs, and encumbrance effects.
- Create "CurrentMap.json" to track the live map of the player's current location (50-200 meter scale). MUST be valid JSON.
  * Update this file accurately in real-time based on context, location, dimensions, and speed.
  * Structure: \`{ "pages": [{ "name": "Region/Area Name", "scale": "50m", "areas": [{ "id": "a1", "name": "Room Name", "type": "room|hallway|field|forest|water|building|furniture|npc|obstacle|vehicle|fire|lava|poison|treasure|tech|magic|nature|portal|terminal|hazard", "shape": "rect|circle|polygon", "x": 0, "y": 0, "width": 10, "height": 10, "radius": 5, "points": "0,0 10,10 0,10", "visible": true}], "players": [{ "username": "PlayerName", "x": 5, "y": 5, "facing": 0, "vision": { "mainAngle": 66, "peripheralAngle": 90, "detailedRange": 20, "maxRange": 50} }], "notes": [{ "x": 10, "y": 10, "text": "Fire", "type": "danger|info|warning|discovery"}] }] }\`
  * Map Pages Rule: If all active players are in the same general region, generate a single page in the "pages" array. If players are geographically far apart (e.g. different towns, deep dungeon vs surface), separate them into multiple distinct pages within the "pages" array.
  * \`notes\`: Use for dynamic annotations like "Fire", "Toxic Gas", "Discovery", "Clue", "Exit", etc. for specific coordinates.
  * \`visible\`: false means it's greyed out (fog of war).
  * Completely unknown/unseen elements MUST be omitted from the map entirely.
  * Ensure correct geometry and scale for all elements using \`shape\`, \`width\`, \`height\`, \`radius\`, or \`points\`.
  * \`facing\`: angle in degrees (0 is right, 90 is down, 180 is left, 270 is up).
  * \`vision\`: contains the player's dynamic vision capabilities.
  * Include all player-visible elements within the scale (npcs, furniture, buildings, vehicles, hazards, etc.).
  * You MUST show ALL active players on the map in the 'players' array.
  * You MUST show all visible, sensed, or last known NPC locations on the map in the 'areas' array (type: 'npc').
  * CRITICAL: Make the map highly detailed. Add small details like furniture, individual trees, hazards, or ground texture as separate areas or via the \`notes\` array. Use \`notes\` for anything that isn't a physical structure but is an important environmental effect (e.g., "Heavy Fire", "Poison Gas", "Strange Energy", "Digital Glitch").
  * Use \`type: tech/terminal\` for cyberpunk/sci-fi elements.
  * Use \`type: magic/portal\` for fantasy/supernatural elements.
  * Use \`type: nature/hazard\` for environmental obstacles.
  * Use \`type: treasure/loot\` for items or points of interest.
  * Use hide[Secret Room] or target(PlayerName)[Secret Room] for area names if they are forgotten, hidden or only known to specific players.
  * Ensure scaling and coordinates are consistent.
- Create character files named "CharacterName-USERNAME.txt" for each player using the ENTITY FILE SCHEMA.
- CRITICAL: If a player's health reaches 0 or they die, DELETE their character file immediately by setting it to null in the files object.
- Create "WorldTime.txt" with ACTUAL date/time/year appropriate for the world setting.
- Create files for EVERY entity that appears: NPCs, items, locations, vehicles, projectiles. MUST follow ENTITY FILE SCHEMA.
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
2. Are the character files accurate (Health, Energy, Inventory)? You MUST update files if stats change.
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

          const prompt = `Initialize world: ${startingPrompt}\n\nRemember: PROBABILITY ENGINE RULE (CRITICAL). Create highly detailed, extensive, and long files for the starting world (CurrentMap.json, WorldRules.txt, Guide.txt, WorldTime.txt, and any initial locations/NPCs). ${charRequirement} Ensure all stats use the new dynamic probability engine modifier format (e.g., "agility: base probability engine + 5%(1000) + effects") and armor uses thresholds. If the initialization involves any uncertain event, return "checks".`;
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

          // Separate character files from other files for better focus
          const charFiles = Object.entries(files).filter(([name]) => name.includes(`-${username}`) || name.toLowerCase().startsWith('character'));
          const otherFiles = Object.entries(files).filter(([name]) => !charFiles.find(([cn]) => cn === name));

          const formatFileSet = (fileEntries: [string, string][]) =>
            fileEntries.map(([name, content]) => `=== ${name} ===\n${content}`).join('\n\n');

          const charContext = charFiles.length > 0 ? `ACTIVE CHARACTER FILES:\n${formatFileSet(charFiles)}\n\n` : '';
          const worldContext = `WORLD FILES:\n${formatFileSet(otherFiles)}`;

          const userHeader = username ? `[Player: ${username}]\n` : '';
          const prompt = `Current Files Summary:\n${charContext}${worldContext}\n\n${userHeader}Player action: ${action}\n\nProcess this action.
          
CRITICAL REMINDER: 
1. If the player's action causes ANY change to their stats (Health, Energy, Inventory), you MUST include the updated character file content in your 'files' response.
2. If NPCs or entities are modified, their files MUST be updated.
3. The files listed above are your ONLY source of truth. Do not invent stats that contradict the files.
4. PROBABILITY ENGINE RULE: If the action is uncertain, has a chance of failure, or involves stats/skills, return "checks" and an empty narrative.
5. Ensure all stats use the new dynamic probability engine modifier format.
${username ? `6. If a character file for "${username}" does not exist, you MUST create it immediately as part of this response following the ENTITY FILE SCHEMA.` : ''}`;

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

  private sanitizeJSON(raw: string): string {
    let result = '';
    let inString = false;
    let escape = false;
    for (let i = 0; i < raw.length; i++) {
      const char = raw[i];
      if (inString) {
        if (escape) {
          result += char;
          escape = false;
        } else if (char === '\\') {
          result += char;
          escape = true;
        } else if (char === '"') {
          result += char;
          inString = false;
        } else if (char === '\n') {
          result += '\\n';
        } else if (char === '\r') {
          result += '\\r';
        } else if (char === '\t') {
          result += '\\t';
        } else {
          result += char;
        }
      } else {
        if (char === '"') {
          result += char;
          inString = true;
        } else {
          result += char;
        }
      }
    }
    return result;
  }

  private extractJSON(text: string): any {
    // 1. Direct parse attempt
    try {
      return JSON.parse(text);
    } catch (e) { }

    // 2. Clear Markdown blocks if present and sanitize
    const mdMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (mdMatch) {
      try {
        return JSON.parse(this.sanitizeJSON(mdMatch[1]));
      } catch (e) { }
    }

    // 3. Fallback: Greedy match over the whole text, then sanitize unescaped newlines
    const greedyMatch = text.match(/\{[\s\S]*\}/);
    if (greedyMatch) {
      try {
        return JSON.parse(this.sanitizeJSON(greedyMatch[0]));
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