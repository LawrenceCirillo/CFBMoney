import type { Metadata } from "next";
import { ComingSoon } from "@/components/ComingSoon";

export const metadata: Metadata = {
  title: "Compare",
};

export default function ComparePage() {
  return (
    <ComingSoon
      title="Compare"
      description="Side-by-side team budgets, wins, and efficiency metrics — shipping after V1 tables and profiles."
    />
  );
}
