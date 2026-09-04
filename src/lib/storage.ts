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

// Save project to Firestore
export const saveProjectToCloud = async (email: string, project: Omit<Project, "email" | "createdAt">) => {
    try {
        const projectRef = doc(db, COLLECTION_NAME, project.id);
        const files: ProjectFile[] = project.files?.length
            ? project.files
            : [{ name: project.name, lang: project.lang, code: project.code, order: 0 }];
        if (files.length > 50 || files.some((file) => file.code.length > 500_000)) {
            throw new Error("Proje, 50 dosya veya dosya başına 500.000 karakter sınırını aşıyor.");
        }
        const [oldFiles, existingProject] = await Promise.all([
            getDocs(collection(projectRef, "files")),
            getDoc(projectRef),
        ]);
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
            ...(!existingProject.exists() ? { createdAt: serverTimestamp() } : {}),
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
        return true;
    } catch (error) {
        console.error("Error saving project:", error);
        return false;
    }
};

// Get all projects for a user from Firestore
export const getProjectsFromCloud = async (email: string): Promise<Project[]> => {
    try {
        const q = query(
            collection(db, COLLECTION_NAME),
            where("email", "==", email),
            orderBy("createdAt", "desc")
        );
        const querySnapshot = await getDocs(q);
        const projects = await Promise.all(querySnapshot.docs.map(async (projectDoc) => {
            const fileSnapshot = await getDocs(query(collection(projectDoc.ref, "files"), orderBy("order", "asc")));
            const files = fileSnapshot.docs.map((file) => ({ id: file.id, ...file.data() } as ProjectFile));
            return { id: projectDoc.id, ...projectDoc.data(), files } as Project;
        }));
        return projects;
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

export const deleteProject = (email: string, id: number) => {
    try {
        const all: LegacyProject[] = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
        const filtered = all.filter(p => !(p.email === email && p.id === id));
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
