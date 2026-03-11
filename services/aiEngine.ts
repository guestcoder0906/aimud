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

[ABILITIES & MAGIC]
- List EVERY ability, spell, or special power this specific entity has.
- Each ability MUST include: Name, Energy Cost, Range, Duration, Cooldown, Weight/Size Limit, Elemental Type, and explicit Limitations.
- Example: "Firebolt: Cost 15 Mana. Range 30m. Deals 20-35 fire damage. Cooldown 5s. Cannot penetrate water barriers. Cannot target objects heavier than 200 lbs."
- If this entity has NO magic or special abilities, write "None".
- CRITICAL: Character-specific abilities belong ONLY in this character's file. Do NOT put them in WorldRules.txt or other files.

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
- MAGIC & ABILITIES PLACEMENT RULE (CRITICAL):
  * Character-specific magic, spells, abilities, and powers MUST be written ONLY inside that character's own file under [ABILITIES & MAGIC].
  * WorldRules.txt should ONLY contain world-wide magic laws (e.g., "magic doesn't work in anti-magic zones", "all fire spells are 20% weaker in rain"). It must NOT list individual character spells.
  * NPC abilities go in the NPC's file. Item enchantments go in the item's file.
  * NEVER scatter a character's abilities across multiple files. Keep them consolidated in ONE place: the owner's file.
  * NEVER use vague terms like "can do magic" or "has magical abilities". Every single ability must have: exact Name, Energy Cost, Range, Duration, Cooldown, Weight/Size Limits, Elemental Type, and explicit Limitations (what it CANNOT do).
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

SPATIAL CONSISTENCY RULE (CRITICAL):
- The 'scale' property in CurrentMap.json defines the real-world size of the map viewport (e.g., "50m" means the map represents a 50-meter area). All coordinates in CurrentMap.json are in METERS relative to this scale.
- ALL ranges, distances, and dimensions MUST be consistent across character files and CurrentMap.json:
  * If a spell has "Range 30m", the caster and target MUST be within 30 coordinate units of each other on the map.
  * If a character has "Speed: Walking 1.5m/s" and 10 seconds pass, they move AT MOST 15 coordinate units on the map.
  * If an area-of-effect ability has "Radius 10m", the corresponding map area MUST have radius=10 or width/height=20.
  * If a character has "Melee range: 2m", targets MUST be within 2 coordinate units.

MANDATORY MOVEMENT & MAP UPDATE RULE (CRITICAL):
- CurrentMap.json MUST be updated in EVERY response. Any player action implies a physical state change — at minimum, update the player's facing direction.
- Physical proximity is required for interaction. Before resolving any action (attack, talk, pick up, open, use, examine, etc.), verify the player is within interaction range of the target using the SPATIAL CONTEXT distances provided.
- AUTO-APPROACH: If a player is out of range for their intended action:
  1. Compute max traversable distance: walking_speed (from character file) × action_time_cost (seconds).
  2. Move the player along the direct vector toward the target by that distance, or stop at interaction range if closer.
  3. New coordinates: newX = oldX + (targetX - oldX) × (moveDist / totalDist), newY = oldY + (targetY - oldY) × (moveDist / totalDist).
  4. If now in range → action succeeds; narrate the approach and the action together.
  5. If still out of range → action is incomplete; narrate the partial approach and remaining distance.
