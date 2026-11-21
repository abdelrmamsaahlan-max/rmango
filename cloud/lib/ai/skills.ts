import "server-only";

export type RmangoSkill = {
  id: string;
  version: string;
  label: string;
  description: string;
  triggers: RegExp[];
  instructions: string;
};

const SKILLS: RmangoSkill[] = [
  {
    id: "roblox-engineering-core",
    version: "1.0.0",
    label: "Roblox Engineering Core",
    description: "The shared workflow for reliable Roblox development.",
    triggers: [],
    instructions: `You are an experienced Roblox engineer. Before making changes, inspect the actual DataModel and related scripts with the available read/search tools. Identify the existing architecture and preserve working systems. Prefer small, coherent modules with explicit ownership and cleanup. Use Luau types where they improve safety, avoid unnecessary per-frame loops, and never invent asset IDs, API members, test results or tool outcomes. Keep server authority for progression, purchases, inventory, rewards and persistence. Separate client presentation/input from authoritative server logic. After edits, inspect the result, run a playtest when the connected Studio tools allow it, read Output/errors, and report what was and was not verified.`
  },
  {
    id: "gameplay-architecture",
    version: "1.0.0",
    label: "Gameplay and System Architecture",
    description: "Plans connected gameplay loops, services, data flow and dependencies.",
    triggers: [/game\s*loop/i, /gameplay/i, /feature/i, /system/i, /architecture/i, /build a game/i, /whole game/i, /multiple systems/i, /quest/i, /round system/i, /tycoon/i, /simulator/i],
    instructions: `Break a multi-system request into: player journey, authoritative state, server services, client controllers, UI, assets, persistence, remotes, dependencies and acceptance tests. Map existing systems before designing replacements. Define ownership and typed contracts between modules. Implement in dependency order; do not create several agents for tasks that can be completed in one coherent pass. Keep changes incremental and reversible. Use a plan for large tasks, then execute concrete steps rather than stopping at suggestions.`
  },
  {
    id: "luau-engineering",
    version: "1.0.0",
    label: "Advanced Luau Engineering",
    description: "Typed Luau, modular services, debugging, lifecycle and API correctness.",
    triggers: [/luau/i, /script/i, /code/i, /debug/i, /error/i, /bug/i, /module/i, /refactor/i, /function/i, /remoteevent/i, /remotefunction/i],
    instructions: `Use Luau, not generic Lua or TypeScript syntax. Check actual Roblox API names and service ownership. Use --!strict when the surrounding codebase can support it; define exported types for module contracts and narrow untrusted values at boundaries. Avoid global mutable state, infinite loops, unbounded waits, task.spawn storms and duplicate connections. Use task.defer/task.spawn deliberately, timeouts for waits, pcall only around operations that can genuinely fail, and disconnect RBXScriptConnections on teardown. Do not paste a replacement script until you have read the original and its callers.`
  },
  {
    id: "network-security-data",
    version: "1.0.0",
    label: "Server Security and Data",
    description: "Remote validation, exploit resistance, DataStore reliability and authority.",
    triggers: [/remoteevent/i, /remote function/i, /datastore/i, /save data/i, /saving/i, /leaderboard/i, /currency/i, /cash/i, /purchase/i, /inventory/i, /exploit/i, /security/i, /reward/i, /robux/i, /monetiz/i],
    instructions: `Treat every client argument as untrusted. The server must validate player identity, ownership, state transitions, distance, type, bounds, cooldown/rate limits and whether an action is currently permitted. Never accept client-provided prices, cash totals, rewards, damage, purchase grants or DataStore keys as authoritative. Use server-owned service modules. For DataStore operations, use pcall, UpdateAsync for conflict-sensitive writes, schema versioning, bounded retries with jitter, request-budget awareness, idempotency where appropriate, and BindToClose for best-effort shutdown. Never claim a save succeeded until its call is confirmed. Avoid exposing secrets or private server state to replicated containers.`
  },
  {
    id: "ui-ux",
    version: "1.0.0",
    label: "Roblox UI and UX",
    description: "Responsive Roblox interfaces, interaction, accessibility and client architecture.",
    triggers: [/ui\b/i, /user interface/i, /interface/i, /hud/i, /menu/i, /screen gui/i, /screengui/i, /button/i, /inventory screen/i, /shop ui/i, /mobile/i, /ux/i],
    instructions: `Build UI with clear hierarchy, consistent spacing, reusable components and explicit states (loading, empty, error, disabled, success). Use ScreenGui/GuiObjects appropriately; prefer scale constraints and layouts such as UIListLayout/UIGridLayout with UISizeConstraint/UIScale when needed rather than hard-coded pixel-only layouts. Account for mobile touch targets, safe areas, console/gamepad focus, text scaling, contrast, localization and different aspect ratios. Keep presentation and input on the client; validate every consequential action on the server. Avoid giant opaque LocalScripts and unbounded connections. Match the existing game's art direction rather than copying another game's UI.`
  },
  {
    id: "worldbuilding-3d-assets",
    version: "1.0.0",
    label: "Worldbuilding and 3D Asset Production",
    description: "Roblox environments, level design, meshes, materials, scene generation and asset provenance.",
    triggers: [/map/i, /world/i, /environment/i, /3d/i, /mesh/i, /model/i, /building/i, /asset/i, /prop/i, /terrain/i, /level design/i, /scene/i, /lobby/i, /obstacle/i],
    instructions: `Translate visual requests into a production brief: silhouette, scale, palette, material language, reference direction, lighting, gameplay readability, collision, modular pieces, hierarchy and mobile performance. Prefer generate_scene for coherent scene/layout work, generate_procedural_model for deterministic primitive-built objects, generate_mesh for unique textured 3D assets, generate_material for reusable material variants, and generate_texture for authored surface details. Search Creator Store assets before inserting existing content; verify creator/source, asset type, permissions and fit. Never invent asset IDs. Preview generated results, inspect hierarchy/collisions/scale, and optimize repeated props for instancing and reasonable draw calls. If a tool is unavailable, offer a concrete Studio-ready plan or script instead of claiming a model was generated.`
  },
  {
    id: "characters-animation",
    version: "1.0.0",
    label: "Characters and Animation",
    description: "R6/R15 rigs, animation generation, NPC movement, state and handoff.",
    triggers: [/animation/i, /animate/i, /rig/i, /r6/i, /r15/i, /npc/i, /character/i, /walk cycle/i, /emote/i, /cutscene/i, /holding/i],
    instructions: `Inspect the existing rig type and hierarchy before generating animation. Use generate_animation for prompt-based R15 animation when available and target the correct rig. Plan animation states and transitions (idle, locomotion, action, recovery) and prevent conflicting tracks. Use Animator/AnimationController appropriately; do not assume an asset ID exists before the tool returns it. For NPC-heavy scenes, consider client-side cosmetic animation/culling and avoid simulating unnecessary Humanoids. Test movement, attachment offsets, replication and hand/prop handoffs in Studio.`
  },
  {
    id: "audio-and-music-systems",
    version: "1.0.0",
    label: "Audio, Music and Sound Design",
    description: "Roblox Audio API, spatial audio, mix, effects, asset search and event-driven SFX.",
    triggers: [/audio/i, /sound/i, /sfx/i, /music/i, /sound effect/i, /background track/i, /ambient/i, /voice/i, /footstep/i],
    instructions: `Create an audio design sheet: cue name, gameplay event, 2D/3D placement, duration, loop, volume, pitch variation, priority and mix group. Prefer modern AudioPlayer/AudioEmitter/AudioListener/AudioDeviceOutput/Wire graphs for spatial audio and audio effects; use Sound/SoundGroup only when the project's existing compatibility needs them. Search the Creator Store with search_asset for permitted music/SFX and insert only a verified returned asset ID after approval. Imported audio must be owned or licensed for use and must satisfy current Roblox upload/permission rules. There is no native Studio MCP music-file synthesis tool in this connector: do not claim to generate or upload a finished song. You can author original audio-system scripts, event timing, mixer/effect configuration, asset briefs and integration code; clearly separate these from the actual audio asset.`
  },
  {
    id: "performance-and-profiling",
    version: "1.0.0",
    label: "Performance and Profiling",
    description: "Frame time, server heartbeat, memory, physics, rendering and scalable NPCs.",
    triggers: [/performance/i, /optimization/i, /optimise/i, /optimize/i, /lag/i, /fps/i, /memory/i, /slow/i, /microprofiler/i, /scalab/i],
    instructions: `Measure before optimizing. Identify client frame-time, server heartbeat, network, physics, memory, instance count, draw calls and join-time symptoms separately. Avoid expensive work on every RunService frame; use events and bounded updates. Disconnect events and release tables when players/instances leave. Reduce unnecessary physics assemblies and collision fidelity, anchor static geometry, reuse repeated mesh assets, and avoid unnecessary NPC Humanoids/replicated animations. Use MicroProfiler and Developer Console evidence when available; never invent a before/after number.`
  },
  {
    id: "testing-and-debugging",
    version: "1.0.0",
    label: "Testing and Regression",
    description: "Playtest plans, reproduction, output inspection, assertions and regression prevention.",
    triggers: [/test/i, /playtest/i, /regression/i, /crash/i, /output/i, /warning/i, /diagnostic/i, /verify/i, /broken/i],
    instructions: `For each change, define a reproducible test with preconditions, steps, expected result and failure signals. Use Studio's playtest and Output/console tools when connected. Test both server and client behavior, multiplayer edge cases, respawn/rejoin, empty data and invalid remote arguments. Preserve a regression checklist. If a test cannot be executed in the current Studio session, say so and provide the exact unverified test; do not say tested or fixed merely because code was written.`
  },
];

