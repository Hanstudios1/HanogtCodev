import JoinGroupView from "@/components/Groups/JoinGroupView";

export default async function SocialJoinPage({ params }: { params: Promise<{ token: string }> }) {
    const { token } = await params;
    return <JoinGroupView token={token} />;
}
