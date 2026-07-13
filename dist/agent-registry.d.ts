/**
 * Agent Registry — single source of truth for the VirtualPC roster.
 *
 * Every module (task engine, token tracker, commits tracker, social hub, UI)
 * imports from here so there can be no drift where "All Agents" shows 12 but
 * Token Usage only shows 5. Adding a new agent = editing this file once.
 */
export interface AgentMeta {
    name: string;
    role: string;
    avatar: string;
    color: string;
    kind: 'core' | 'decision' | 'specialist' | 'resource' | 'hermes-coordinator' | 'tester' | 'marketing' | 'governance' | 'reviewer';
    /** Preferred model substrings for token-tracker / LM Studio routing */
    models: string[];
    /**
     * Scrum membership. Agents can belong to multiple teams (e.g. Fill chairs
     * the scrum-of-scrums; Kai joins both web-scrum and roblox-scrum as
     * cross-cutting infra). 'cross' = sits at the scrum-of-scrums layer.
     */
    teams?: ('cross' | 'scrum-roblox' | 'scrum-web' | 'scrum-marketing')[];
    /**
     * MCP tool ACL — names of tools the agent is allowed to call through the
     * virtualpc MCP server. Wildcards like 'codegraph.*' allowed. Read by the
     * MCP server on every tool invocation. Empty/undefined = no MCP access.
     */
    tools?: string[];
}
export declare const AGENT_META: AgentMeta[];
/** Canonical list of agent names — use this everywhere you need to iterate. */
export declare const AGENT_NAMES: string[];
/** Lookup by name (returns undefined if missing). */
export declare function getAgent(name: string): AgentMeta | undefined;
/** roleMap compatibility: { Fill: 'CEO', Kai: 'CTO', ... } */
export declare const ROLE_MAP: {
    [name: string]: string;
};
/** avatarMap compatibility */
export declare const AVATAR_MAP: {
    [name: string]: string;
};
/** colorMap compatibility */
export declare const COLOR_MAP: {
    [name: string]: string;
};
/** Agent → preferred models for token tracker / routing */
export declare const AGENT_MODELS: {
    [name: string]: string[];
};
//# sourceMappingURL=agent-registry.d.ts.map