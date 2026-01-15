import { db } from "./firebase";
import {
    collection,
    doc,
    setDoc,
    getDocs,
    deleteDoc,
    query,
    where,
    orderBy,
    serverTimestamp
} from "firebase/firestore";

export interface Project {
    id: string;
    name: string;
    lang: string;
    code: string;
    date: string;
    email: string;
    createdAt?: any;
    isMultiTab?: boolean;
}

const COLLECTION_NAME = "projects";

// Save project to Firestore
export const saveProjectToCloud = async (email: string, project: Omit<Project, "email" | "createdAt">) => {
    try {
        const projectRef = doc(db, COLLECTION_NAME, project.id);
        await setDoc(projectRef, {
            ...project,
            email,
            createdAt: serverTimestamp(),
        });
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
        const projects: Project[] = [];
        querySnapshot.forEach((doc) => {
            projects.push({ id: doc.id, ...doc.data() } as Project);
        });
        return projects;
    } catch (error) {
        console.error("Error getting projects:", error);
        return [];
    }
};

// Delete project from Firestore
export const deleteProjectFromCloud = async (projectId: string) => {
    try {
        await deleteDoc(doc(db, COLLECTION_NAME, projectId));
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
}

const STORAGE_KEY = "hanogt_projects";

export const saveProject = (email: string, project: Omit<LegacyProject, "email">) => {
    const existing: LegacyProject[] = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    const index = existing.findIndex(p => p.id === project.id && p.email === email);

    if (index >= 0) {
        existing[index] = { ...project, email };
    } else {
        existing.unshift({ ...project, email });
    }

    localStorage.setItem(STORAGE_KEY, JSON.stringify(existing));

    // Also save to cloud
    saveProjectToCloud(email, {
        id: String(project.id),
        name: project.name,
        lang: project.lang,
        code: project.code,
        date: project.date,
    });
};

export const getProjects = (email: string): LegacyProject[] => {
    if (!email) return [];
    const all: LegacyProject[] = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    return all.filter(p => p.email === email);
};

export const deleteProject = (email: string, id: number) => {
    const all: LegacyProject[] = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    const filtered = all.filter(p => !(p.email === email && p.id === id));
    localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));

    // Also delete from cloud
    deleteProjectFromCloud(String(id));
};

// Rename project
export const renameProject = async (email: string, id: number | string, newName: string) => {
    // Update in localStorage
    const all: LegacyProject[] = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    const index = all.findIndex(p => p.email === email && String(p.id) === String(id));

    if (index >= 0) {
        all[index].name = newName;
        localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
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
