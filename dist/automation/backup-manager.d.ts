/**
 * Automated Backup & Recovery Manager
 * Database backups, snapshot management, and disaster recovery
 */
interface Backup {
    id: string;
    type: 'full' | 'incremental' | 'snapshot';
    database: string;
    timestamp: Date;
    size: number;
    status: 'completed' | 'failed' | 'in-progress';
    location: string;
    retention: Date;
    verified: boolean;
    restorePoint: boolean;
}
interface RecoveryPlan {
    id: string;
    name: string;
    rto: number;
    rpo: number;
    procedures: string[];
    tested: boolean;
    lastTested: Date;
}
export declare class BackupManager {
    private backups;
    private recoveryPlans;
    private backupSchedule;
    private idSeq;
    constructor();
    /**
     * Initialize backup schedule
     */
    private initializeBackupSchedule;
    /**
     * Initialize recovery plans
     */
    private initializeRecoveryPlans;
    /**
     * Create backup
     */
    createBackup(database: string, type: 'full' | 'incremental' | 'snapshot'): Backup;
    /**
     * Get backup status
     */
    getBackupStatus(backupId: string): Backup | null;
    /**
     * Restore from backup
     */
    restore(backupId: string): any;
    /**
     * Get backup history
     */
    getBackupHistory(database?: string, limit?: number): Backup[];
    /**
     * Get recovery plan
     */
    getRecoveryPlan(planId: string): RecoveryPlan | null;
    /**
     * Get all recovery plans
     */
    getAllRecoveryPlans(): RecoveryPlan[];
    /**
     * Test recovery plan
     */
    testRecoveryPlan(planId: string): any;
    /**
     * Get backup statistics
     */
    getBackupStatistics(): any;
    /**
     * Get backups grouped by database
     */
    private getBackupsByDatabase;
    /**
     * Cleanup old backups
     */
    cleanupOldBackups(): number;
    /**
     * Get disaster recovery status
     */
    getDisasterRecoveryStatus(): any;
}
export default BackupManager;
//# sourceMappingURL=backup-manager.d.ts.map