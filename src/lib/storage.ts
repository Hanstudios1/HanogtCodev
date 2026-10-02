import { db } from "./firebase";
import {
    collection,
    doc,
    setDoc,
    getDocs,
    getDoc,
    query,
    where,
    orderBy,
    serverTimestamp,
    deleteField,
    type Timestamp,
    writeBatch,
} from "firebase/firestore";

export interface ProjectFile {
    id?: string;
    name: string;
    lang: string;
    code: string;
    order: number;
}

export interface Project {
    id: string;
    name: string;
    lang: string;
    code: string;
    date: string;
    email: string;
    createdAt?: Timestamp | Date | string;
    isMultiTab?: boolean;
    files?: ProjectFile[];
}

const COLLECTION_NAME = "projects";

/** Result of saving to the cloud: "limit" when the plan's project limit (Free 10, Plus 40) is reached. */
export type CloudSaveResult = { ok: true } | { ok: false; reason: "limit"; limit: number; plan: string } | { ok: false; reason: "error" };

/**
 * New projects are created by the server (POST /api/projects), which applies
 * the plan's project limit; the files are then written here directly.
 */
async function createCloudProject(id: string, name: string): Promise<CloudSaveResult> {
    const response = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ id, name }),
    });
    const payload = await response.json().catch(() => ({})) as { error?: string; limit?: number; plan?: string };
    if (response.status === 403 && payload.error === "project_limit") return { ok: false, reason: "limit", limit: Number(payload.limit) || 0, plan: payload.plan ?? "free" };
    return response.ok ? { ok: true } : { ok: false, reason: "error" };
}

// Save project to Firestore
export const saveProjectToCloud = async (rawEmail: string, project: Omit<Project, "email" | "createdAt">): Promise<CloudSaveResult> => {
    const email = rawEmail.toLowerCase();
    try {
        const projectRef = doc(db, COLLECTION_NAME, project.id);
        const files: ProjectFile[] = project.files?.length
            ? project.files
            : [{ name: project.name, lang: project.lang, code: project.code, order: 0 }];
        if (files.length > 50 || files.some((file) => file.code.length > 500_000)) {
            throw new Error("Proje, 50 dosya veya dosya başına 500.000 karakter sınırını aşıyor.");
        }
        // Reading a project that doesn't exist yet is refused by the rules: treat it as new.
        const current = await getDoc(projectRef).catch(() => null);
        if (!current?.exists()) {
            const created = await createCloudProject(project.id, project.name);
            if (!created.ok) return created;
        }
        const oldFiles = await getDocs(collection(projectRef, "files"));
        const batch = writeBatch(db);
        batch.set(projectRef, {
            id: project.id,
            name: project.name,
            lang: project.lang,
            date: project.date,
            isMultiTab: files.length > 1,
            schemaVersion: 2,
            fileCount: files.length,
            entryFile: files[0]?.name || project.name,
            code: files.length === 1 ? files[0].code : deleteField(),
            email,
            updatedAt: serverTimestamp(),
        }, { merge: true });
        oldFiles.docs.forEach((file) => batch.delete(file.ref));
        files.forEach((file, index) => {
            const fileId = `${String(index).padStart(3, "0")}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 80) || "file"}`;
            batch.set(doc(projectRef, "files", fileId), {
                name: file.name.slice(0, 120),
                lang: file.lang,
                code: file.code,
                order: index,
                updatedAt: serverTimestamp(),
            });
        });
        await batch.commit();
        return { ok: true };
    } catch (error) {
        console.error("Error saving project:", error);
        return { ok: false, reason: "error" };
    }
};

function timestampMillis(value: unknown): number {
    if (!value) return 0;
    if (typeof value === "string") return Date.parse(value) || 0;
    if (value instanceof Date) return value.getTime();
    if (typeof value === "object" && value !== null && "toMillis" in value && typeof (value as Timestamp).toMillis === "function") {
        return (value as Timestamp).toMillis();
    }
    return 0;
}

// Get all projects for a user from Firestore
export const getProjectsFromCloud = async (email: string): Promise<Project[]> => {
    try {
        // Equality-only query: it needs no composite index and, unlike
        // `orderBy("createdAt")`, it also returns older documents that were
        // saved before `createdAt` existed. Sorting happens client-side.
        const q = query(collection(db, COLLECTION_NAME), where("email", "==", email.toLowerCase()));
        const querySnapshot = await getDocs(q);
        const projects = await Promise.all(querySnapshot.docs.map(async (projectDoc) => {
            const fileSnapshot = await getDocs(query(collection(projectDoc.ref, "files"), orderBy("order", "asc")));
            const files = fileSnapshot.docs.map((file) => ({ id: file.id, ...file.data() } as ProjectFile));
            return { id: projectDoc.id, ...projectDoc.data(), files } as Project & { updatedAt?: unknown };
        }));
        return projects.sort((a, b) => (
            timestampMillis(b.updatedAt ?? b.createdAt) - timestampMillis(a.updatedAt ?? a.createdAt)
        ) || (Number(b.id) || 0) - (Number(a.id) || 0));
    } catch (error) {
        console.error("Error getting projects:", error);
        return [];
    }
};

// Delete project from Firestore
export const deleteProjectFromCloud = async (projectId: string) => {
    try {
        const projectRef = doc(db, COLLECTION_NAME, projectId);
        const files = await getDocs(collection(projectRef, "files"));
        const batch = writeBatch(db);
        files.docs.forEach((file) => batch.delete(file.ref));
        batch.delete(projectRef);
        await batch.commit();
        return true;
    } catch (error) {
        console.error("Error deleting project:", error);
        return false;
    }
};

// Legacy localStorage functions for fallback
export interface LegacyProject {
    id: number;
    name: string;
    lang: string;
    code: string;
    date: string;
    email: string;
    isMultiTab?: boolean;
    files?: ProjectFile[];
}

const STORAGE_KEY = "hanogt_projects";

export const saveProject = (email: string, project: Omit<LegacyProject, "email">) => {
    try {
        const existing: LegacyProject[] = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
        const index = existing.findIndex(p => p.id === project.id && p.email === email);
        if (index >= 0) existing[index] = { ...project, email };
        else existing.unshift({ ...project, email });
        const serialized = JSON.stringify(existing.slice(0, 20));
        if (serialized.length <= 1_000_000) localStorage.setItem(STORAGE_KEY, serialized);
    } catch {
        // Local cache is best-effort; Firestore remains the source of truth.
    }
};

export const getProjects = (email: string): LegacyProject[] => {
    if (!email) return [];
    try {
        const all: LegacyProject[] = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
        return all.filter(p => p.email === email);
    } catch {
        return [];
    }
};

export const deleteProject = (email: string, id: number | string) => {
    try {
        const all: LegacyProject[] = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
        // Cloud ids are strings; comparing as strings also removes the local copy.
        const filtered = all.filter(p => !(p.email === email && String(p.id) === String(id)));
        localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
    } catch {
        localStorage.removeItem(STORAGE_KEY);
    }
};

// Rename project
export const renameProject = async (email: string, id: number | string, newName: string) => {
    // Update in localStorage
    try {
        const all: LegacyProject[] = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
        const index = all.findIndex(p => p.email === email && String(p.id) === String(id));
        if (index >= 0) {
            all[index].name = newName;
            localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
        }
    } catch {
        localStorage.removeItem(STORAGE_KEY);
    }

    // Update in cloud
    try {
        const projectRef = doc(db, COLLECTION_NAME, String(id));
        await setDoc(projectRef, { name: newName }, { merge: true });
        return true;
    } catch (error) {
        console.error("Error renaming project:", error);
        return false;
    }
};
