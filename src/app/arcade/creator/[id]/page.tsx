import type { Metadata } from "next";
import { notFound } from "next/navigation";
import ArcadeCreatorView from "@/components/Arcade/ArcadeCreatorView";
import { isCreatorId } from "@/lib/server/arcade";
import { arcadeCreator } from "@/lib/server/arcade-feed";

type PageProps = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
    const { id } = await params;
    const creator = isCreatorId(id) ? await arcadeCreator(id).catch(() => null) : null;
    if (!creator) return { title: "Arcade", robots: { index: false, follow: true } };
    const description = `${creator.name} tarafından Hanogt Engine ile yapılıp Arcade'de yayımlanan oyunlar.`;
    return {
        title: `${creator.name} — Arcade`,
        description,
        openGraph: { title: `${creator.name} — Hanogt Arcade`, description },
        twitter: { card: "summary", title: `${creator.name} — Hanogt Arcade`, description },
    };
}

/** A creator's page: the id is a one-way hash of their address (creatorIdOf), never the address itself. */
export default async function ArcadeCreatorPage({ params }: PageProps) {
    const { id } = await params;
    if (!isCreatorId(id)) notFound();
    return <ArcadeCreatorView creatorId={id} />;
}
