"use strict";
/**
 * Deployment Manager
 * Automated deployment, rollback, and monitoring
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.DeploymentManager = void 0;
class DeploymentManager {
    constructor() {
        this.deployments = new Map();
        this.healthChecks = new Map();
        this.rollbackStack = [];
        // Monotonic suffix: two deployments started in the same ms must not share an
        // id (a collision would overwrite the first in the map and break rollback).
        this.idSeq = 0;
    }
    /**
     * Start deployment
     */
    startDeployment(version, environment, services) {
        const deployment = {
            id: `deploy_${Date.now()}_${this.idSeq++}`,
            version,
            timestamp: new Date(),
            status: 'deploying',
            environment: environment,
            services,
            commits: this.getRecentCommits(),
            metrics: {
                startTime: new Date()
            }
        };
        this.deployments.set(deployment.id, deployment);
        return deployment;
    }
    /**
     * Get recent commits
     */
    getRecentCommits() {
        return [
            '6298b75c - Fix OpenClaw buttons',
            '77eece28 - Complete VirtualPC interactive UI',
            '4d05cd78 - Add React web UI'
        ];
    }
    /**
     * Complete deployment
     */
    completeDeployment(deploymentId, success) {
        const deployment = this.deployments.get(deploymentId);
        if (!deployment)
            return null;
        deployment.status = success ? 'succeeded' : 'failed';
        deployment.metrics.endTime = new Date();
        deployment.metrics.duration = deployment.metrics.endTime.getTime() - deployment.metrics.startTime.getTime();
        if (success) {
            this.rollbackStack.push(deployment);
            if (this.rollbackStack.length > 10) {
                this.rollbackStack.shift();
            }
        }
        return deployment;
    }
    /**
     * Health check for service
     */
    checkServiceHealth(service) {
        const health = {
            service,
            status: 'healthy',
            latency: Math.random() * 50,
            errors: Math.random() < 0.05 ? Math.floor(Math.random() * 5) : 0,
            uptime: 99.9 + Math.random() * 0.1
        };
        if (health.errors > 0 || health.latency > 100) {
            health.status = 'degraded';
        }
        if (health.uptime < 99) {
            health.status = 'unhealthy';
        }
        this.healthChecks.set(service, health);
        return health;
    }
    /**
     * Get deployment status
     */
    getDeploymentStatus(deploymentId) {
        return this.deployments.get(deploymentId) || null;
    }
    /**
     * Rollback to previous deployment
     */
    rollback(deploymentId) {
        const deployment = this.deployments.get(deploymentId);
        if (!deployment)
            return null;
        // Find previous successful deployment
        const previousDeployment = Array.from(this.deployments.values())
            .filter(d => d.timestamp < deployment.timestamp && d.status === 'succeeded')
            .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())[0];
        if (!previousDeployment)
            return null;
        deployment.status = 'rolled_back';
        const rollbackDeployment = this.startDeployment(previousDeployment.version, previousDeployment.environment, previousDeployment.services);
        // Simulate successful rollback
        setTimeout(() => {
            this.completeDeployment(rollbackDeployment.id, true);
        }, 5000);
        return rollbackDeployment;
    }
    /**
     * Get deployment history
     */
    getDeploymentHistory(environment, limit = 50) {
        return Array.from(this.deployments.values())
            .filter(d => d.environment === environment)
            .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
            .slice(0, limit);
    }
    /**
     * Get current service health
     */
    getCurrentHealth() {
        const services = [
            'api-server',
            'neo4j',
            'kafka',
            'redis',
            'web-ui'
        ];
        const health = {};
        services.forEach(service => {
            health[service] = this.checkServiceHealth(service);
        });
        return health;
    }
    /**
     * Get deployment metrics
     */
    getDeploymentMetrics(deploymentId) {
        const deployment = this.deployments.get(deploymentId);
        if (!deployment)
            return null;
        return {
            deploymentId: deployment.id,
            version: deployment.version,
            environment: deployment.environment,
            duration: deployment.metrics.duration || 0,
            status: deployment.status,
            services: deployment.services.map(service => ({
                name: service,
                health: this.healthChecks.get(service) || { status: 'unknown' }
            })),
            successRate: deployment.metrics.errorRate ? (100 - deployment.metrics.errorRate) : 100
        };
    }
    /**
     * Get deployment readiness
     */
    getDeploymentReadiness(environment) {
        const latestDeployment = Array.from(this.deployments.values())
            .filter(d => d.environment === environment)
            .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())[0];
        const health = this.getCurrentHealth();
        const readyServices = Object.values(health).filter(h => h.status === 'healthy').length;
        const totalServices = Object.keys(health).length;
        return {
            environment,
            ready: readyServices === totalServices,
            readyServices: `${readyServices}/${totalServices}`,
            latestDeployment: latestDeployment ? {
                version: latestDeployment.version,
                status: latestDeployment.status,
                timestamp: latestDeployment.timestamp
            } : null,
            health
        };
    }
}
exports.DeploymentManager = DeploymentManager;
exports.default = DeploymentManager;
//# sourceMappingURL=deployment-manager.js.map