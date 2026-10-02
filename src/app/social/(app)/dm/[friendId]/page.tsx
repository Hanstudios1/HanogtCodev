import DmView from "@/components/Social/dm/DmView";

function decodeParam(value: string) {
    try {
        return decodeURIComponent(value);
    } catch {
        return value;
    }
}

export default async function SocialDmPage({ params }: { params: Promise<{ friendId: string }> }) {
    const { friendId } = await params;
    return <DmView email={decodeParam(friendId)} />;
}
