import { redirect } from "next/navigation";

// Friends moved into Hanogt Social; old links and bookmarks land on its Friends screen.
export default function FriendsPage() {
    redirect("/social");
}
