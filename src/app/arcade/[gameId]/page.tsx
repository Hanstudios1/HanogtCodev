import type { Metadata } from "next";
import ArcadePlayerView from "@/components/Arcade/ArcadePlayerView";
import { assertGameId, type ArcadeRecord } from "@/lib/server/arcade";
import { runServerQuery } from "@/lib/server/firebase-rest";

type PageProps = { params: Promise<{ gameId: string }> };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
    const gameId = assertGameId((await params).gameId);
    if (!gameId) return { title: "Arcade" };
    try {
        const [record] = await runServerQuery<ArcadeRecord>({
            collectionId: "arcade_games",
            where: [{ field: "projectId", op: "EQUAL", value: gameId }],
            select: ["title", "description", "authorName"],
            limit: 1,
        });
        if (!record) return { title: "Arcade" };
        const description = (record.description || `${record.authorName ?? "Bir geliştirici"} tarafından Hanogt Engine ile yapıldı. Tarayıcıda oyna.`).slice(0, 180);
        return { title: `${record.title} — Arcade`, description, openGraph: { title: record.title, description } };
    } catch {
        return { title: "Arcade" };
    }
}

export default async function ArcadeGamePage({ params }: PageProps) {
    const { gameId } = await params;
    return <ArcadePlayerView gameId={gameId} />;
}
