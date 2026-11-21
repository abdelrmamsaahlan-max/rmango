export const intelligenceRoutingCases = [
  {
    id: "simple-luau-question",
    prompt: "What does ipairs do in Luau?",
    options: {},
    expected: { intent: "question", level: "instant", modelProfile: "fast", projectTools: false },
  },
  {
    id: "focused-remote-cooldown",
    prompt: "Add a cooldown to this RemoteEvent handler.",
    options: {},
    expected: { intent: "implementation", level: "focused", modelProfile: "developer", projectTools: false },
  },
  {
    id: "focused-datastore-debug",
    prompt: "Debug why this DataStore write returns an error.",
    options: {},
    expected: { intent: "debugging", level: "focused", modelProfile: "developer", projectTools: false },
  },
  {
    id: "deep-multisystem-implementation",
    prompt: "Implement an end-to-end tycoon architecture spanning server/client networking, replication, DataStore persistence, NPCs, inventory, economy, responsive UI and regression tests.",
    options: { hasSelectedProject: true, projectFileCount: 240 },
    expected: { intent: "implementation", level: "deep", modelProfile: "agent", projectTools: true },
  },
  {
    id: "research-current-roblox-docs",
    prompt: "Research the latest official Roblox DataStore documentation and benchmark safe persistence options.",
    options: {},
    expected: { intent: "research", level: "research", modelProfile: "think", projectTools: false },
  },
  {
    id: "project-dependency-navigation",
    prompt: "Which scripts depend on InventoryService in this project?",
    options: { hasSelectedProject: true, projectFileCount: 96 },
    expected: { intent: "project_navigation", level: "focused", modelProfile: "developer", projectTools: true },
  },
  {
    id: "image-understanding",
    prompt: "Describe the Roblox UI shown in this screenshot.",
    options: { hasImage: true },
    expected: { intent: "question", level: "instant", modelProfile: "vision", projectTools: false },
  },
  {
    id: "advanced-security-review",
    prompt: "Audit server/client RemoteEvent validation, inventory permissions, and DataStore boundaries in this codebase.",
    options: { hasSelectedProject: true, projectFileCount: 130 },
    expected: { intent: "code_review", level: "advanced", modelProfile: "developer", projectTools: true },
  },
  {
    id: "planning-only-gameplay",
    prompt: "Create an implementation plan for a Roblox tycoon with persistence, NPCs and a responsive UI. Do not write code yet.",
    options: { hasSelectedProject: true },
    expected: { intent: "planning", level: "advanced", modelProfile: "developer", projectTools: true },
  },
  {
    id: "manual-level-and-model-override",
    prompt: "What is a ModuleScript?",
    options: { requestedProfile: "think", levelSetting: "deep" },
    expected: { intent: "question", level: "deep", modelProfile: "think", projectTools: false },
  },
];
