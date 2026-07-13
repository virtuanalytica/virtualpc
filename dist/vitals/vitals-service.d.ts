export interface VitalsSnapshot {
    ts: string;
    load: {
        '1': number;
        '5': number;
        '15': number;
    };
    cpu_pct: number;
    cpu_temp_c?: number;
    mem_mb: {
        total: number;
        used: number;
        avail: number;
    };
    disk: {
        root_used_pct: number;
        root_free_gb: number;
        eds2_used_pct: number;
        eds2_free_gb: number;
    };
    gpus: Array<{
        i: number;
        util: number;
        mem_used: number;
        mem_total: number;
        temp: number;
        power: number;
    }>;
    gpu_procs: Array<{
        pid: number;
        gpu: number;
        mem_mb: number;
        name: string;
        agent: string;
        cmd: string;
    }>;
    ollama: {
        models: Array<any>;
    };
    services: {
        virtualpc_3100: number;
        ollama_11434: number;
    };
    resource_guard?: Record<string, any>;
}
export declare class VitalsService {
    private monitorChild;
    private gpuEnabled;
    constructor();
    isGpuEnabled(): boolean;
    setGpuEnabled(on: boolean): void;
    startMonitor(intervalSec?: number): void;
    stopMonitor(): void;
    getSnapshot(): Promise<VitalsSnapshot | null>;
    getHistory(windows?: Record<string, number | null>): Promise<Record<string, any>>;
    diskCandidates(opts?: {
        minMb?: number;
        limit?: number;
    }): Promise<Array<{
        path: string;
        size_mb: number;
        size_human: string;
        status: string;
    }>>;
    cleanGpu(): Promise<{
        before_mib: number;
        after_mib: number;
        freed_mib: number;
        unloaded: string[];
    }>;
}
export default VitalsService;
//# sourceMappingURL=vitals-service.d.ts.map