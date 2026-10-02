import { redirect } from "next/navigation";

// Direct messages live in Hanogt Social.
export default function MessagesPage() {
    redirect("/social");
}
