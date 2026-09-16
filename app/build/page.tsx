import type { Metadata } from "next";
import { ComingSoon } from "@/components/ComingSoon";

export const metadata: Metadata = {
  title: "Build",
};

export default function BuildPage() {
  return (
    <ComingSoon
      title="Build a roster"
      description="Interactive budget sliders and resemblance matching — on the roadmap after core spending and moneyball views."
    />
  );
}
