/**
 * Deployment Manager
 * Automated deployment, rollback, and monitoring
 */
interface Deployment {
    id: string;
    version: string;
    timestamp: Date;
    status: 'pending' | 'deploying' | 'succeeded' | 'failed' | 'rolled_back';
    environment: 'dev' | 'staging' | 'production';
    services: string[];
    commits: string[];
    metrics: {
        startTime: Date;
        endTime?: Date;
        duration?: number;
        errorRate?: number;
    };
}
interface HealthCheck {
    service: string;
    status: 'healthy' | 'degraded' | 'unhealthy';
    latency: number;
    errors: number;
    uptime: number;
}
export declare class DeploymentManager {
    private deployments;
    private healthChecks;
    private rollbackStack;
    private idSeq;
    /**
     * Start deployment
     */
    startDeployment(version: string, environment: string, services: string[]): Deployment;
    /**
     * Get recent commits
     */
    private getRecentCommits;
    /**
     * Complete deployment
     */
    completeDeployment(deploymentId: string, success: boolean): Deployment | null;
    /**
     * Health check for service
     */
    checkServiceHealth(service: string): HealthCheck;
    /**
     * Get deployment status
     */
    getDeploymentStatus(deploymentId: string): Deployment | null;
    /**
     * Rollback to previous deployment
     */
    rollback(deploymentId: string): Deployment | null;
    /**
     * Get deployment history
     */
    getDeploymentHistory(environment: string, limit?: number): Deployment[];
    /**
     * Get current service health
     */
    getCurrentHealth(): Record<string, HealthCheck>;
    /**
     * Get deployment metrics
     */
    getDeploymentMetrics(deploymentId: string): any;
    /**
     * Get deployment readiness
     */
    getDeploymentReadiness(environment: string): any;
}
export default DeploymentManager;
//# sourceMappingURL=deployment-manager.d.ts.map