/**
 * Real-time Collaboration Features
 * Agent communication, shared workspaces, and team coordination
 */
interface Collaboration {
    id: string;
    type: 'task-discussion' | 'code-review' | 'design-feedback' | 'status-update';
    participants: string[];
    startTime: Date;
    messages: Message[];
    status: 'active' | 'archived';
    priority: 'low' | 'medium' | 'high';
}
interface Message {
    id: string;
    author: string;
    content: string;
    timestamp: Date;
    attachments?: string[];
    reactions?: Record<string, number>;
}
interface SharedWorkspace {
    id: string;
    name: string;
    owner: string;
    members: string[];
    documents: Document[];
    createdAt: Date;
    updatedAt: Date;
}
interface Document {
    id: string;
    title: string;
    content: string;
    author: string;
    lastEditedBy: string;
    lastEditedAt: Date;
    version: number;
    status: 'draft' | 'review' | 'approved' | 'published';
}
export declare class CollaborationManager {
    private collaborations;
    private workspaces;
    private conversations;
    private idSeq;
    /**
     * Start collaboration
     */
    startCollaboration(type: Collaboration['type'], participants: string[], priority?: string): Collaboration;
    /**
     * Add message to collaboration
     */
    addMessage(collaborationId: string, author: string, content: string, attachments?: string[]): Message | null;
    /**
     * Create shared workspace
     */
    createWorkspace(name: string, owner: string, members: string[]): SharedWorkspace;
    /**
     * Add document to workspace
     */
    addDocument(workspaceId: string, title: string, content: string, author: string): Document | null;
    /**
     * Edit document
     */
    editDocument(workspaceId: string, documentId: string, content: string, editor: string): Document | null;
    /**
     * Review document
     */
    reviewDocument(workspaceId: string, documentId: string, status: Document['status']): Document | null;
    /**
     * Get team activity
     */
    getTeamActivity(): any[];
    /**
     * Get collaboration status
     */
    getCollaborationStatus(collaborationId: string): any;
    /**
     * Get team summary
     */
    getTeamSummary(): any;
}
export default CollaborationManager;
//# sourceMappingURL=collaboration.d.ts.map