import { redirect } from "next/navigation";
import { comparePath } from "@/lib/compare";

export default function CompareIndex() {
  redirect(comparePath("texas", "ohio-state"));
}
