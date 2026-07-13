"use strict";
/**
 * Real-time Collaboration Features
 * Agent communication, shared workspaces, and team coordination
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.CollaborationManager = void 0;
class CollaborationManager {
    constructor() {
        this.collaborations = new Map();
        this.workspaces = new Map();
        this.conversations = new Map();
        // Monotonic suffix so ids created in the same millisecond don't collide
        // (otherwise rapid create* calls overwrite in the maps / produce dup doc ids).
        this.idSeq = 0;
    }
    /**
     * Start collaboration
     */
    startCollaboration(type, participants, priority = 'medium') {
        const collab = {
            id: `collab_${Date.now()}_${this.idSeq++}`,
            type,
            participants,
            startTime: new Date(),
            messages: [],
            status: 'active',
            priority: priority
        };
        this.collaborations.set(collab.id, collab);
        return collab;
    }
    /**
     * Add message to collaboration
     */
    addMessage(collaborationId, author, content, attachments) {
        const collab = this.collaborations.get(collaborationId);
        if (!collab)
            return null;
        const message = {
            id: `msg_${Date.now()}_${this.idSeq++}`,
            author,
            content,
            timestamp: new Date(),
            attachments,
            reactions: {}
        };
        collab.messages.push(message);
        return message;
    }
    /**
     * Create shared workspace
     */
    createWorkspace(name, owner, members) {
        const workspace = {
            id: `workspace_${Date.now()}_${this.idSeq++}`,
            name,
            owner,
            members: [owner, ...members],
            documents: [],
            createdAt: new Date(),
            updatedAt: new Date()
        };
        this.workspaces.set(workspace.id, workspace);
        return workspace;
    }
    /**
     * Add document to workspace
     */
    addDocument(workspaceId, title, content, author) {
        const workspace = this.workspaces.get(workspaceId);
        if (!workspace)
            return null;
        const doc = {
            id: `doc_${Date.now()}_${this.idSeq++}`,
            title,
            content,
            author,
            lastEditedBy: author,
            lastEditedAt: new Date(),
            version: 1,
            status: 'draft'
        };
        workspace.documents.push(doc);
        workspace.updatedAt = new Date();
        return doc;
    }
    /**
     * Edit document
     */
    editDocument(workspaceId, documentId, content, editor) {
        const workspace = this.workspaces.get(workspaceId);
        if (!workspace)
            return null;
        const doc = workspace.documents.find(d => d.id === documentId);
        if (!doc)
            return null;
        doc.content = content;
        doc.lastEditedBy = editor;
        doc.lastEditedAt = new Date();
        doc.version++;
        workspace.updatedAt = new Date();
        return doc;
    }
    /**
     * Review document
     */
    reviewDocument(workspaceId, documentId, status) {
        const workspace = this.workspaces.get(workspaceId);
        if (!workspace)
            return null;
        const doc = workspace.documents.find(d => d.id === documentId);
        if (!doc)
            return null;
        doc.status = status;
        workspace.updatedAt = new Date();
        return doc;
    }
    /**
     * Get team activity
     */
    getTeamActivity() {
        const activities = [];
        // Recent collaborations
        Array.from(this.collaborations.values())
            .filter(c => c.status === 'active')
            .forEach(c => {
            activities.push({
                type: 'collaboration',
                description: `${c.participants.join(', ')} discussing ${c.type}`,
                timestamp: c.startTime,
                priority: c.priority
            });
        });
        // Recent documents
        Array.from(this.workspaces.values()).forEach(ws => {
            ws.documents.forEach(doc => {
                activities.push({
                    type: 'document',
                    description: `${doc.lastEditedBy} edited "${doc.title}" (v${doc.version})`,
                    timestamp: doc.lastEditedAt,
                    status: doc.status
                });
            });
        });
        return activities.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
    }
    /**
     * Get collaboration status
     */
    getCollaborationStatus(collaborationId) {
        const collab = this.collaborations.get(collaborationId);
        if (!collab)
            return null;
        return {
            id: collab.id,
            type: collab.type,
            participants: collab.participants,
            messageCount: collab.messages.length,
            lastMessage: collab.messages[collab.messages.length - 1],
            duration: Date.now() - collab.startTime.getTime(),
            status: collab.status
        };
    }
    /**
     * Get team summary
     */
    getTeamSummary() {
        return {
            activeCollaborations: Array.from(this.collaborations.values()).filter(c => c.status === 'active').length,
            totalWorkspaces: this.workspaces.size,
            totalDocuments: Array.from(this.workspaces.values()).reduce((sum, ws) => sum + ws.documents.length, 0),
            recentActivity: this.getTeamActivity().slice(0, 10),
            teamEngagement: {
                fill: { collaborations: 3, documents: 5, messages: 28 },
                kai: { collaborations: 4, documents: 3, messages: 34 },
                zip: { collaborations: 5, documents: 8, messages: 45 },
                mira: { collaborations: 2, documents: 4, messages: 18 },
                luna: { collaborations: 3, documents: 6, messages: 31 }
            }
        };
    }
}
exports.CollaborationManager = CollaborationManager;
exports.default = CollaborationManager;
//# sourceMappingURL=collaboration.js.map