- FACING: Update the player's 'facing' field to point toward the interaction target: facing = atan2(targetY - playerY, targetX - playerX) × 180 / π.
- NPC & ENTITY MOVEMENT: When NPCs engage in combat, pursue, flee, or patrol, update their (x, y) position in the 'areas' array proportional to their speed × time.
- VISION & DETECTION: Player vision ranges (detailedRange, maxRange) in CurrentMap.json must match perception stats. Entities beyond maxRange must not appear on the map.
- COORDINATE INTEGRITY: All coordinates must be proportional to the declared map scale. A "10m × 10m" room = width:10, height:10. Never use arbitrary coordinates that violate the scale.
- A screenshot of the current map may be attached. Use it to visually verify spatial consistency of your response.

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

          const prompt = `Initialize world: ${startingPrompt}\n\nRemember: PROBABILITY ENGINE RULE (CRITICAL). Create highly detailed, extensive, and long files for the starting world (CurrentMap.json, WorldRules.txt, Guide.txt, WorldTime.txt, and any initial locations/NPCs). ${charRequirement} Ensure all stats use the new dynamic probability engine modifier format (e.g., "agility: base probability engine + 5%(1000) + effects") and armor uses thresholds. If the initialization involves any uncertain event, return "checks".\nCRITICAL: Any magic, abilities, or spells MUST be highly specific with strict limits, energy costs, ranges, and target caps. Vague "magic" is completely unacceptable.`;
          const res = await this.handleRequest(prompt);
          resolve(res);
        } catch (e) {
          console.error("Initialization failed", e);
          resolve({ narrative: "System initialization failed. Please check API Key." });
        }
      });
    });
  }

  async processAction(action: string, username?: string, mapScreenshot?: string): Promise<AIResponse | null> {
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

          // Pre-compute spatial context with exact distances
          const spatialContext = this.buildSpatialContext(username);
          // Capture old map state for post-processing
          const oldMapRaw = this.fs.read('CurrentMap.json');

          const userHeader = username ? `[Player: ${username}]\n` : '';
          const prompt = `Current Files Summary:\n${charContext}${worldContext}\n\n${spatialContext}\n${userHeader}Player action: ${action}\n\nProcess this action.
          
CRITICAL REMINDER: 
1. If the player's action causes ANY change to their stats (Health, Energy, Inventory), you MUST include the updated character file content in your 'files' response.
2. If NPCs or entities are modified, their files MUST be updated.
3. The files listed above are your ONLY source of truth. Do not invent stats that contradict the files.
4. PROBABILITY ENGINE RULE: If the action is uncertain, has a chance of failure, or involves stats/skills, return "checks" and an empty narrative.
5. Ensure all stats use the new dynamic probability engine modifier format.
6. NO VAGUE MAGIC: Any spell, superpower, or supernatural ability MUST be strictly documented with limits (e.g., max weight 5 lbs, max range 10m), strict energy costs per use, and exact constraints. "Vague magic" is rejected.
7. FILE MINIMIZATION (CRITICAL): Do NOT re-include files in 'files' if their content has NOT changed. Only include files that are NEW, MODIFIED, or DELETED. Repeating unchanged files wastes resources.
8. MAP POSITION UPDATE (CRITICAL): You MUST update CurrentMap.json in EVERY response. The SPATIAL CONTEXT above shows exact distances — use those numbers. If the player interacts with anything, move them to the appropriate position. If they are too far, move them toward it by their speed × time. Always update facing direction.${mapScreenshot ? '\n9. A screenshot of the current map is attached. Use it to visually verify spatial consistency.' : ''}
${username ? `${mapScreenshot ? '10' : '9'}. If a character file for "${username}" does not exist, you MUST create it immediately as part of this response following the ENTITY FILE SCHEMA.` : ''}`;

          const res = await this.handleRequest(prompt, mapScreenshot);

          // Post-process: enforce spatial consistency on the returned map
          if (res && oldMapRaw) {
            this.enforceSpatialConsistency(oldMapRaw, username);
          }

          resolve(res);
        } catch (e) {
          console.error("Processing failed", e);
          resolve({ narrative: "Error processing action." });
        }
      });
    });
  }

  /**
   * Pre-computes exact Euclidean distances from the active player to nearby entities on the map.
   * Only includes entities within the player's vision/interaction range to keep the prompt efficient.
   * Returns a formatted string block to inject into the prompt.
   */
  private buildSpatialContext(username?: string): string {
    const mapRaw = this.fs.read('CurrentMap.json');
    if (!mapRaw) return '';

    try {
      const mapData = JSON.parse(mapRaw);
      const pages = mapData.pages || (mapData.areas ? [mapData] : []);
      if (pages.length === 0) return '';

      const lines: string[] = ['[SPATIAL CONTEXT — Nearby entities with pre-computed distances (meters).]'];

      for (const page of pages) {
        const players = page.players || [];
        const areas = page.areas || [];

        for (const player of players) {
          const px = Number(player.x) || 0;
          const py = Number(player.y) || 0;
          const playerLabel = player.username || 'Unknown';

          // Use player's max vision range as the relevance radius, or default 50m
          const maxRange = Number(player.vision?.maxRange) || 50;

          // Compute distances to all areas, then filter and sort
          const areaDistances: { name: string; type: string; dist: number; cx: number; cy: number }[] = [];
          for (const area of areas) {
            const ax = Number(area.x) || 0;
            const ay = Number(area.y) || 0;
            const aw = Number(area.width) || 0;
            const ah = Number(area.height) || 0;
            const cx = area.shape === 'circle' ? ax : ax + aw / 2;
            const cy = area.shape === 'circle' ? ay : ay + ah / 2;
            const dist = Math.sqrt((px - cx) ** 2 + (py - cy) ** 2);
            const name = area.name || area.id || `area_${areas.indexOf(area)}`;
            areaDistances.push({ name, type: area.type || 'unknown', dist, cx, cy });
          }

          // Filter to entities within range and sort closest first
          const nearby = areaDistances
            .filter(a => a.dist <= maxRange * 1.5) // slight buffer beyond vision
            .sort((a, b) => a.dist - b.dist);

          if (nearby.length === 0 && areaDistances.length > 0) {
            // If nothing is in range, show the 3 closest so the AI knows what's nearest
            areaDistances.sort((a, b) => a.dist - b.dist);
            nearby.push(...areaDistances.slice(0, 3));
          }

          const distLines = nearby.map(a =>
            `  → ${a.name} (${a.type}): ${a.dist.toFixed(1)}m [at (${a.cx.toFixed(1)}, ${a.cy.toFixed(1)})]`
          );

          // Other players are always relevant
          for (const other of players) {
            if (other.username === player.username) continue;
            const ox = Number(other.x) || 0;
            const oy = Number(other.y) || 0;
            const dist = Math.sqrt((px - ox) ** 2 + (py - oy) ** 2);
            distLines.push(`  → Player ${other.username}: ${dist.toFixed(1)}m [at (${ox.toFixed(1)}, ${oy.toFixed(1)})]`);
          }

          lines.push(`${playerLabel} at (${px.toFixed(1)}, ${py.toFixed(1)}), facing ${player.facing || 0}°:`);
          lines.push(...distLines);
        }

        if (page.scale) {
          lines.push(`Map scale: ${page.scale}`);
        }
      }

      return lines.join('\n');
    } catch (e) {
      console.error('Failed to build spatial context', e);
      return '';
    }
  }

  /**
   * Post-processes the AI's response to enforce spatial consistency.
   * Compares old vs new map state and corrects player positions if the AI
   * failed to move them appropriately toward any interactive entity.
   */
  private enforceSpatialConsistency(oldMapRaw: string, username?: string) {
    const newMapRaw = this.fs.read('CurrentMap.json');
    if (!newMapRaw || !oldMapRaw) return;

    try {
      const oldMap = JSON.parse(oldMapRaw);
      const newMap = JSON.parse(newMapRaw);

      const oldPages = oldMap.pages || (oldMap.areas ? [oldMap] : []);
      const newPages = newMap.pages || (newMap.areas ? [newMap] : []);

      // Interactive area types — anything a player could physically engage with
      const interactiveTypes = new Set([
        'npc', 'treasure', 'loot', 'furniture', 'vehicle', 'terminal',
        'portal', 'tech', 'magic', 'obstacle', 'building'
      ]);

      let modified = false;

      for (let pi = 0; pi < newPages.length; pi++) {
        const newPage = newPages[pi];
        const oldPage = oldPages[pi];
        if (!newPage?.players || !oldPage?.players) continue;

        const areas = newPage.areas || [];

        for (const newPlayer of newPage.players) {
          const oldPlayer = oldPage.players.find((p: any) =>
            p.username?.toLowerCase() === newPlayer.username?.toLowerCase()
          );
          if (!oldPlayer) continue;

          const oldX = Number(oldPlayer.x) || 0;
          const oldY = Number(oldPlayer.y) || 0;
          const newX = Number(newPlayer.x) || 0;
          const newY = Number(newPlayer.y) || 0;

          // If the AI already moved the player, trust the AI's calculation
          if (Math.abs(newX - oldX) > 0.1 || Math.abs(newY - oldY) > 0.1) continue;

          // Player didn't move — find the closest interactive entity
          let closestTarget: { cx: number; cy: number } | null = null;
          let closestDist = Infinity;

          for (const area of areas) {
            // Consider any interactive type, not just NPCs
            if (!interactiveTypes.has(area.type?.toLowerCase())) continue;

            const ax = Number(area.x) || 0;
            const ay = Number(area.y) || 0;
            const aw = Number(area.width) || 0;
            const ah = Number(area.height) || 0;
            const cx = area.shape === 'circle' ? ax : ax + aw / 2;
            const cy = area.shape === 'circle' ? ay : ay + ah / 2;
            const dist = Math.sqrt((newX - cx) ** 2 + (newY - cy) ** 2);

            if (dist < closestDist) {
              closestDist = dist;
              closestTarget = { cx, cy };
            }
          }

          // If the closest interactive entity is beyond reasonable interaction range,
          // move the player toward it
          if (closestTarget && closestDist > 3) {
            const moveSpeed = this.extractPlayerSpeed(newPlayer.username) || 1.5;
            // Estimate time from WorldTime diff, or use a reasonable default
            const timeCost = this.estimateTimeCost() || 6;
            const maxMove = moveSpeed * timeCost;
            const moveDistance = Math.min(maxMove, Math.max(0, closestDist - 1.5));

            if (moveDistance > 0.5) {
              const ratio = moveDistance / closestDist;
              newPlayer.x = +(oldX + (closestTarget.cx - oldX) * ratio).toFixed(1);
              newPlayer.y = +(oldY + (closestTarget.cy - oldY) * ratio).toFixed(1);

              // Update facing direction toward the target
              const facingRad = Math.atan2(
                closestTarget.cy - newPlayer.y,
                closestTarget.cx - newPlayer.x
              );
              newPlayer.facing = +(facingRad * 180 / Math.PI).toFixed(0);

              modified = true;
            }
          }
        }
      }

      if (modified) {
        const correctedJson = JSON.stringify(newMap.pages ? newMap : { pages: newPages });
        this.fs.write('CurrentMap.json', correctedJson);
      }
    } catch (e) {
      console.error('Spatial consistency enforcement failed', e);
    }
  }

  /**
   * Extracts a player's movement speed from their character file.
   * Handles varied formats: "Walking: 1.5m/s", "Speed 5 ft/s", "Movement Speed: 3 meters per second", etc.
   * Returns speed in m/s, or null if not found.
   */
  private extractPlayerSpeed(username: string): number | null {
    if (!username) return null;
    const files = this.fs.getAll();
    const uLower = username.toLowerCase();

    for (const [name, content] of Object.entries(files)) {
      if (!name.toLowerCase().includes(uLower)) continue;

      // Try multiple patterns from most specific to least
      const patterns = [
        /(?:walk(?:ing)?|run(?:ning)?|move(?:ment)?|speed|sprint(?:ing)?|base\s*speed)[:\s]*(\d+\.?\d*)\s*m(?:eters?)?\s*(?:\/|per\s*)s(?:ec(?:ond)?)?/i,
        /(\d+\.?\d*)\s*m\/s/i,
        /(\d+\.?\d*)\s*(?:ft|feet)\s*(?:\/|per\s*)s(?:ec)?/i,  // ft/s → convert
        /(\d+\.?\d*)\s*(?:km|kph|km\/h)/i,  // km/h → convert
        /(?:speed|movement)[:\s]*(\d+\.?\d*)/i, // bare number fallback
      ];

      for (let i = 0; i < patterns.length; i++) {
        const match = content.match(patterns[i]);
        if (match) {
          let speed = parseFloat(match[1]);
          // Convert units to m/s
          if (i === 2) speed *= 0.3048;    // ft/s → m/s
          if (i === 3) speed /= 3.6;       // km/h → m/s
          if (speed > 0 && speed < 100) return speed; // sanity check
        }
      }
    }
    return null;
  }

  /**
   * Estimates the time cost of the last action by checking the most recent
   * update entry or WorldTime changes. Returns seconds, or null if unknown.
   */
  private estimateTimeCost(): number | null {
    // Check the WorldTime.txt for any time-related info
    // This is a best-effort estimation — return null to use defaults
    return null;
  }

  private async handleRequest(userPrompt: string, mapScreenshot?: string): Promise<AIResponse | null> {
    // Phase 1: Analyze/Execute
    let responseText = await this.callAI(userPrompt, mapScreenshot);
    let data: AIResponse;

    try {
      data = this.extractJSON(responseText);
    } catch (e) {
      console.error("JSON extraction/parse Error", e, responseText);
      return { narrative: "System Error: AI returned invalid JSON format." };
    }

    // Phase 2: If checks are required
    if (data.checks && Array.isArray(data.checks) && data.checks.length > 0) {
      // Also process any file updates from Phase 1 so they aren't lost
      this.processResponseData(data);

      const results = data.checks.map(check => {
        // Normalize alternate AI check formats
        // AI sometimes returns { check, stat, threshold, modifier } instead of { name, thresholds }
        const safeName = check.name || check.check || check.stat || 'Action Check';
        const safeDesc = check.description || `Probability roll for ${safeName}`;

        let safeThresholds: { [key: string]: number };
        if (check.thresholds && typeof check.thresholds === 'object') {
          safeThresholds = check.thresholds;
        } else if (typeof check.threshold === 'number') {
          // Convert flat threshold + modifier to proper thresholds object
          const base = check.threshold;
          const mod = check.modifier || 0;
          const adjusted = Math.max(0, Math.min(1000, base - mod));
          safeThresholds = {
            "Critical Success": Math.min(1000, adjusted + 200),
            "Success": adjusted,
            "Partial Success": Math.max(0, adjusted - 150)
          };
        } else {
          safeThresholds = { "Success": 500 };
        }

        const roll = Math.floor(Math.random() * 1001);
        const outcome = this.determineOutcome(roll, safeThresholds);
        return {
          name: safeName,
          description: safeDesc,
          outcome: outcome,
          roll: roll,
          thresholds: safeThresholds
        };
      });

      const resultReport = results.map(r =>
        `Check: ${r.name}\nReason: ${r.description}\nRoll: ${r.roll} / 1000\nThresholds: ${JSON.stringify(r.thresholds)}\nRESULT: ${r.outcome}`
      ).join('\n\n');

      const fullDetailsHtml = results.map(r =>
        `[Probability Check: ${r.name} - Result: ${r.outcome} | Roll: ${r.roll}/1000 | Thresholds: ${JSON.stringify(r.thresholds).replace(/"/g, '&quot;')}]`
      ).join(' ');

      const followUpPrompt = `PREVIOUS CONTEXT: ${userPrompt}\n\n[SYSTEM: Probability Engine Results]\n\n${resultReport}\n\nBased on these FAIR and FINAL results, generate the highly detailed narrative and extensive file updates. Calculate exact dynamic outcomes (e.g., damage = base * probability result) WITHOUT using dice notation. 
      CRITICAL: You MUST include the exact text "${fullDetailsHtml}" at the very beginning or end of your narrative so the player can click to see the full mathematical details. Do not alter the formatting of that string. Include the Check Name and Result (e.g. "[Jump: Failure]") natively in the narrative text as well.`;

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

      // 4. Progressive brace trimming — AI sometimes adds extra trailing } characters
      let candidate = greedyMatch[0];
      for (let attempt = 0; attempt < 5; attempt++) {
        // Try removing the last }
        const lastBrace = candidate.lastIndexOf('}');
        if (lastBrace <= 0) break;
        candidate = candidate.substring(0, lastBrace);
        // Find the matching end
        const reMatch = candidate.match(/\{[\s\S]*\}/);
        if (reMatch) {
          try {
            return JSON.parse(this.sanitizeJSON(reMatch[0]));
          } catch (e2) { }
        }
      }
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
          // Skip if content is identical to what's already stored
          const existing = this.fs.read(filename);
          if (existing === fileData) continue;
          this.fs.write(filename, fileData);
        } else if (fileData && typeof fileData === 'object' && fileData.content) {
          const contentStr = typeof fileData.content === 'object' ? JSON.stringify(fileData.content) : fileData.content;
          // Skip if content is identical to what's already stored
          const existing = this.fs.read(filename);
          if (existing === contentStr) continue;
          this.fs.write(filename, contentStr, fileData.displayName);
        }
      }
    }
  }

  private async callAI(prompt: string, mapScreenshot?: string): Promise<string> {
    try {
      // Build contents with optional map screenshot for multimodal context
      let contents: any;
      if (mapScreenshot) {
        contents = [
          {
            role: 'user',
            parts: [
              { text: prompt },
              {
                inlineData: {
                  mimeType: 'image/png',
                  data: mapScreenshot
                }
              }
            ]
          }
        ];
      } else {
        contents = prompt;
      }

      const response = await this.ai.models.generateContent({
        model: 'gemini-3.1-flash-lite-preview',
        contents: contents,
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