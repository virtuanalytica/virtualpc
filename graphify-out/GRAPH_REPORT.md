# Graph Report - /home/knight2/virtualpc  (2026-06-15)

## Corpus Check
- cluster-only mode — file stats not available

## Summary
- 1833 nodes · 3049 edges · 97 communities (74 shown, 23 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS · INFERRED: 7 edges (avg confidence: 0.8)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `05eaa62c`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- [[_COMMUNITY_Community 0|Community 0]]
- [[_COMMUNITY_Community 1|Community 1]]
- [[_COMMUNITY_Community 2|Community 2]]
- [[_COMMUNITY_Community 3|Community 3]]
- [[_COMMUNITY_Community 4|Community 4]]
- [[_COMMUNITY_Community 5|Community 5]]
- [[_COMMUNITY_Community 6|Community 6]]
- [[_COMMUNITY_Community 7|Community 7]]
- [[_COMMUNITY_Community 8|Community 8]]
- [[_COMMUNITY_Community 9|Community 9]]
- [[_COMMUNITY_Community 10|Community 10]]
- [[_COMMUNITY_Community 11|Community 11]]
- [[_COMMUNITY_Community 12|Community 12]]
- [[_COMMUNITY_Community 13|Community 13]]
- [[_COMMUNITY_Community 14|Community 14]]
- [[_COMMUNITY_Community 15|Community 15]]
- [[_COMMUNITY_Community 16|Community 16]]
- [[_COMMUNITY_Community 17|Community 17]]
- [[_COMMUNITY_Community 18|Community 18]]
- [[_COMMUNITY_Community 19|Community 19]]
- [[_COMMUNITY_Community 20|Community 20]]
- [[_COMMUNITY_Community 21|Community 21]]
- [[_COMMUNITY_Community 22|Community 22]]
- [[_COMMUNITY_Community 23|Community 23]]
- [[_COMMUNITY_Community 24|Community 24]]
- [[_COMMUNITY_Community 25|Community 25]]
- [[_COMMUNITY_Community 26|Community 26]]
- [[_COMMUNITY_Community 27|Community 27]]
- [[_COMMUNITY_Community 28|Community 28]]
- [[_COMMUNITY_Community 29|Community 29]]
- [[_COMMUNITY_Community 30|Community 30]]
- [[_COMMUNITY_Community 31|Community 31]]
- [[_COMMUNITY_Community 32|Community 32]]
- [[_COMMUNITY_Community 33|Community 33]]
- [[_COMMUNITY_Community 34|Community 34]]
- [[_COMMUNITY_Community 35|Community 35]]
- [[_COMMUNITY_Community 36|Community 36]]
- [[_COMMUNITY_Community 37|Community 37]]
- [[_COMMUNITY_Community 38|Community 38]]
- [[_COMMUNITY_Community 39|Community 39]]
- [[_COMMUNITY_Community 40|Community 40]]
- [[_COMMUNITY_Community 41|Community 41]]
- [[_COMMUNITY_Community 42|Community 42]]
- [[_COMMUNITY_Community 43|Community 43]]
- [[_COMMUNITY_Community 44|Community 44]]
- [[_COMMUNITY_Community 45|Community 45]]
- [[_COMMUNITY_Community 46|Community 46]]
- [[_COMMUNITY_Community 47|Community 47]]
- [[_COMMUNITY_Community 48|Community 48]]
- [[_COMMUNITY_Community 49|Community 49]]
- [[_COMMUNITY_Community 50|Community 50]]
- [[_COMMUNITY_Community 51|Community 51]]
- [[_COMMUNITY_Community 52|Community 52]]
- [[_COMMUNITY_Community 53|Community 53]]
- [[_COMMUNITY_Community 54|Community 54]]
- [[_COMMUNITY_Community 55|Community 55]]
- [[_COMMUNITY_Community 56|Community 56]]
- [[_COMMUNITY_Community 57|Community 57]]
- [[_COMMUNITY_Community 58|Community 58]]
- [[_COMMUNITY_Community 59|Community 59]]
- [[_COMMUNITY_Community 60|Community 60]]
- [[_COMMUNITY_Community 61|Community 61]]
- [[_COMMUNITY_Community 62|Community 62]]
- [[_COMMUNITY_Community 63|Community 63]]
- [[_COMMUNITY_Community 64|Community 64]]
- [[_COMMUNITY_Community 65|Community 65]]
- [[_COMMUNITY_Community 66|Community 66]]
- [[_COMMUNITY_Community 67|Community 67]]
- [[_COMMUNITY_Community 68|Community 68]]
- [[_COMMUNITY_Community 69|Community 69]]
- [[_COMMUNITY_Community 70|Community 70]]
- [[_COMMUNITY_Community 71|Community 71]]
- [[_COMMUNITY_Community 72|Community 72]]
- [[_COMMUNITY_Community 73|Community 73]]
- [[_COMMUNITY_Community 74|Community 74]]
- [[_COMMUNITY_Community 75|Community 75]]
- [[_COMMUNITY_Community 76|Community 76]]
- [[_COMMUNITY_Community 77|Community 77]]
- [[_COMMUNITY_Community 78|Community 78]]
- [[_COMMUNITY_Community 79|Community 79]]
- [[_COMMUNITY_Community 80|Community 80]]
- [[_COMMUNITY_Community 81|Community 81]]
- [[_COMMUNITY_Community 82|Community 82]]
- [[_COMMUNITY_Community 83|Community 83]]
- [[_COMMUNITY_Community 84|Community 84]]
- [[_COMMUNITY_Community 85|Community 85]]
- [[_COMMUNITY_Community 86|Community 86]]
- [[_COMMUNITY_Community 87|Community 87]]
- [[_COMMUNITY_Community 88|Community 88]]
- [[_COMMUNITY_Community 89|Community 89]]
- [[_COMMUNITY_Community 90|Community 90]]
- [[_COMMUNITY_Community 91|Community 91]]
- [[_COMMUNITY_Community 92|Community 92]]
- [[_COMMUNITY_Community 94|Community 94]]
- [[_COMMUNITY_Community 95|Community 95]]
- [[_COMMUNITY_Community 96|Community 96]]

## God Nodes (most connected - your core abstractions)
1. `logger` - 67 edges
2. `AuthSystem` - 38 edges
3. `CEOAuditLogger` - 26 edges
4. `GuardrailsAgent` - 25 edges
5. `TaskFacilitator` - 24 edges
6. `ContainmentGuard` - 24 edges
7. `initialize()` - 23 edges
8. `LightRAGClient` - 23 edges
9. `NumeraiDataFetcher` - 20 edges
10. `OpenClawEDBBridge` - 19 edges

## Surprising Connections (you probably didn't know these)
- `record()` --calls--> `bestEffortPublish()`  [INFERRED]
  src/commit-audit.ts → src/integrations/kafka/shared.ts
- `initialize()` --calls--> `ingestAssetRegistry()`  [INFERRED]
  src/index.ts → src/integrations/lightrag/asset-graph.ts
- `AutoResearchOptions` --references--> `LightRAGClient`  [EXTRACTED]
  src/integrations/autoresearch/index.ts → src/integrations/lightrag/client.ts
- `addTask()` --calls--> `bestEffortPublish()`  [INFERRED]
  src/task-engine.ts → src/integrations/kafka/shared.ts
- `setTaskStatus()` --calls--> `bestEffortPublish()`  [INFERRED]
  src/task-engine.ts → src/integrations/kafka/shared.ts

## Import Cycles
- None detected.

## Communities (97 total, 23 thin omitted)

### Community 0 - "Community 0"
Cohesion: 0.05
Nodes (53): buildCodegraph(), buildReferences(), CACHE_PATH, Codegraph, CodegraphFile, CodegraphSymbol, getCodegraph(), indexFile() (+45 more)

### Community 1 - "Community 1"
Cohesion: 0.08
Nodes (29): AgentRuntime, ContainmentError, ContainmentGuard, ContainmentHooks, DECISION_RANK, SEVERITY_RANK, containmentGuard, buildDefaultPolicy() (+21 more)

### Community 2 - "Community 2"
Cohesion: 0.06
Nodes (28): FacilitatorConfig, TaskFacilitation, AuthRequest, AuthToken, SyncConfig, SyncResult, PaperclipTask, VirtualPCTask (+20 more)

### Community 3 - "Community 3"
Cohesion: 0.07
Nodes (50): applyOverrides(), assertSafeIdent(), CATEGORIES, Category, CATEGORY_I18N, CATEGORY_KEYS, checkPortalToken(), CHEMISTRY_FILE (+42 more)

### Community 4 - "Community 4"
Cohesion: 0.09
Nodes (48): COORDINATOR, DEV_LEGS, DeveloperLeg, Effort, FeatureItem, FeatureStage, LEG_IDS, LegBuild (+40 more)

### Community 5 - "Community 5"
Cohesion: 0.06
Nodes (33): deepFreeze(), loadOpenApiSpec(), setupOpenApiRoutes(), setupAuditRoutes(), setupSpecialistRoutes(), setupGitHubRoutes(), setupContainmentRoutes(), getGpuAvailable() (+25 more)

### Community 6 - "Community 6"
Cohesion: 0.07
Nodes (9): AuthMiddleware, AuthSystem, base32Decode(), base32Encode(), generateSecret(), generateTotp(), hotp(), otpauthUri() (+1 more)

### Community 7 - "Community 7"
Cohesion: 0.04
Nodes (26): agentCommands, AgentScorecard, Artifact, artifacts, cliSessionLog, GameMilestone, gameMilestones, MAX_COMPLETED_TASKS_PER_AGENT (+18 more)

### Community 8 - "Community 8"
Cohesion: 0.06
Nodes (12): CEOAuditLogger, AuditRetentionScheduler, AuthRouteDeps, DEFAULT_LOGIN_ANOMALY_CONFIG, FLAG_WEIGHTS, LoginAnomalyConfig, LoginAnomalyFlag, LoginAnomalyMonitor (+4 more)

### Community 9 - "Community 9"
Cohesion: 0.08
Nodes (43): addConnection(), addTool(), CATALOG_PATH, catalogState, CONNECTIONS_PATH, connectionsState, DATA_DIR, decryptConfigSecrets() (+35 more)

### Community 10 - "Community 10"
Cohesion: 0.07
Nodes (14): AUDIT_PATH, InferenceAudit, InferenceEvent, LOG_DIR, DISK_PRESSURE_PCT, IDLE_UNLOAD_BUDGET_MS, LOG_DIR, OLLAMA_DOWN_TICKS (+6 more)

### Community 11 - "Community 11"
Cohesion: 0.07
Nodes (4): APIInterceptor, BatchingEngine, CachingLayer, CostAnalyzer

### Community 12 - "Community 12"
Cohesion: 0.10
Nodes (23): AcquireActionResult, ActiveAction, ActiveActionInput, ActiveActionKind, boundedTtl(), cleanText(), CoordinationEvent, CoordinationSnapshot (+15 more)

### Community 13 - "Community 13"
Cohesion: 0.11
Nodes (12): ensureDeps(), GuardrailsAgent, DEFAULT_RULES, AgentHealthSnapshot, AlertCategory, DetectionRule, GuardrailsAlert, GuardrailsIncident (+4 more)

### Community 14 - "Community 14"
Cohesion: 0.13
Nodes (21): FieldCrypto, activate(), ActivationResult, calculatePrice(), COMMERCE_PATH, CommerceState, consumeTokens(), createPaymentIntent() (+13 more)

### Community 15 - "Community 15"
Cohesion: 0.09
Nodes (30): ActiveActionLike, AgentDailyManagementSummary, AgentWorkSummaryForDay, buildAgentSummary(), buildDailyManagementOverview(), buildTerminalSessionSummary(), CoordinationSnapshotLike, DailyManagementOverview (+22 more)

### Community 16 - "Community 16"
Cohesion: 0.10
Nodes (25): AGENT_MODEL_ROUTES, chatAsAgent(), chatViaClaudeCli(), chatViaKimiCli(), chatViaOllama(), CLAUDE_TIMEOUT_MS, claudeAuthLikelyOk(), DESIGNER_AGENTS (+17 more)

### Community 17 - "Community 17"
Cohesion: 0.10
Nodes (24): CLOUD_FRAGMENTS, evaluateProbe(), GPU_LOCAL_FRAGMENTS, GpuProbe, GpuState, isCloudModel(), isGpuDependent(), ModelResolution (+16 more)

### Community 18 - "Community 18"
Cohesion: 0.09
Nodes (11): AnalyticsMetric, DashboardStats, metrics, router, stats, PaperclipBridge, ActivityLog, CollaborationEvent (+3 more)

### Community 19 - "Community 19"
Cohesion: 0.14
Nodes (25): secretOrEnv(), approve(), budget(), ensureState(), execute(), ExecuteResult, getStripe(), list() (+17 more)

### Community 20 - "Community 20"
Cohesion: 0.11
Nodes (4): CacheManager, CacheOptions, CacheStats, cacheManager

### Community 21 - "Community 21"
Cohesion: 0.09
Nodes (23): allSeedNodes(), assertSafeIdent(), autoRoleEdges(), CatalogIngestResult, CATEGORIES, Category, CATEGORY_I18N, CATEGORY_REL (+15 more)

### Community 22 - "Community 22"
Cohesion: 0.09
Nodes (12): GuardResult, setupAuthRoutes(), LoginRequest, ROLE_PERMISSIONS, RolePermissions, TwoFactorChallenge, User, UserRole (+4 more)

### Community 23 - "Community 23"
Cohesion: 0.13
Nodes (18): buildCapitalizationReport(), CapitalizationReport, DEVELOPMENT_TYPES, parseFeatureCommits(), ParseOptions, RESEARCH_TYPES, BalanceSheet, CapitalizationPolicy (+10 more)

### Community 26 - "Community 26"
Cohesion: 0.11
Nodes (18): AUDIT_FILE, AUDIT_ROTATE_MB, BROKERS, bumpBucket(), COST_FILE, CostBucket, CostState, getCostState() (+10 more)

### Community 27 - "Community 27"
Cohesion: 0.12
Nodes (16): DATA_DIR, lr(), notifyGovernance(), registerVirtuAnalyticaRoutes(), SAMPLE_CATALOG_PATH, CatalogModel, getCategories(), getI18n() (+8 more)

### Community 28 - "Community 28"
Cohesion: 0.12
Nodes (7): AutonomousSessionManager, SessionCommit, SessionConfig, SessionProgressReport, SessionTaskUpdate, SessionWarning, WorkSession

### Community 29 - "Community 29"
Cohesion: 0.12
Nodes (12): CacheEntry, MemoryStatus, QueryResult, RateLimitEntry, Context, Decision, INDEXES, Node (+4 more)

### Community 30 - "Community 30"
Cohesion: 0.17
Nodes (17): artifact(), boolEnv(), DEFAULT_OUT, DEFAULT_SCRIPT, DEFAULT_STATE, detectGraphify(), getGraphifyStatus(), GraphifyArtifact (+9 more)

### Community 31 - "Community 31"
Cohesion: 0.14
Nodes (17): slug(), CatalogCounts, CatalogFormat, emptyModel(), normalize(), normalizeGenericJson(), parseCollibraCsv(), parseCsv() (+9 more)

### Community 32 - "Community 32"
Cohesion: 0.18
Nodes (14): load(), registerSpectroscopyRoutes(), runs, SpectrumRun, STORE, detectPeaks(), mad(), median() (+6 more)

### Community 33 - "Community 33"
Cohesion: 0.13
Nodes (3): Backup, BackupManager, RecoveryPlan

### Community 34 - "Community 34"
Cohesion: 0.18
Nodes (17): createThread(), ensureLoaded(), flushSync(), FORUM_PATH, ForumReply, ForumState, ForumTeam, ForumThread (+9 more)

### Community 35 - "Community 35"
Cohesion: 0.17
Nodes (17): ensureLoaded(), flushSync(), getBrief(), KAMI_PATH, KamiBrief, KamiDocType, KamiLanguage, KamiState (+9 more)

### Community 36 - "Community 36"
Cohesion: 0.14
Nodes (8): ApiKeyAuthOptions, ApiKeyRequest, ApiKeyInfo, ApiKeyManager, ApiKeyRecord, IssuedApiKey, toInfo(), VerifyResult

### Community 38 - "Community 38"
Cohesion: 0.15
Nodes (4): Achievement, Challenge, Event, SeasonalEventsManager

### Community 39 - "Community 39"
Cohesion: 0.18
Nodes (12): AuthRequest, DecodedToken, extractToken(), generateToken(), getAgentByApiKey(), getPermissionsByRole(), isValidApiKey(), optionalAuth() (+4 more)

### Community 41 - "Community 41"
Cohesion: 0.14
Nodes (6): JSONL_PATH, LOG_DIR, SCRIPTS_DIR, SNAP_PATH, VitalsService, VitalsSnapshot

### Community 42 - "Community 42"
Cohesion: 0.16
Nodes (11): AuditEvent, AuditEventSeverity, AuditEventType, AuditRetentionConfig, AuditRetentionStatus, DEFAULT_AUDIT_RETENTION, countByIp(), gradeFromScore() (+3 more)

### Community 43 - "Community 43"
Cohesion: 0.14
Nodes (5): Collaboration, CollaborationManager, Document, Message, SharedWorkspace

### Community 44 - "Community 44"
Cohesion: 0.21
Nodes (14): defaultEntries(), ensureLoaded(), flushSync(), getEntry(), getLineage(), GOVERNANCE_PATH, GovernanceEntry, GovernanceKind (+6 more)

### Community 48 - "Community 48"
Cohesion: 0.17
Nodes (13): createPlan(), load(), Plan, PlanComment, plans, PlanSection, PlanStatus, registerPlanRoutes() (+5 more)

### Community 49 - "Community 49"
Cohesion: 0.17
Nodes (3): AuditEvent, AuditLogger, SecurityAlert

### Community 50 - "Community 50"
Cohesion: 0.18
Nodes (3): Deployment, DeploymentManager, HealthCheck

### Community 51 - "Community 51"
Cohesion: 0.23
Nodes (13): AutoResearchOptions, critiqueSystemPrompt(), llm(), planSystemPrompt(), probe(), probeCodegraph(), probeCorpus(), probeStatic() (+5 more)

### Community 53 - "Community 53"
Cohesion: 0.15
Nodes (7): load(), ParamDef, queries, QueryTarget, registerQueryRoutes(), SavedQuery, STORE

### Community 54 - "Community 54"
Cohesion: 0.22
Nodes (13): defaultEntries(), ensureLoaded(), flushSync(), getEntry(), listEntries(), save(), scheduleSave(), state (+5 more)

### Community 55 - "Community 55"
Cohesion: 0.21
Nodes (3): AdvancedAnalytics, AnalyticsEvent, Insight

### Community 56 - "Community 56"
Cohesion: 0.22
Nodes (6): ArtistDashboard, CEODashboard, CTODashboard, DeveloperDashboard, SpecialistDashboards, TechArtistDashboard

### Community 58 - "Community 58"
Cohesion: 0.27
Nodes (11): DataSourceConfig, FetchResult, Competition, Entity, EntityRelationship, Feature, NumeraiDailyData, Portfolio (+3 more)

### Community 62 - "Community 62"
Cohesion: 0.18
Nodes (9): AthenaVerdict, ClassifiedFailure, classifyFailures(), decideGate(), FailureClass, GateDecision, GateInput, INFRA_FAILURE_PATTERNS (+1 more)

### Community 63 - "Community 63"
Cohesion: 0.21
Nodes (4): CodeRecord, normalize(), randomCode(), RecoveryCodeManager

### Community 67 - "Community 67"
Cohesion: 0.25
Nodes (9): AuditReport, Finding, httpHead(), httpHeadLocal(), PAGES, runAndCache(), runAudit(), scanFile() (+1 more)

### Community 68 - "Community 68"
Cohesion: 0.22
Nodes (3): MonitoringService, RequestMetrics, SystemMetrics

### Community 69 - "Community 69"
Cohesion: 0.27
Nodes (8): registerAssetMirrorRoutes(), analyzeMirrorCoverage(), Asset, CategoryCoverage, MirrorCoverageReport, RemediationItem, stem(), WEB_TARGET

### Community 70 - "Community 70"
Cohesion: 0.29
Nodes (9): DATA_DIR, DataQualityReport, DatasetReport, extractRecords(), registerDataQualityRoutes(), scan(), DatasetProfile, profileDataset() (+1 more)

### Community 71 - "Community 71"
Cohesion: 0.29
Nodes (8): ColumnProfile, detectOutliers(), Finding, isBlank(), JSONValue, median(), profileColumn(), typeOf()

### Community 73 - "Community 73"
Cohesion: 0.22
Nodes (6): Asset, ingestAssetRegistry(), readRegistry(), REGISTRY_PATH, GraphNode, QueryResult

### Community 74 - "Community 74"
Cohesion: 0.27
Nodes (7): setupQualityRoutes(), gradeFromScore(), QualityDashboard, QualityDashboardSnapshot, QualityThreat, readJsonIfExists(), REPORT_PATHS

### Community 75 - "Community 75"
Cohesion: 0.20
Nodes (8): ConnectorCapabilityInputs, ConnectorCapabilityLevel, ConnectorSource, DatabaseInspectionSummary, MetadataRepositoryAsset, RoleAction, RoleRecommendation, ToolExecutionCapability

### Community 77 - "Community 77"
Cohesion: 0.33
Nodes (6): bootstrapIndex(), CorpusChunk, embedTexts(), ensureVectorIndex(), ingestChunks(), search()

### Community 79 - "Community 79"
Cohesion: 0.28
Nodes (8): bestEffortPublish(), BROKERS, ensureSharedProducer(), getKafkaBrokers(), isKafkaConnected(), isKafkaDisabled(), addTask(), setTaskStatus()

### Community 81 - "Community 81"
Cohesion: 0.25
Nodes (8): currentSprint(), defaultTaskPoolFor(), generateTask(), getGameStats(), makeSubtasks(), nextTaskId(), randomTickRate(), seedInitialTasks()

### Community 82 - "Community 82"
Cohesion: 0.29
Nodes (4): CAPABILITIES, capabilitiesForRoles(), Capability, capabilityBundleForRoles()

### Community 83 - "Community 83"
Cohesion: 0.25
Nodes (3): PRETRAINED_ROLES, PretrainedRole, RACIEntry

### Community 84 - "Community 84"
Cohesion: 0.48
Nodes (6): ingestGovernanceState(), IngestResult, ingestWikiState(), notifyGovernanceWrite(), notifyWikiWrite(), publishUpdate()

### Community 85 - "Community 85"
Cohesion: 0.29
Nodes (5): InferenceRequest, InferenceResponse, OllamaModelConfig, ExecutionConfig, ExecutionResult

### Community 86 - "Community 86"
Cohesion: 0.29
Nodes (3): internalWriteAuth(), InternalWriteAuthOptions, PROTECTED_WRITE_PATHS

### Community 87 - "Community 87"
Cohesion: 0.29
Nodes (4): DATA_DIR, FEEDBACK_JSON, REPORTS_JSONL, setupPlaytestRoutes()

### Community 88 - "Community 88"
Cohesion: 0.29
Nodes (3): registerSkills(), Skill, skills

### Community 89 - "Community 89"
Cohesion: 0.40
Nodes (4): BalanceReport, DeliveryRecord, tallyDeliveries(), WorkerTally

### Community 90 - "Community 90"
Cohesion: 0.33
Nodes (6): artifactPromptFor(), generateArtifactForCompletedTask(), getGameMilestones(), logWork(), tickEngine(), updateMilestones()

### Community 91 - "Community 91"
Cohesion: 0.33
Nodes (6): compactTaskHistory(), compactTasksInPlace(), isPlaceholderTask(), loadState(), saveOnExit(), saveState()

## Knowledge Gaps
- **454 isolated node(s):** `AgentMeta`, `COLOR_MAP`, `AGENT_MODELS`, `FacilitatorConfig`, `TaskFacilitation` (+449 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **23 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `logger` connect `Community 2` to `Community 0`, `Community 3`, `Community 4`, `Community 5`, `Community 7`, `Community 9`, `Community 10`, `Community 13`, `Community 14`, `Community 16`, `Community 17`, `Community 21`, `Community 22`, `Community 23`, `Community 26`, `Community 27`, `Community 28`, `Community 29`, `Community 30`, `Community 31`, `Community 34`, `Community 35`, `Community 39`, `Community 41`, `Community 42`, `Community 44`, `Community 54`, `Community 56`, `Community 58`, `Community 70`, `Community 73`, `Community 74`, `Community 77`, `Community 79`, `Community 84`, `Community 85`, `Community 86`, `Community 88`?**
  _High betweenness centrality (0.154) - this node is a cross-community bridge._
- **Why does `AuthSystem` connect `Community 6` to `Community 2`, `Community 5`, `Community 42`, `Community 14`, `Community 22`?**
  _High betweenness centrality (0.053) - this node is a cross-community bridge._
- **Why does `PaperclipBridge` connect `Community 18` to `Community 2`?**
  _High betweenness centrality (0.041) - this node is a cross-community bridge._
- **What connects `AgentMeta`, `COLOR_MAP`, `AGENT_MODELS` to the rest of the system?**
  _454 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.0523532522474881 - nodes in this community are weakly interconnected._
- **Should `Community 1` be split into smaller, more focused modules?**
  _Cohesion score 0.07706766917293233 - nodes in this community are weakly interconnected._
- **Should `Community 2` be split into smaller, more focused modules?**
  _Cohesion score 0.057912457912457915 - nodes in this community are weakly interconnected._