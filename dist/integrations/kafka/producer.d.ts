/**
 * Kafka Producer - Publish messages to Kafka topics
 *
 * Handles:
 * - Task publishing
 * - Result publishing
 * - Cost tracking
 * - Memory updates
 * - Batch optimization
 */
export interface ProducerConfig {
    brokers: string[];
    clientId: string;
}
export declare class KafkaProducer {
    private kafka;
    private producer;
    private connected;
    constructor(config: ProducerConfig);
    /**
     * Connect to Kafka
     */
    connect(): Promise<void>;
    /**
     * Publish a task to agent.tasks
     */
    publishTask(agent: string, task: any): Promise<string>;
    /**
     * Publish results from agent
     */
    publishResult(taskId: string, agent: string, result: any): Promise<void>;
    /**
     * Publish API request to model.requests
     */
    publishModelRequest(request: any): Promise<string>;
    /**
     * Publish model response
     */
    publishModelResponse(response: any): Promise<void>;
    /**
     * Track API cost
     */
    trackCost(cost: {
        agent: string;
        model: string;
        tokens_prompt: number;
        tokens_completion: number;
        cost_usd: number;
        task_id?: string;
    }): Promise<void>;
    /**
     * Publish memory update (decision, risk, precedent)
     */
    publishMemoryUpdate(update: {
        type: 'decision' | 'risk' | 'precedent' | 'context';
        content: string;
        agent: string;
        affects?: string[];
        metadata?: Record<string, any>;
    }): Promise<string>;
    /**
     * Publish health check
     */
    publishHealthCheck(component: string, status: string, metrics?: any): Promise<void>;
    /**
     * Publish a commit.audit event (recorded by post-commit git hook +
     * /api/audit/commit endpoint).
     */
    publishCommitAudit(payload: {
        sha: string;
        shortSha: string;
        author: string;
        ts: string;
        subject: string;
        attributedAgent?: string;
        taskRef?: string | null;
        source?: string;
    }): Promise<void>;
    /**
     * Publish a task.failed event when a task hits a non-recoverable error
     * (LM Studio timeout, model load failure, artifact-gen exception).
     */
    publishTaskFailed(payload: {
        task_id: string;
        agent: string;
        title?: string;
        failure_stage: 'artifact-gen' | 'chat' | 'tool' | 'other';
        error: string;
        ts: string;
    }): Promise<void>;
    /**
     * Batch publish messages
     */
    publishBatch(topic: string, messages: any[]): Promise<void>;
    /**
     * Disconnect producer
     */
    disconnect(): Promise<void>;
    /**
     * Get producer status
     */
    getStatus(): {
        connected: boolean;
        status: string;
    };
}
export default KafkaProducer;
//# sourceMappingURL=producer.d.ts.map