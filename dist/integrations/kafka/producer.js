"use strict";
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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.KafkaProducer = void 0;
const kafkajs_1 = require("kafkajs");
const uuid_1 = require("uuid");
const logger_1 = __importDefault(require("../../utils/logger"));
class KafkaProducer {
    constructor(config) {
        this.connected = false;
        this.kafka = new kafkajs_1.Kafka({
            clientId: config.clientId,
            brokers: config.brokers,
            retry: {
                initialRetryTime: 100,
                retries: 8,
            },
        });
        this.producer = this.kafka.producer({
            idempotent: true,
            maxInFlightRequests: 5,
        });
    }
    /**
     * Connect to Kafka
     */
    async connect() {
        try {
            await this.producer.connect();
            this.connected = true;
            logger_1.default.info('✓ Kafka Producer connected');
        }
        catch (error) {
            logger_1.default.error('Failed to connect Kafka producer:', error);
            throw error;
        }
    }
    /**
     * Publish a task to agent.tasks
     */
    async publishTask(agent, task) {
        if (!this.connected) {
            throw new Error('Producer not connected');
        }
        const taskId = (0, uuid_1.v4)();
        const timestamp = new Date().toISOString();
        try {
            await this.producer.send({
                topic: 'agent.tasks',
                messages: [
                    {
                        key: agent,
                        value: JSON.stringify({
                            id: taskId,
                            agent,
                            ...task,
                            assigned_at: timestamp,
                        }),
                        headers: {
                            'correlation-id': taskId,
                            'timestamp': timestamp,
                        },
                    },
                ],
            });
            logger_1.default.info(`Task published: ${taskId} → ${agent}`);
            return taskId;
        }
        catch (error) {
            logger_1.default.error(`Failed to publish task: ${agent}`, error);
            throw error;
        }
    }
    /**
     * Publish results from agent
     */
    async publishResult(taskId, agent, result) {
        if (!this.connected) {
            throw new Error('Producer not connected');
        }
        const timestamp = new Date().toISOString();
        try {
            await this.producer.send({
                topic: 'agent.results',
                messages: [
                    {
                        key: taskId,
                        value: JSON.stringify({
                            task_id: taskId,
                            agent,
                            ...result,
                            completed_at: timestamp,
                        }),
                        headers: {
                            'correlation-id': taskId,
                            'timestamp': timestamp,
                        },
                    },
                ],
            });
            logger_1.default.info(`Result published: ${taskId} from ${agent}`);
        }
        catch (error) {
            logger_1.default.error(`Failed to publish result: ${taskId}`, error);
            throw error;
        }
    }
    /**
     * Publish API request to model.requests
     */
    async publishModelRequest(request) {
        if (!this.connected) {
            throw new Error('Producer not connected');
        }
        const requestId = (0, uuid_1.v4)();
        const timestamp = new Date().toISOString();
        try {
            await this.producer.send({
                topic: 'model.requests',
                messages: [
                    {
                        key: request.model || 'default',
                        value: JSON.stringify({
                            id: requestId,
                            ...request,
                            requested_at: timestamp,
                        }),
                        headers: {
                            'correlation-id': requestId,
                            'timestamp': timestamp,
                        },
                    },
                ],
            });
            logger_1.default.debug(`Model request published: ${requestId} (${request.model})`);
            return requestId;
        }
        catch (error) {
            logger_1.default.error(`Failed to publish model request`, error);
            throw error;
        }
    }
    /**
     * Publish model response
     */
    async publishModelResponse(response) {
        if (!this.connected) {
            throw new Error('Producer not connected');
        }
        const timestamp = new Date().toISOString();
        try {
            await this.producer.send({
                topic: 'model.responses',
                messages: [
                    {
                        key: response.request_id || 'default',
                        value: JSON.stringify({
                            ...response,
                            completed_at: timestamp,
                        }),
                        headers: {
                            'correlation-id': response.request_id,
                            'timestamp': timestamp,
                        },
                    },
                ],
            });
            logger_1.default.debug(`Model response published: ${response.request_id}`);
        }
        catch (error) {
            logger_1.default.error(`Failed to publish model response`, error);
            throw error;
        }
    }
    /**
     * Track API cost
     */
    async trackCost(cost) {
        if (!this.connected) {
            throw new Error('Producer not connected');
        }
        const timestamp = new Date().toISOString();
        try {
            await this.producer.send({
                topic: 'cost.tracking',
                messages: [
                    {
                        key: cost.agent,
                        value: JSON.stringify({
                            id: (0, uuid_1.v4)(),
                            ...cost,
                            timestamp,
                        }),
                    },
                ],
            });
            logger_1.default.debug(`Cost tracked: ${cost.agent} (${cost.model}) - $${cost.cost_usd.toFixed(4)}`);
        }
        catch (error) {
            logger_1.default.error(`Failed to track cost`, error);
            throw error;
        }
    }
    /**
     * Publish memory update (decision, risk, precedent)
     */
    async publishMemoryUpdate(update) {
        if (!this.connected) {
            throw new Error('Producer not connected');
        }
        const updateId = (0, uuid_1.v4)();
        const timestamp = new Date().toISOString();
        try {
            await this.producer.send({
                topic: 'lightrag.updates',
                messages: [
                    {
                        key: update.type,
                        value: JSON.stringify({
                            id: updateId,
                            ...update,
                            created_at: timestamp,
                        }),
                    },
                ],
            });
            logger_1.default.debug(`Memory update published: ${update.type} from ${update.agent}`);
            return updateId;
        }
        catch (error) {
            logger_1.default.error(`Failed to publish memory update`, error);
            throw error;
        }
    }
    /**
     * Publish health check
     */
    async publishHealthCheck(component, status, metrics) {
        if (!this.connected) {
            throw new Error('Producer not connected');
        }
        try {
            await this.producer.send({
                topic: 'system.health',
                messages: [
                    {
                        key: component,
                        value: JSON.stringify({
                            component,
                            status,
                            metrics: metrics || {},
                            timestamp: new Date().toISOString(),
                        }),
                    },
                ],
            });
            logger_1.default.debug(`Health check published: ${component} → ${status}`);
        }
        catch (error) {
            logger_1.default.error(`Failed to publish health check`, error);
            // Don't throw for health checks - they're non-critical
        }
    }
    /**
     * Publish a commit.audit event (recorded by post-commit git hook +
     * /api/audit/commit endpoint).
     */
    async publishCommitAudit(payload) {
        if (!this.connected)
            return;
        await this.producer.send({
            topic: 'commit.audit',
            messages: [{ key: payload.sha, value: JSON.stringify(payload) }],
        });
    }
    /**
     * Publish a task.failed event when a task hits a non-recoverable error
     * (LM Studio timeout, model load failure, artifact-gen exception).
     */
    async publishTaskFailed(payload) {
        if (!this.connected)
            return;
        await this.producer.send({
            topic: 'task.failed',
            messages: [{ key: payload.task_id, value: JSON.stringify(payload) }],
        });
    }
    /**
     * Batch publish messages
     */
    async publishBatch(topic, messages) {
        if (!this.connected) {
            throw new Error('Producer not connected');
        }
        try {
            await this.producer.send({
                topic,
                messages: messages.map((msg) => ({
                    key: msg.key || 'default',
                    value: JSON.stringify(msg.value),
                })),
            });
            logger_1.default.debug(`Batch published: ${messages.length} messages → ${topic}`);
        }
        catch (error) {
            logger_1.default.error(`Failed to publish batch to ${topic}`, error);
            throw error;
        }
    }
    /**
     * Disconnect producer
     */
    async disconnect() {
        if (this.connected) {
            try {
                await this.producer.disconnect();
                this.connected = false;
                logger_1.default.info('✓ Kafka Producer disconnected');
            }
            catch (error) {
                logger_1.default.error('Error disconnecting producer:', error);
            }
        }
    }
    /**
     * Get producer status
     */
    getStatus() {
        return {
            connected: this.connected,
            status: this.connected ? 'operational' : 'disconnected',
        };
    }
}
exports.KafkaProducer = KafkaProducer;
exports.default = KafkaProducer;
//# sourceMappingURL=producer.js.map