export const projectRetrievalCases = [
  { id: "inventory", query: "InventoryService AddItem ownership", relevant: ["inventory-service"] },
  { id: "persistence", query: "DataStore UpdateAsync profile save retry", relevant: ["profile-store"] },
  { id: "remote-security", query: "RemoteEvent server validation cooldown distance", relevant: ["remote-validator"] },
  { id: "npc", query: "NPC customer pathfinding state machine", relevant: ["npc-controller"] },
  { id: "mobile-ui", query: "mobile responsive inventory ScreenGui layout", relevant: ["inventory-ui"] },
  { id: "quests", query: "quest progression player rewards service", relevant: ["quest-service"] },
];
export const projectRetrievalCorpus = [
  { id: "inventory-service", path: "ServerScriptService/InventoryService.luau", text: "InventoryService AddItem RemoveItem item ownership player inventory server authority" },
  { id: "profile-store", path: "ServerScriptService/ProfileStore.luau", text: "DataStore UpdateAsync profile save retry player data persistence budget" },
  { id: "remote-validator", path: "ServerScriptService/RemoteValidator.luau", text: "RemoteEvent server validation cooldown distance ownership rate limit" },
  { id: "npc-controller", path: "ServerScriptService/NPCController.luau", text: "NPC customer pathfinding state machine movement behavior" },
  { id: "inventory-ui", path: "StarterGui/InventoryUI.client.luau", text: "mobile responsive inventory ScreenGui layout UIGridLayout safe area" },
  { id: "quest-service", path: "ServerScriptService/QuestService.luau", text: "quest progression player rewards service completion state" },
  { id: "sound-service", path: "ReplicatedStorage/SoundService.luau", text: "audio music ambience sound effects volume" },
  { id: "shop-ui", path: "StarterGui/ShopUI.client.luau", text: "shop purchase product price confirmation interface" },
  { id: "lighting", path: "Lighting/Atmosphere.json", text: "environment lighting sky atmosphere color" },
  { id: "player-movement", path: "StarterPlayer/Movement.client.luau", text: "character movement camera jump sprint controls" },
];
