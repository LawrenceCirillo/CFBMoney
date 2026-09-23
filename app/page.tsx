import HomePageClient from "./HomePageClient";
import { seasonSnapshot } from "@/lib/season-snapshot";

export default function Home() {
  const records = Object.fromEntries(
    Object.entries(seasonSnapshot.teams).map(([slug, season]) => [slug, season.record]),
  );

  return <HomePageClient records={records} />;
}