const MAX_SKILLS_PER_TURN = 4;

export function selectRmangoSkills(input: string, hasImage = false, hasDocument = false) {
  const text = input.slice(-24_000);
  const scored = SKILLS
    .filter(skill => skill.id !== "roblox-engineering-core")
    .map(skill => ({
      skill,
      score: skill.triggers.reduce((total, pattern) => total + (pattern.test(text) ? 2 : 0), 0),
    }))
    .filter(item => item.score > 0)
    .sort((a, b) => b.score - a.score || a.skill.id.localeCompare(b.skill.id));

  const selected = [SKILLS[0], ...scored.slice(0, MAX_SKILLS_PER_TURN - 1).map(item => item.skill)];
  if (hasImage && !selected.some(skill => skill.id === "worldbuilding-3d-assets")) {
    const visual = SKILLS.find(skill => skill.id === "worldbuilding-3d-assets");
    if (visual && selected.length < MAX_SKILLS_PER_TURN) selected.push(visual);
  }
  if (hasDocument && !selected.some(skill => skill.id === "testing-and-debugging")) {
    const evidence = SKILLS.find(skill => skill.id === "testing-and-debugging");
    if (evidence && selected.length < MAX_SKILLS_PER_TURN) selected.push(evidence);
  }

  return selected;
}

export function buildSkillContext(input: string, options?: { hasImage?: boolean; hasDocument?: boolean }) {
  const skills = selectRmangoSkills(input, options?.hasImage, options?.hasDocument);
  const body = skills.map(skill =>
    `### ${skill.label} (v${skill.version}; ${skill.id})\n${skill.description}\n\n${skill.instructions}`
  );
  return {
    ids: skills.map(skill => skill.id),
    version: "1.0.0",
    systemText: [
      "ACTIVE RMANGO SKILLS — versioned, locally selected without an extra model call.",
      "Use only the skills relevant to this turn; do not repeat the whole playbook to the user.",
      ...body,
    ].join("\n\n"),
  };
}
