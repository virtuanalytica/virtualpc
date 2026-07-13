"use strict";
/**
 * LightRAG Client - Shared Memory Integration
 *
 * Provides unified interface for agents to:
 * - Query shared knowledge graph
 * - Add facts/decisions
 * - Find precedents
 * - Get full context
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.LightRAGClient = void 0;
const neo4j_driver_1 = __importDefault(require("neo4j-driver"));
const logger_1 = __importDefault(require("../../utils/logger"));
class LightRAGClient {
    constructor(config) {
        this.queryCache = new Map();
        // Monotonic suffix so two nodes added in the same millisecond get distinct
        // ids — otherwise CREATE would produce duplicate-id graph nodes (corrupting
        // the shared knowledge graph under bulk ingest).
        this.nodeSeq = 0;
        this.connected = false;
        this.driver = neo4j_driver_1.default.driver(config.neo4j_url, neo4j_driver_1.default.auth.basic(config.neo4j_username, config.neo4j_password));
    }
    /**
     * Connect to Neo4j (gracefully degrades if unavailable)
     */
    async connect() {
        try {
            const session = this.driver.session();
            await session.run('RETURN 1');
            await session.close();
            this.connected = true;
            logger_1.default.info('✓ LightRAG connected to Neo4j');
        }
        catch (error) {
            this.connected = false;
            logger_1.default.warn('⚠ Neo4j not available - LightRAG running in offline mode (in-memory only)');
        }
    }
    /**
     * Check if Neo4j is connected
     */
    isConnected() {
        return this.connected;
    }
    /**
     * Query the knowledge graph
     */
    async query(queryText, filters) {
        const cacheKey = JSON.stringify({ queryText, filters });
        // Check cache
        if (this.queryCache.has(cacheKey)) {
            logger_1.default.debug('Cache hit for query:', queryText);
            return { ...this.queryCache.get(cacheKey), cached: true };
        }
        // Return empty result if not connected
        if (!this.connected) {
            return { nodes: [], relationships: [], cached: false };
        }
        const session = this.driver.session();
        try {
            // Execute Cypher-like query
            const result = await session.run(`
        MATCH (n:Node)
        WHERE n.content CONTAINS $query
        RETURN n
        LIMIT 10
      `, { query: queryText });
            const nodes = result.records.map(record => ({
                id: record.get('n').identity.toString(),
                type: record.get('n').properties.type,
                content: record.get('n').properties.content,
                created_by: record.get('n').properties.created_by,
                created_at: new Date(record.get('n').properties.created_at),
            }));
            const output = {
                nodes,
                relationships: [],
                cached: false
            };
            // Cache result
            this.queryCache.set(cacheKey, output);
            return output;
        }
        finally {
            await session.close();
        }
    }
    /**
     * Add a fact/decision to the graph
     */
    async addNode(node) {
        const id = `node_${Date.now()}_${this.nodeSeq++}`;
        // Return in-memory node if not connected
        if (!this.connected) {
            logger_1.default.info(`✓ Fact added (offline): ${node.type}`);
            return {
                id,
                type: node.type,
                content: node.content,
                context: node.context,
                created_by: node.created_by,
                created_at: new Date(),
                affects: node.affects
            };
        }
        const session = this.driver.session();
        try {
            const result = await session.run(`
        CREATE (n:Node {
          id: $id,
          type: $type,
          content: $content,
          context: $context,
          created_by: $created_by,
          created_at: datetime(),
          affects: $affects
        })
        RETURN n
        `, {
                id,
                type: node.type,
                content: node.content,
                context: node.context || '',
                created_by: node.created_by,
                affects: node.affects || []
            });
            const record = result.records[0];
            const created = record.get('n').properties;
            // Clear cache on new write
            this.queryCache.clear();
            logger_1.default.info(`✓ Fact added: ${node.type} from ${node.created_by}`);
            return {
                id: created.id,
                type: created.type,
                content: created.content,
                context: created.context,
                created_by: created.created_by,
                created_at: new Date(created.created_at),
                affects: created.affects
            };
        }
        finally {
            await session.close();
        }
    }
    /**
     * Find similar decisions/precedents
     */
    async findSimilar(topic, threshold = 0.7) {
        if (!this.connected)
            return [];
        const session = this.driver.session();
        try {
            const result = await session.run(`
        MATCH (n:Node {type: 'decision'})
        WHERE n.context CONTAINS $topic
        RETURN n
        ORDER BY n.created_at DESC
        LIMIT 5
      `, { topic });
            return result.records.map(record => ({
                id: record.get('n').identity.toString(),
                type: record.get('n').properties.type,
                content: record.get('n').properties.content,
                created_by: record.get('n').properties.created_by,
                created_at: new Date(record.get('n').properties.created_at),
            }));
        }
        finally {
            await session.close();
        }
    }
    /**
     * Get full context for a project
     */
    async getContext(projectId, include = []) {
        if (!this.connected) {
            return { project_id: projectId, nodes: [], total_count: 0, completeness_score: 0, updated_at: new Date().toISOString() };
        }
        const session = this.driver.session();
        try {
            const result = await session.run(`
        MATCH (n:Node {context: $projectId})
        RETURN n
        ORDER BY n.created_at DESC
      `, { projectId });
            const nodes = result.records.map(record => ({
                id: record.get('n').identity.toString(),
                type: record.get('n').properties.type,
                content: record.get('n').properties.content,
                created_by: record.get('n').properties.created_by,
            }));
            return {
                project_id: projectId,
                nodes: nodes.filter(n => include.length === 0 || include.includes(n.type)),
                total_count: nodes.length,
                completeness_score: Math.min(nodes.length / 10, 1.0),
                updated_at: new Date().toISOString()
            };
        }
        finally {
            await session.close();
        }
    }
    /**
     * Close connection
     */
    async close() {
        await this.driver.close();
        logger_1.default.info('LightRAG connection closed');
    }
}
exports.LightRAGClient = LightRAGClient;
//# sourceMappingURL=client.js.map