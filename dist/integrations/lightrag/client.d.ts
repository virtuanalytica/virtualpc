/**
 * LightRAG Client - Shared Memory Integration
 *
 * Provides unified interface for agents to:
 * - Query shared knowledge graph
 * - Add facts/decisions
 * - Find precedents
 * - Get full context
 */
export interface GraphNode {
    id: string;
    type: string;
    content: string;
    context?: string;
    created_by: string;
    created_at: Date;
    affects?: string[];
}
export interface QueryResult {
    nodes: GraphNode[];
    relationships: any[];
    cached: boolean;
}
export declare class LightRAGClient {
    private driver;
    private queryCache;
    private nodeSeq;
    constructor(config: {
        neo4j_url: string;
        neo4j_username: string;
        neo4j_password: string;
    });
    private connected;
    /**
     * Connect to Neo4j (gracefully degrades if unavailable)
     */
    connect(): Promise<void>;
    /**
     * Check if Neo4j is connected
     */
    isConnected(): boolean;
    /**
     * Query the knowledge graph
     */
    query(queryText: string, filters?: Record<string, any>): Promise<QueryResult>;
    /**
     * Add a fact/decision to the graph
     */
    addNode(node: Omit<GraphNode, 'id' | 'created_at'>): Promise<GraphNode>;
    /**
     * Find similar decisions/precedents
     */
    findSimilar(topic: string, threshold?: number): Promise<GraphNode[]>;
    /**
     * Get full context for a project
     */
    getContext(projectId: string, include?: string[]): Promise<any>;
    /**
     * Close connection
     */
    close(): Promise<void>;
}
//# sourceMappingURL=client.d.ts.map